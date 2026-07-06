import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PlayerSeat } from './PlayerSeat';
import { Board } from './Board';
import { ActionPanel } from './ActionPanel';
import { WinnerOverlay } from './WinnerOverlay';
import { ChatBox } from './ChatBox';
import { ChipStack } from './ChipStack';
import { ChipFlightLayer } from './ChipFlightLayer';
import { DealLayer } from './DealLayer';
import { MuckLayer } from './MuckLayer';
import { WinnerParticles } from './WinnerParticles';
import { CinemaOverlay } from './CinemaOverlay';
import { DealerButton } from './DealerButton';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { PlayerProfileModal } from './PlayerProfileModal';
import { HandInfo } from './HandInfo';
import { useTableState } from '../../hooks/useTableState';
import { useSeatCoords } from '../../hooks/useSeatCoords';
import { useSoundManager } from '../../hooks/useSoundManager';
import { usePlayerNotes } from '../../hooks/usePlayerNotes';
import { useAuth } from '../../context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Predefined layouts — my seat always last = bottom center
// Seats straddle the table edge (rail), like Full Tilt
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
  // Symmetric 2-2-2: top pair, side pair, bottom pair (hero bottom-right,
  // facing the top-right player; bottom-left faces top-left)
  6: [
    { seat: { top: '7%', left: '30%' }, bet: { top: '30%', left: '38%' } },
    { seat: { top: '7%', left: '70%' }, bet: { top: '30%', left: '62%' } },
    { seat: { top: '45%', left: '92%' }, bet: { top: '45%', left: '76%' } },
    { seat: { top: '45%', left: '8%'  }, bet: { top: '45%', left: '24%' } },
    { seat: { top: '84%', left: '30%' }, bet: { top: '62%', left: '38%' } },
    { seat: { top: '84%', left: '70%' }, bet: { top: '62%', left: '62%' } },
  ],
};

