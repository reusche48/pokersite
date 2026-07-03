import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../services/api';
import { PlayerSeat } from '../components/table/PlayerSeat';
import { Board } from '../components/table/Board';
import { ChipStack } from '../components/table/ChipStack';
import { AnimatedNumber } from '../components/common/AnimatedNumber';
import { useSoundManager } from '../hooks/useSoundManager';
import { useAuth } from '../context/AuthContext';

// Same visual layouts as the live table (PokerTable.jsx)
const LAYOUTS = {
  1: [
    { seat: { top: '88%', left: '50%' }, bet: { top: '66%', left: '50%' } },
  ],
  2: [
    { seat: { top: '7%', left: '50%' }, bet: { top: '30%', left: '50%' } },
    { seat: { top: '86%', left: '50%' }, bet: { top: '64%', left: '50%' } },
  ],
  3: [
    { seat: { top: '7%', left: '26%' }, bet: { top: '30%', left: '36%' } },
    { seat: { top: '7%', left: '74%' }, bet: { top: '30%', left: '64%' } },
    { seat: { top: '86%', left: '50%' }, bet: { top: '64%', left: '50%' } },
  ],
  4: [
    { seat: { top: '7%', left: '50%' }, bet: { top: '30%', left: '50%' } },
    { seat: { top: '45%', left: '92%' }, bet: { top: '45%', left: '76%' } },
    { seat: { top: '45%', left: '8%'  }, bet: { top: '45%', left: '24%' } },
    { seat: { top: '86%', left: '50%' }, bet: { top: '64%', left: '50%' } },
  ],
  5: [
    { seat: { top: '7%', left: '26%' }, bet: { top: '30%', left: '36%' } },
    { seat: { top: '7%', left: '74%' }, bet: { top: '30%', left: '64%' } },
    { seat: { top: '45%', left: '92%' }, bet: { top: '45%', left: '76%' } },
    { seat: { top: '45%', left: '8%'  }, bet: { top: '45%', left: '24%' } },
    { seat: { top: '86%', left: '50%' }, bet: { top: '64%', left: '50%' } },
  ],
  6: [
    { seat: { top: '7%', left: '30%' }, bet: { top: '30%', left: '38%' } },
    { seat: { top: '7%', left: '70%' }, bet: { top: '30%', left: '62%' } },
    { seat: { top: '45%', left: '92%' }, bet: { top: '45%', left: '76%' } },
    { seat: { top: '45%', left: '8%'  }, bet: { top: '45%', left: '24%' } },
    { seat: { top: '84%', left: '30%' }, bet: { top: '62%', left: '38%' } },
    { seat: { top: '84%', left: '70%' }, bet: { top: '62%', left: '62%' } },
  ],
};
const ASSIGN_ORDER = {
  1: [0],
  2: [1, 0],
  3: [2, 0, 1],
  4: [3, 2, 0, 1],
  5: [4, 3, 0, 1, 2],
  6: [5, 4, 3, 0, 1, 2],
};

const SUIT_CHAR = { s: '♠', h: '♥', d: '♦', c: '♣' };
const cardStr = c => c ? `${c.rank}${SUIT_CHAR[c.suit] || ''}` : '';
const STREET_NAMES = { flop: 'FLOP', turn: 'TURN', river: 'RIVER' };

function actionChatLine(a, nickname) {
  switch (a.action) {
    case 'post_sb': return `${nickname} pone la ciega pequeña ${a.amount}`;
    case 'post_bb': return `${nickname} pone la ciega grande ${a.amount}`;
    case 'fold': return `${nickname} se retira`;
    case 'check': return `${nickname} pasa`;
    case 'call': return `${nickname} iguala ${a.amount}`;
    case 'call_allin': return `${nickname} iguala ${a.amount} y va ALL-IN`;
    case 'raise': return `${nickname} sube ${a.amount}`;
    case 'all_in': return `${nickname} va ALL-IN con ${a.amount}`;
    case 'win': return `🏆 ${nickname} gana ${a.amount}${a.handName ? ` con ${a.handName}` : ''}`;
    default: return `${nickname} ${a.action} ${a.amount || ''}`;
  }
}

