import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

let _animId = 0;

export function useTableState(tableId, buyIn, watch = false) {
  const { socket } = useSocket();
  const [tableState, setTableState] = useState(null);
  const [myCards, setMyCards] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [chat, setChat] = useState([]);
  const [actionRequired, setActionRequired] = useState(null);
  const [lastWinner, setLastWinner] = useState(null);
  const [revealedCards, setRevealedCards] = useState({}); // { playerId: [card, card] }
  const [joinError, setJoinError] = useState(null);

  // Transient animation events consumed by overlay layers
  const [animEvents, setAnimEvents] = useState([]);
  // Latest seats snapshot for street-bet capture at collect time
  const seatsRef = useRef([]);

  const pushAnim = useCallback((type, payload = {}) => {
    setAnimEvents(prev => [...prev, { id: ++_animId, type, ...payload }]);
  }, []);

  const consumeAnim = useCallback((id) => {
    setAnimEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const patch = useCallback((partial) => {
    setTableState(prev => prev ? { ...prev, ...partial } : partial);
  }, []);

  useEffect(() => {
    const s = socket.current;
    if (!s || !tableId) return;

    // Capture current bets for collect animation, then clear them visually
    function captureBets() {
      return seatsRef.current
        .filter(st => st.playerId && st.currentStreetBet > 0)
        .map(st => ({ position: st.position, amount: st.currentStreetBet }));
    }

    s.on('table_state', (state) => {
      setTableState(state);
      seatsRef.current = state.seats || [];
      if (state.phase === 'pre_flop' || state.phase === 'waiting') {
        setRevealedCards({});
        setLastWinner(null);
        if (state.phase === 'waiting') setMyCards([]);
      }
      if (state.actionPosition !== null && state.phase !== 'waiting') {
        const actionSeat = state.seats?.find(s => s.position === state.actionPosition);
        if (actionSeat?.playerId) {
          setActionRequired({ playerId: actionSeat.playerId, timeoutMs: 30000 });
        }
      }
      // New hand → deal animation
      if (state.phase === 'pre_flop') {
        const occupied = (state.seats || []).filter(st => st.playerId && ['active', 'all_in'].includes(st.status)).map(st => st.position);
        if (occupied.length >= 2) pushAnim('deal', { positions: occupied });
      }
    });

    s.on('error', (err) => {
      console.error('[useTableState] server error:', JSON.stringify(err));
      // Join-blocking errors get surfaced to the UI (incluye TABLE_NOT_FOUND:
      // la mesa ya no existe — típico al terminar un torneo — para no quedar
      // colgado en "Conectando a la mesa…" para siempre).
      if (['ANTI_RATHOLING', 'INVALID_BUYIN', 'INSUFFICIENT_CHIPS', 'TABLE_FULL', 'NOT_CLUB_MEMBER', 'TABLE_NOT_FOUND'].includes(err.code)) {
        setJoinError(err);
      }
    });
    s.on('table_updated', patch);

    s.on('community_updated', ({ community, phase }) => {
      // Street ended → collect bets into the pot
      const bets = captureBets();
      if (bets.length) pushAnim('collect', { bets });
      patch({ community, phase });
    });

    s.on('cards_dealt', ({ holeCards }) => {
      setMyCards(holeCards);
      setRevealedCards({});
      setLastWinner(null);
    });

    s.on('action_required', setActionRequired);

    s.on('action_broadcast', ({ playerId, type, amount, pot, stack, streetBet, currentBet }) => {
      // Chips fly from the actor's seat to their bet spot
      if (['call', 'raise', 'all_in'].includes(type) && amount > 0) {
        const seat = seatsRef.current.find(st => st.playerId === playerId);
        if (seat) pushAnim('bet_fly', { position: seat.position, amount });
      }
      // Fold → sus cartas vuelan boca abajo al muck (centro de la mesa)
      if (type === 'fold') {
        const seat = seatsRef.current.find(st => st.playerId === playerId);
        if (seat) pushAnim('muck', { position: seat.position });
      }
      setTableState(prev => {
        if (!prev) return prev;
        const seats = prev.seats.map(s =>
          s.playerId === playerId
            ? { ...s, stack: stack ?? s.stack, currentStreetBet: streetBet ?? s.currentStreetBet, status: type === 'fold' ? 'folded' : (type === 'all_in' ? 'all_in' : s.status) }
            : s
        );
        seatsRef.current = seats;
        return { ...prev, seats, pot, currentBet: currentBet ?? prev.currentBet };
      });
      setActionRequired(null);
    });

    s.on('pot_updated', ({ pot, pots, currentBet }) => patch({ pot, pots, currentBet }));

    s.on('hand_ended', ({ winners, hands, earlyEnd }) => {
      // Collect any remaining street bets, then fly the pot to the winner(s)
      const bets = captureBets();
      if (bets.length) pushAnim('collect', { bets });

      const winnerPositions = (winners || [])
        .map(w => seatsRef.current.find(st => st.playerId === w.playerId)?.position)
        .filter(p => p !== undefined);
      if (winnerPositions.length) {
        pushAnim('pot_to_winner', { positions: winnerPositions, delay: 0.7 });
      }

      setLastWinner({ winners, hands, earlyEnd });
      // Keep my cards visible through the showdown — they clear on next deal
      setActionRequired(null);
      const revealed = {};
      if (hands?.length) {
        for (const h of hands) {
          if (h.cards?.length) revealed[h.playerId] = h.cards;
        }
      }
      setRevealedCards(revealed);
    });

    s.on('cards_revealed', ({ playerId, cards }) => {
      setRevealedCards(prev => ({ ...prev, [playerId]: cards }));
    });

    s.on('runout_started', () => {
      pushAnim('runout');
      setActionRequired(null);
    });

    s.on('player_joined', ({ seat }) => {
      setTableState(prev => {
        if (!prev) return prev;
        const seats = prev.seats.map(s => s.position === seat.position ? seat : s);
        seatsRef.current = seats;
        return { ...prev, seats };
      });
    });

    s.on('player_left', ({ playerId }) => {
      setTableState(prev => {
        if (!prev) return prev;
        const seats = prev.seats.map(s => s.playerId === playerId ? { ...s, playerId: null, nickname: null, status: 'empty', cards: [] } : s);
        seatsRef.current = seats;
        return { ...prev, seats };
      });
    });

    s.on('reaction_received', ({ playerId, emoji }) => {
      const id = Date.now() + Math.random();
      setReactions(r => [...r, { id, playerId, emoji }]);
      setTimeout(() => setReactions(r => r.filter(x => x.id !== id)), 2200);
    });

    s.on('chat_received', (msg) => setChat(c => [...c.slice(-99), msg]));

    // Server-side join is idempotent (re-seats just resync state),
    // so we re-emit on every (re)connect to rejoin rooms and refetch cards.
    // Modo espectador (watch): solo mira — nunca se sienta ni paga buy-in.
    function doJoin() {
      if (watch) s.emit('watch_table', { tableId });
      else s.emit('join_table', { tableId, buyIn: parseFloat(buyIn) || 500 });
    }
    if (s.connected) doJoin();
    s.on('connect', doJoin);

    return () => {
      s.off('connect', doJoin);
      ['table_state','table_updated','community_updated','cards_dealt','action_required',
       'action_broadcast','pot_updated','hand_ended','player_joined','player_left',
       'reaction_received','chat_received','cards_revealed','runout_started'].forEach(ev => s.off(ev));
    };
  }, [tableId, socket, watch]);

  function sendAction(type, amount) {
    socket.current?.emit('game_action', { tableId, type, amount });
  }

  function sendReaction(emoji) {
    socket.current?.emit('send_reaction', { tableId, emoji });
  }

  function sendChat(text, type = 'chat') {
    socket.current?.emit('chat_message', { tableId, text, type });
  }

  function leaveTable() {
    socket.current?.emit(watch ? 'unwatch_table' : 'leave_table', { tableId });
  }

  function clearLastWinner() { setLastWinner(null); }

  function revealMyCards() {
    socket.current?.emit('reveal_cards', { tableId });
  }

  return {
    tableState, myCards, reactions, chat, actionRequired, lastWinner, revealedCards,
    animEvents, consumeAnim, joinError,
    clearLastWinner, sendAction, sendReaction, sendChat, leaveTable, revealMyCards,
  };
}