export function PokerTable({ tableId, initialBuyIn }) {
  const { player } = useAuth();
  const navigate = useNavigate();
  const {
    tableState, myCards, reactions, chat, actionRequired, lastWinner, revealedCards,
    animEvents, consumeAnim, joinError,
    clearLastWinner, sendAction, sendReaction, sendChat, leaveTable, revealMyCards,
  } = useTableState(tableId, initialBuyIn);
  const { play, muted, toggleMute } = useSoundManager();
  const { getNote, saveNote } = usePlayerNotes();
  const [profilePlayer, setProfilePlayer] = useState(null); // seat being profiled
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [cinema, setCinema] = useState(false); // modo cine durante el run-out de all-in

  // Leaving mid-hand costs you the hand — confirm first
  function requestLeave() {
    const inHand = ['active', 'all_in'].includes(
      tableState?.seats?.find(s => s.playerId === player?.id)?.status
    ) && tableState?.phase !== 'waiting';
    if (inHand) setConfirmLeave(true);
    else { leaveTable(); navigate('/'); }
  }

  useEffect(() => {
    if (lastWinner?.winners?.some(w => w.playerId === player?.id)) {
      play('victory_fanfare');
    }
  }, [lastWinner]);

  // All-in run-out → heartbeat suspense sound + modo cine
  useEffect(() => {
    const ev = animEvents.find(e => e.type === 'runout');
    if (ev) {
      play('suspense');
      setCinema(true);
      consumeAnim(ev.id);
    }
  }, [animEvents]);

  // El modo cine termina cuando se resuelve la mano (o por seguridad a los 12s)
  useEffect(() => {
    if (lastWinner) setCinema(false);
  }, [lastWinner]);
  useEffect(() => {
    if (!cinema) return;
    const t = setTimeout(() => setCinema(false), 12000);
    return () => clearTimeout(t);
  }, [cinema]);

  // Memoized visual layout — only rebuilds when occupancy changes.
  // Seats are assigned CLOCKWISE starting from me, matching real turn order,
  // so action visibly flows around the table instead of jumping.
  const { seatToVisual, occupancyKey } = useMemo(() => {
    const seats = tableState?.seats || [];
    const mySeat = seats.find(s => s.playerId === player?.id);
    const occupied = seats.filter(s => s.playerId).sort((a, b) => a.position - b.position);
    const myPos = mySeat?.position ?? -1;

    // Circular order starting from my seat (me first, then next to act, etc.)
    const myIdx = occupied.findIndex(s => s.position === myPos);
    const circular = myIdx >= 0
      ? [...occupied.slice(myIdx), ...occupied.slice(0, myIdx)]
      : occupied;

    // Slot assignment order per layout: hero first, then clockwise on screen
    const ASSIGN_ORDER = {
      1: [0],
      2: [1, 0],
      3: [2, 0, 1],
      4: [3, 2, 0, 1],
      5: [4, 3, 0, 1, 2],
      6: [5, 4, 3, 0, 1, 2],
    };

    const n = Math.min(occupied.length, 6);
    const layout = LAYOUTS[n] || LAYOUTS[6];
    const order = ASSIGN_ORDER[n] || ASSIGN_ORDER[6];
    const map = new Map();
    circular.forEach((s, i) => {
      const slot = layout[order[i]];
      if (slot) map.set(s.position, slot);
    });
    return { seatToVisual: map, occupancyKey: circular.map(s => s.position).join(',') };
  }, [tableState?.seats?.map(s => s.playerId).join(','), player?.id]);

  const { containerRefCb, getSeatXY, getBetXY, centerXY, ready } = useSeatCoords(seatToVisual);

  if (!tableState) {
    if (joinError) {
      return (
        <div className="flex items-center justify-center h-screen bg-[#1a3a1a] text-white">
          <div className="bg-gray-900 rounded-2xl p-6 w-[380px] border border-red-800 text-center">
            <div className="text-4xl mb-3">🚫</div>
            <h3 className="font-bold text-lg mb-2">No puedes unirte</h3>
            <p className="text-sm text-gray-300 mb-5">{joinError.message || 'Error al unirse a la mesa'}</p>
            <button
              onClick={() => navigate('/')}
              className="bg-green-700 hover:bg-green-600 text-white font-bold px-6 py-2 rounded-lg"
            >
              Volver al lobby
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a3a1a] text-green-200 text-xl">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">♠</div>
          Conectando a la mesa...
        </div>
      </div>
    );
  }

  const mySeat = tableState.seats.find(s => s.playerId === player?.id);

  function getVisualPosition(seatIndex) {
    return seatToVisual.get(seatIndex)?.seat || { top: '-100%', left: '-100%' };
  }

  function getBetPosition(seatIndex) {
    return seatToVisual.get(seatIndex)?.bet || { top: '-100%', left: '-100%' };
  }

  return (
    <div className="h-screen flex flex-col" style={{
      background: `
        radial-gradient(ellipse at 50% 30%, rgba(120,20,30,0.35) 0%, transparent 60%),
        repeating-linear-gradient(45deg, #3d0e14 0, #3d0e14 2px, #350c11 2px, #350c11 14px),
        #350c11
      `,
    }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 text-gray-300 text-xs font-semibold z-10">
        <div className="flex gap-4">
          <button onClick={requestLeave} className="hover:text-white transition">STAND UP</button>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">Mano #{tableState.handNumber || 0}</span>
        </div>
        <div className="text-gray-400">{tableState.name || 'Mesa'} — {tableState.gameType?.replace('_',' ').toUpperCase() || 'HOLDEM'}</div>
        <div className="flex gap-4">
          <button onClick={toggleMute} className="hover:text-white transition">{muted ? '🔇 SILENCIO' : '🔊 SONIDO'}</button>
          <button onClick={requestLeave} className="hover:text-white transition">LOBBY</button>
        </div>
      </div>

      {/* Main area — table fills the screen, Full Tilt style; bottom strip reserved for floating panels */}
      <div className="flex-1 relative overflow-hidden min-h-0 px-3 pb-[88px] pt-1">
        <div ref={containerRefCb} className="relative w-full h-full">

          {/* Wood rail — stadium shape (straight sides, round ends) like a real table */}
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

          {/* Inner rim line */}
          <div
            className="absolute rounded-full border-2 border-green-400/15"
            style={{ top: '12%', left: '6.5%', right: '6.5%', bottom: '12%' }}
          />

          {/* Felt watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span className="font-black tracking-widest" style={{
              fontSize: 'clamp(28px, 5vw, 52px)',
              color: 'rgba(255,255,255,0.05)',
              transform: 'translateY(-10%)',
            }}>
              ♠ POKERSITE
            </span>
          </div>

          {/* Community cards + pot (center) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Board community={tableState.community} phase={tableState.phase} play={play} />
              <div className="mt-3 flex items-center justify-center gap-3">
                {tableState.pot > 0 && <ChipStack amount={tableState.pot} size={16} showLabel={false} />}
                <span className="bg-black/50 text-yellow-300 font-bold text-sm px-3 py-1 rounded-full">
                  Bote <AnimatedNumber value={tableState.pot || 0} />
                </span>
              </div>
            </div>
          </div>

          {/* Bet chip stacks on felt */}
          <AnimatePresence>
            {tableState.seats.map((seat, i) => {
              if (!seat.currentStreetBet || seat.currentStreetBet <= 0) return null;
              const pos = getBetPosition(i);
              return (
                <motion.div
                  key={`bet-${i}`}
                  className="absolute pointer-events-none z-10"
                  style={{ ...pos, transform: 'translate(-50%, -50%)' }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.25 }}
                >
                  <ChipStack amount={seat.currentStreetBet} size={20} />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Player seats with enter/exit transitions */}
          <AnimatePresence>
            {tableState.seats.map((seat, i) => {
              if (!seat.playerId) return null;
              const visualPos = getVisualPosition(i);
              // Top-row seats (on the rail): cards below the plate.
              // Side seats: cards above (clear of chat/panels).
              // Hero: cards beside the plate (handled via isMe).
              const topPct = parseFloat(visualPos.top);
              const cardsOnTop = topPct >= 25 && topPct < 80;
              return (
                <motion.div
                  key={seat.playerId}
                  className="absolute z-10"
                  style={{ ...visualPos, transform: 'translate(-50%, -50%)' }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.3 }}
                >
                  <PlayerSeat
                    seat={seat}
                    myCards={myCards}
                    isMe={seat.playerId === player?.id}
                    isActionRequired={actionRequired?.playerId === seat.playerId}
                    reactions={reactions}
                    revealedCards={revealedCards[seat.playerId]}
                    isWinner={lastWinner?.winners?.some(w => w.playerId === seat.playerId)}
                    cardsOnTop={cardsOnTop}
                    playerNote={getNote(seat.playerId)}
                    onProfileClick={() => setProfilePlayer(seat)}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Dealer button slides between seats */}
          <DealerButton getSeatXY={getSeatXY} centerXY={centerXY} dealerPosition={tableState.dealerPosition} heroPosition={mySeat?.position} />

          {/* Animation overlays */}
          <ChipFlightLayer
            animEvents={animEvents}
            consumeAnim={consumeAnim}
            getSeatXY={getSeatXY}
            getBetXY={getBetXY}
            centerXY={centerXY}
            ready={ready}
          />
          <DealLayer
            animEvents={animEvents}
            consumeAnim={consumeAnim}
            getSeatXY={getSeatXY}
            centerXY={centerXY}
            ready={ready}
          />
          <MuckLayer
            animEvents={animEvents}
            consumeAnim={consumeAnim}
            getSeatXY={getSeatXY}
            centerXY={centerXY}
            ready={ready}
          />
          <WinnerParticles
            lastWinner={lastWinner}
            seats={tableState.seats}
            getSeatXY={getSeatXY}
            ready={ready}
          />

          {/* Modo cine durante el run-out de all-in */}
          <CinemaOverlay active={cinema} />

          {/* Winner overlay */}
          <WinnerOverlay lastWinner={lastWinner} myPlayerId={player?.id} onDismiss={clearLastWinner} />
        </div>

        {/* Leave confirmation — only shown when leaving mid-hand */}
        <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
          <DialogContent className="w-[360px]">
            <DialogHeader>
              <DialogTitle>¿Salir en plena mano?</DialogTitle>
              <DialogDescription>
                Estás jugando una mano. Si sales ahora te retiras automáticamente y
                pierdes lo ya apostado en esta mano. El resto de tu stack vuelve a tu cuenta.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button className="flex-1 font-bold" onClick={() => setConfirmLeave(false)}>
                Seguir jugando
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => { setConfirmLeave(false); leaveTable(); navigate('/'); }}
              >
                Salir igualmente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Player profile modal */}
        {profilePlayer && (
          <PlayerProfileModal
            player={profilePlayer}
            currentNote={getNote(profilePlayer.playerId)}
            onSave={(tag, note, estimatedLevel) => saveNote(profilePlayer.playerId, tag, note, estimatedLevel)}
            onClose={() => setProfilePlayer(null)}
          />
        )}

        {/* Floating chat — bottom left over the background, Full Tilt style */}
        <div className="absolute bottom-3 left-3 w-[300px] h-[140px] bg-black/75 rounded-lg border border-white/10 overflow-hidden z-30 backdrop-blur-sm">
          <ChatBox
            chat={chat}
            onSend={(text) => sendChat(text, 'chat')}
            onEmote={(text) => sendChat(text, 'emote')}
            onReaction={sendReaction}
          />
        </div>

        {/* Live hand info — only while I'm still in the hand */}
        {['active', 'all_in'].includes(mySeat?.status) && (
          <div className="absolute bottom-[110px] right-3 z-30">
            <HandInfo myCards={myCards} community={tableState.community} phase={tableState.phase} />
          </div>
        )}

        {/* Floating action panel — bottom right */}
        <div className="absolute bottom-3 right-3 bg-black/75 rounded-lg border border-white/10 z-30 backdrop-blur-sm">
          <ActionPanel
            actionRequired={actionRequired}
            myPlayerId={player?.id}
            mySeat={mySeat}
            currentBet={tableState.currentBet}
            lastRaiseSize={tableState.lastRaiseSize}
            pot={tableState.pot}
            bigBlind={tableState.bigBlind}
            onAction={(type, amount) => { sendAction(type, amount); play('button_click'); }}
            onRevealCards={revealMyCards}
            canReveal={!!lastWinner && myCards.length > 0}
          />
        </div>
      </div>
    </div>
  );
}