// Real pacing: respect the recorded timestamps, clamped so it never drags
function stepDelay(actions, i, speed) {
  const a = actions[i];
  if (!a) return 1000;
  let ms = 1000;
  const prev = actions[i - 1];
  if (prev?.at && a.at) {
    ms = new Date(a.at).getTime() - new Date(prev.at).getTime();
  }
  if (a.action?.startsWith('street_')) ms = Math.max(ms, 1400);
  ms = Math.min(Math.max(ms, 500), 4000);
  return ms / speed;
}

export function HandReplayPage({ shared = false }) {
  const { id, token } = useParams();
  const navigate = useNavigate();
  const { player } = useAuth();
  const { play, muted, toggleMute } = useSoundManager();
  const [hand, setHand] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [shareUrl, setShareUrl] = useState(null);
  const timer = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const url = shared ? `/hands/shared/${token}` : `/hands/${id}`;
    api.get(url)
      .then(({ data }) => setHand(data))
      .catch(e => setError(e.response?.data?.error || 'No se pudo cargar la mano'));
  }, [id, token, shared]);

  const parsed = useMemo(() => {
    if (!hand) return null;
    const j = v => (typeof v === 'string' ? JSON.parse(v || 'null') : v);
    return {
      players: j(hand.players_json) || [],
      actions: j(hand.actions_json) || [],
      winners: j(hand.winners_json) || [],
      finalCommunity: j(hand.community_json) || [],
    };
  }, [hand]);

  // ── Reconstruct full table state at the current step ──
  const state = useMemo(() => {
    if (!parsed) return null;
    const { players, actions, winners } = parsed;

    // Initial stacks: final - wins + total invested during the hand
    const invested = {}, wins = {};
    for (const a of actions) {
      if (!a.playerId) continue;
      if (a.action === 'win') wins[a.playerId] = (wins[a.playerId] || 0) + a.amount;
      else if (a.amount > 0) invested[a.playerId] = (invested[a.playerId] || 0) + a.amount;
    }
    const stacks = {};
    for (const p of players) {
      stacks[p.playerId] = p.stack - (wins[p.playerId] || 0) + (invested[p.playerId] || 0);
    }

    const status = {};     // active | folded | all_in
    const streetBets = {}; // chips in front of each player this street
    const sbBb = {};       // playerId -> 'sb' | 'bb'
    const winnersSoFar = new Set();
    for (const p of players) status[p.playerId] = 'active';

    let pot = 0;
    let community = [];
    let phase = 'pre_flop';
    let lastAction = null;
    const chatLog = [];
    const nickOf = pid => players.find(p => p.playerId === pid)?.nickname || '?';

    let lastReaction = null;
    for (let i = 0; i < step && i < actions.length; i++) {
      const a = actions[i];
      if (a.action === 'chat') {
        chatLog.push({ id: i, who: nickOf(a.playerId), text: a.text || '', kind: 'player', emote: a.chatType === 'emote' });
        lastAction = a;
        continue;
      }
      if (a.action === 'reaction') {
        // Float the emoji only when we just stepped onto this event
        if (i === step - 1) lastReaction = { id: `r-${i}`, playerId: a.playerId, emoji: a.emoji };
        chatLog.push({ id: i, who: nickOf(a.playerId), text: a.emoji, kind: 'player', emote: true });
        lastAction = a;
        continue;
      }
      if (a.action?.startsWith('street_')) {
        community = a.community || community;
        phase = a.action.replace('street_', '');
        for (const k of Object.keys(streetBets)) streetBets[k] = 0;
        const newCards = community.slice(phase === 'flop' ? 0 : community.length - 1);
        chatLog.push({ id: i, who: 'Dealer', text: `— ${STREET_NAMES[phase] || phase.toUpperCase()}: ${newCards.map(cardStr).join(' ')} —`, kind: 'street' });
      } else if (a.playerId) {
        if (a.action === 'post_sb') sbBb[a.playerId] = 'sb';
        if (a.action === 'post_bb') sbBb[a.playerId] = 'bb';
        if (a.action === 'fold') status[a.playerId] = 'folded';
        if (a.action === 'all_in' || a.action === 'call_allin') status[a.playerId] = 'all_in';
        if (a.action === 'win') {
          stacks[a.playerId] += a.amount;
          winnersSoFar.add(a.playerId);
          for (const k of Object.keys(streetBets)) streetBets[k] = 0;
        } else if (a.amount > 0) {
          stacks[a.playerId] -= a.amount;
          streetBets[a.playerId] = (streetBets[a.playerId] || 0) + a.amount;
          if (stacks[a.playerId] <= 0) status[a.playerId] = 'all_in';
        }
        const w = winners.find(x => x.playerId === a.playerId);
        chatLog.push({
          id: i, who: 'Dealer', kind: a.action,
          text: actionChatLine({ ...a, handName: a.action === 'win' ? w?.handName : undefined }, nickOf(a.playerId)),
        });
      }
      pot = a.potAfter ?? pot;
      lastAction = a;
    }

    // Dealer = seat right before the SB poster (heads-up: dealer IS the SB)
    const sbPlayer = actions.find(a => a.action === 'post_sb')?.playerId;
    const ordered = [...players].sort((a, b) => a.seat - b.seat);
    let dealerSeat = null;
    if (sbPlayer) {
      const sbIdx = ordered.findIndex(p => p.playerId === sbPlayer);
      dealerSeat = ordered.length === 2
        ? ordered[sbIdx]?.seat
        : ordered[(sbIdx - 1 + ordered.length) % ordered.length]?.seat;
    }

    return { stacks, status, streetBets, sbBb, pot, community, phase, lastAction, chatLog, dealerSeat, winnersSoFar, lastReaction };
  }, [parsed, step]);

  const total = parsed?.actions.length || 0;
  const finished = step >= total;

  // ── Autoplay with real timing + sounds ──
  useEffect(() => {
    if (!playing || !parsed) return;
    if (step >= total) { setPlaying(false); return; }
    const next = parsed.actions[step];
    timer.current = setTimeout(() => {
      if (next?.action?.startsWith('street_')) play('card_deal');
      else if (next?.action === 'win') play('chip_win');
      else if (next?.amount > 0) play('chip_bet');
      setStep(s => s + 1);
    }, stepDelay(parsed.actions, step, speed));
    return () => clearTimeout(timer.current);
  }, [playing, step, parsed, speed]);

  // Auto-scroll replay chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.chatLog?.length]);

  // ── Visual seat layout: same circular hero-first assignment as the live table ──
  const seatToVisual = useMemo(() => {
    if (!parsed) return new Map();
    const occupied = [...parsed.players].sort((a, b) => a.seat - b.seat);
    const heroIdx = occupied.findIndex(p => p.playerId === player?.id);
    const circular = heroIdx >= 0
      ? [...occupied.slice(heroIdx), ...occupied.slice(0, heroIdx)]
      : occupied;
    const n = Math.min(occupied.length, 6);
    const layout = LAYOUTS[n] || LAYOUTS[6];
    const order = ASSIGN_ORDER[n] || ASSIGN_ORDER[6];
    const map = new Map();
    circular.forEach((p, i) => {
      const slot = layout[order[i]];
      if (slot) map.set(p.seat, slot);
    });
    return map;
  }, [parsed, player?.id]);

  async function share() {
    try {
      const { data } = await api.post(`/hands/${id}/share`);
      const url = `${window.location.origin}/replay/shared/${data.token}`;
      await navigator.clipboard.writeText(url);
      setShareUrl(url);
    } catch {
      setError('No se pudo generar el link');
    }
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1a3a1a] flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="bg-green-700 px-6 py-2 rounded-lg font-bold">Volver</button>
        </div>
      </div>
    );
  }
  if (!hand || !parsed || !state) {
    return <div className="min-h-screen bg-[#1a3a1a] flex items-center justify-center text-green-200">Cargando replay...</div>;
  }

  const { players } = parsed;
  const la = state.lastAction;

  return (
    <div className="h-screen flex flex-col" style={{
      background: `
        radial-gradient(ellipse at 50% 30%, rgba(120,20,30,0.35) 0%, transparent 60%),
        repeating-linear-gradient(45deg, #3d0e14 0, #3d0e14 2px, #350c11 2px, #350c11 14px),
        #350c11
      `,
    }}>
      {/* Top bar — same as live table */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 text-gray-300 text-xs font-semibold z-10">
        <div className="flex gap-4 items-center">
          <button onClick={() => navigate(shared ? '/' : '/historial')} className="hover:text-white transition">← VOLVER</button>
          <span className="text-gray-600">|</span>
          <span className="text-yellow-500 font-black tracking-wider">⏵ REPLAY</span>
          <span className="text-gray-400">Mano #{hand.hand_number}</span>
        </div>
        <div className="text-gray-400">{hand.game_type?.toUpperCase() || 'HOLDEM'} — {new Date(hand.ended_at).toLocaleString('es-PE')}</div>
        <div className="flex gap-4 items-center">
          <button onClick={toggleMute} className="hover:text-white transition">{muted ? '🔇' : '🔊'}</button>
          {!shared ? (
            <button onClick={share} className="bg-sky-800 hover:bg-sky-700 px-3 py-1 rounded font-bold text-white">🔗 COMPARTIR</button>
          ) : <span className="text-gray-500">replay compartido</span>}
        </div>
      </div>

      {shareUrl && (
        <div className="bg-sky-900/80 text-sky-200 text-xs text-center py-1.5 z-10">
          ✅ Link copiado: <span className="font-mono">{shareUrl}</span>
        </div>
      )}

      {/* Table area */}
      <div className="flex-1 relative overflow-hidden min-h-0 px-3 pb-[88px] pt-1">
        <div className="relative w-full h-full">

          {/* Wood rail */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(180deg, #5d3a1a 0%, #8b5e34 15%, #6d4420 50%, #5d3a1a 85%, #4a2e15 100%)',
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.6)',
            }}
          />
          {/* Green felt */}
          <div
            className="absolute rounded-full"
            style={{
              top: '7%', left: '3.5%', right: '3.5%', bottom: '7%',
              background: 'radial-gradient(ellipse at 50% 40%, #2e7d32 0%, #1b5e20 40%, #145214 100%)',
              boxShadow: 'inset 0 2px 20px rgba(0,0,0,0.3)',
            }}
          />
          <div
            className="absolute rounded-full border-2 border-green-400/15"
            style={{ top: '12%', left: '6.5%', right: '6.5%', bottom: '12%' }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span className="font-black tracking-widest" style={{
              fontSize: 'clamp(28px, 5vw, 52px)',
              color: 'rgba(255,255,255,0.05)',
              transform: 'translateY(-10%)',
            }}>
              ♠ POKERSITE
            </span>
          </div>

          {/* Community cards + pot */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Board community={state.community} phase={state.phase} play={play} />
              <div className="mt-3 flex items-center justify-center gap-3">
                {state.pot > 0 && <ChipStack amount={state.pot} size={16} showLabel={false} />}
                <span className="bg-black/50 text-yellow-300 font-bold text-sm px-3 py-1 rounded-full">
                  Bote <AnimatedNumber value={state.pot || 0} />
                </span>
              </div>
            </div>
          </div>

          {/* Bet chips on the felt — exactly like during the live hand */}
          <AnimatePresence>
            {players.map(p => {
              const bet = state.streetBets[p.playerId];
              if (!bet || bet <= 0) return null;
              const pos = seatToVisual.get(p.seat)?.bet;
              if (!pos) return null;
              return (
                <motion.div
                  key={`bet-${p.playerId}`}
                  className="absolute pointer-events-none z-10"
                  style={{ ...pos, transform: 'translate(-50%, -50%)' }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.25 }}
                >
                  <ChipStack amount={bet} size={20} />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Player seats — same nameplates as the live table */}
          {players.map(p => {
            const visualPos = seatToVisual.get(p.seat)?.seat || { top: '-100%', left: '-100%' };
            const topPct = parseFloat(visualPos.top);
            const cardsOnTop = topPct >= 25 && topPct < 80;
            const isMe = p.playerId === player?.id;
            const isActing = la?.playerId === p.playerId
              && !la?.action?.startsWith('street_')
              && !['win', 'chat', 'reaction'].includes(la?.action);
            const seatObj = {
              playerId: p.playerId,
              nickname: p.nickname,
              stack: state.stacks[p.playerId] ?? 0,
              status: state.status[p.playerId] || 'active',
              isSB: state.sbBb[p.playerId] === 'sb',
              isBB: state.sbBb[p.playerId] === 'bb',
            };
            return (
              <div
                key={p.playerId}
                className="absolute z-10"
                style={{ ...visualPos, transform: 'translate(-50%, -50%)' }}
              >
                <PlayerSeat
                  seat={seatObj}
                  myCards={isMe ? (p.cards || []) : []}
                  isMe={isMe}
                  isActionRequired={isActing}
                  reactions={state.lastReaction ? [state.lastReaction] : []}
                  revealedCards={p.cards || []}
                  isWinner={state.winnersSoFar.has(p.playerId)}
                  cardsOnTop={cardsOnTop}
                />
              </div>
            );
          })}

          {/* Dealer button */}
          {state.dealerSeat !== null && seatToVisual.get(state.dealerSeat) && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{
                ...seatToVisual.get(state.dealerSeat).bet,
                transform: 'translate(-50%, -50%) translate(34px, 18px)',
              }}
            >
              <div
                className="w-[26px] h-[26px] rounded-full flex items-center justify-center font-black text-[13px] text-gray-800"
                style={{
                  background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #e8e8e8 60%, #c9c9c9 100%)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.5), 0 0 8px rgba(255,255,255,0.25)',
                }}
              >
                D
              </div>
            </div>
          )}
        </div>

        {/* Replay chat — dealer narrates the hand exactly like the live chat */}
        <div className="absolute bottom-3 left-3 w-[300px] h-[140px] bg-black/75 rounded-lg border border-white/10 overflow-hidden z-30 backdrop-blur-sm flex flex-col">
          <div className="text-[9px] text-gray-500 font-bold px-2 pt-1 tracking-wider">CHAT DE LA MESA</div>
          <div className="flex-1 overflow-y-auto chat-scroll px-2 py-1 space-y-0.5">
            {state.chatLog.map(m => (
              <div key={m.id} className={`text-[11px] leading-tight ${
                m.kind === 'win' ? 'text-yellow-300 font-bold'
                : m.kind === 'street' ? 'text-sky-300 font-semibold'
                : m.kind === 'player' ? (m.emote ? 'text-purple-300 italic' : 'text-white')
                : 'text-gray-300'
              }`}>
                <span className={`font-bold ${m.kind === 'player' ? 'text-sky-400' : 'text-green-500'}`}>
                  {m.kind === 'player' ? m.who : 'Dealer'}:
                </span> {m.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Replay controls — where the action panel sits during a live hand */}
        <div className="absolute bottom-3 right-3 bg-black/75 rounded-lg border border-white/10 z-30 backdrop-blur-sm px-3 py-2 w-[370px]">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <button onClick={() => { setPlaying(false); setStep(0); }} className="replay-btn text-white text-xs">⏮</button>
            <button onClick={() => { setPlaying(false); setStep(s => Math.max(0, s - 1)); }} className="replay-btn text-white text-xs">◀</button>
            <button
              onClick={() => { if (finished) setStep(0); setPlaying(p => !p); }}
              className="bg-green-700 hover:bg-green-600 px-5 py-1.5 rounded-lg font-bold text-white text-sm"
            >
              {playing ? '⏸ Pausa' : finished ? '↻ Repetir' : '▶ Reproducir'}
            </button>
            <button onClick={() => { setPlaying(false); setStep(s => Math.min(total, s + 1)); }} className="replay-btn text-white text-xs">▶</button>
            <button onClick={() => { setPlaying(false); setStep(total); }} className="replay-btn text-white text-xs">⏭</button>
            <div className="flex gap-0.5 ml-1">
              {[1, 2, 4].map(x => (
                <button
                  key={x}
                  onClick={() => setSpeed(x)}
                  className={`text-[10px] font-bold px-1.5 py-1 rounded ${speed === x ? 'bg-yellow-600 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  {x}x
                </button>
              ))}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={total}
            value={step}
            onChange={e => { setPlaying(false); setStep(Number(e.target.value)); }}
            className="w-full accent-yellow-500"
          />
          <div className="text-center text-[10px] text-gray-500">Paso {step} / {total}</div>
        </div>
      </div>
    </div>
  );
}
