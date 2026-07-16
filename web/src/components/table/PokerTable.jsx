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
import { TournamentStandings } from './TournamentStandings';
import { useTableState } from '../../hooks/useTableState';
import { useSeatCoords } from '../../hooks/useSeatCoords';
import { useSoundManager } from '../../hooks/useSoundManager';
import { usePlayerNotes } from '../../hooks/usePlayerNotes';
import { useIsMobile } from '../../hooks/useIsMobile';
import { notify } from '../../lib/notify';
import { useAuth } from '../../context/AuthContext';
import { LAYOUTS, MOBILE_LAYOUTS, buildMobileOval, ASSIGN_ORDER } from '../../lib/tableLayouts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// LAYOUTS, MOBILE_LAYOUTS, buildMobileOval y ASSIGN_ORDER viven en
// ../../lib/tableLayouts.js (compartidos con HandReplayPage).

export function PokerTable({ tableId, initialBuyIn, spectate = false }) {
  const { player } = useAuth();
  const navigate = useNavigate();
  const {
    tableState, myCards, reactions, chat, actionRequired, lastWinner, revealedCards,
    animEvents, consumeAnim, joinError,
    clearLastWinner, sendAction, sendReaction, sendChat, leaveTable, revealMyCards,
  } = useTableState(tableId, initialBuyIn, spectate);
  const { play, muted, toggleMute } = useSoundManager();
  const { getNote, saveNote } = usePlayerNotes();
  const [profilePlayer, setProfilePlayer] = useState(null); // seat being profiled
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [cinema, setCinema] = useState(false); // modo cine durante el run-out de all-in
  const [chatOpen, setChatOpen] = useState(false); // cajón de chat en móvil
  // Auto-fold (ausente): pasa o se retira solo cuando me toca. Persistido.
  const [autoFold, setAutoFold] = useState(() => localStorage.getItem('autoFold') === '1');
  function toggleAutoFold() {
    setAutoFold(v => { localStorage.setItem('autoFold', v ? '0' : '1'); return !v; });
  }
  const isMobile = useIsMobile();
  // Escala de los asientos: en móvil se adapta al ancho real de la pantalla.
  // Celular chico ≈ 0.8; tablet grande sube hasta ≈ 1.25 (cartas/avatares más grandes).
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 400);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);
  const seatScale = isMobile ? Math.min(1.4, Math.max(0.85, vw / 680)) : 1;

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

  // Notificación de navegador cuando me toca y la pestaña está en segundo plano
  useEffect(() => {
    if (actionRequired?.playerId === player?.id) {
      notify('♠ ¡Es tu turno!', tableState?.name || 'PokerSite');
    }
  }, [actionRequired?.playerId]);

  // Auto-fold: cuando me toca y está activado, paso (o me retiro) solo
  useEffect(() => {
    if (!autoFold || !actionRequired || actionRequired.playerId !== player?.id) return;
    const t = setTimeout(() => {
      sendAction((actionRequired.toCall || 0) > 0 ? 'fold' : 'check');
    }, 800);
    return () => clearTimeout(t);
  }, [autoFold, actionRequired]);

  // All-in run-out → modo cine para todos, pero el latido de suspenso SOLO
  // suena si YO estoy en la mano (all-in o cubriendo). Si me retiré o solo
  // miro, no suena — el corazón late por mis fichas, no por las ajenas.
  useEffect(() => {
    const ev = animEvents.find(e => e.type === 'runout');
    if (ev) {
      const me = tableState?.seats?.find(s => s.playerId === player?.id);
      const estoyEnLaMano = me && ['all_in', 'active'].includes(me.status);
      if (estoyEnLaMano) play('suspense');
      setCinema(true);
      consumeAnim(ev.id);
    }
  }, [animEvents]);

  // Red de seguridad: si la mesa no carga en 12 s (p. ej. el torneo terminó y
  // la mesa ya no existe, o el join se perdió), no dejar al jugador colgado en
  // "Conectando a la mesa…" — ofrecer volver al lobby.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    if (tableState) { setLoadTimedOut(false); return; }
    const t = setTimeout(() => setLoadTimedOut(true), 12000);
    return () => clearTimeout(t);
  }, [tableState]);

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

    // (ASSIGN_ORDER se importa de ../../lib/tableLayouts)

    // Asientos FIJOS anclados a la mesa: se mapean TODAS las sillas (maxSeats),
    // ocupadas o vacías, girando el óvalo para que el héroe quede abajo.
    const maxSeats = Math.min(seats.length || 6, 9);
    const heroIdx = seats.findIndex(s => s.playerId === player?.id);
    const heroRef = heroIdx >= 0 ? heroIdx : 0; // sin sentarme → posición 0 abajo
    const map = new Map();
    const slots = isMobile ? buildMobileOval(maxSeats) : null;
    const layout = isMobile ? null : (LAYOUTS[maxSeats] || LAYOUTS[6]);
    const order = isMobile ? null : (ASSIGN_ORDER[maxSeats] || ASSIGN_ORDER[6]);
    for (let p = 0; p < maxSeats; p++) {
      const offset = ((p - heroRef) % maxSeats + maxSeats) % maxSeats;
      const slot = isMobile ? slots[offset] : layout[order[offset]];
      if (slot) map.set(p, slot);
    }
    return { seatToVisual: map, occupancyKey: circular.map(s => s.position).join(',') };
  }, [tableState?.seats?.map(s => s.playerId).join(','), player?.id, isMobile]);

  const { containerRefCb, getSeatXY, getBetXY, centerXY, ready } = useSeatCoords(seatToVisual);

  if (!tableState) {
    // Mesa inexistente (torneo terminado) o timeout de carga → pantalla de salida
    const gone = joinError?.code === 'TABLE_NOT_FOUND';
    if (joinError || loadTimedOut) {
      return (
        <div className="flex items-center justify-center h-screen bg-[#0c0812] text-white">
          <div className="bg-gray-900 rounded-2xl p-6 w-[380px] border border-red-800 text-center">
            <div className="text-4xl mb-3">{gone || loadTimedOut ? '🏁' : '🚫'}</div>
            <h3 className="font-bold text-lg mb-2">
              {gone || loadTimedOut ? 'Esta mesa ya no está disponible' : 'No puedes unirte'}
            </h3>
            <p className="text-sm text-gray-300 mb-5">
              {gone || loadTimedOut
                ? 'Puede que el torneo haya terminado o la mesa se haya cerrado.'
                : (joinError?.message || 'Error al unirse a la mesa')}
            </p>
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
      <div className="flex items-center justify-center h-screen bg-[#0c0812] text-green-200 text-xl">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">♠</div>
          Conectando a la mesa...
          <div className="mt-6">
            <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-white underline">
              Volver al lobby
            </button>
          </div>
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
    <div className="flex flex-col" style={{
      height: '100dvh',
      background: `
        radial-gradient(ellipse at 50% 25%, rgba(150,40,200,0.28) 0%, transparent 55%),
        radial-gradient(ellipse at 50% 90%, rgba(90,20,140,0.22) 0%, transparent 55%),
        #0c0812
      `,
    }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/40 text-gray-300 text-xs font-semibold z-10">
        <div className="flex gap-3 items-center">
          <button onClick={requestLeave} className="hover:text-white transition">{spectate ? '← Salir' : (isMobile ? '← Salir' : 'STAND UP')}</button>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">Mano #{tableState.handNumber || 0}</span>
          {spectate && (
            <span className="bg-purple-700/80 text-white px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
              👁 MIRANDO
            </span>
          )}
        </div>
        {!isMobile && (
          <div className="text-gray-400">{tableState.name || 'Mesa'} — {tableState.gameType?.replace('_',' ').toUpperCase() || 'HOLDEM'}</div>
        )}
        <div className="flex gap-3 items-center">
          <button onClick={toggleMute} className="hover:text-white transition">{muted ? '🔇' : '🔊'}{!isMobile && (muted ? ' SILENCIO' : ' SONIDO')}</button>
          {!isMobile && <button onClick={requestLeave} className="hover:text-white transition">LOBBY</button>}
        </div>
      </div>

      {/* HUD de torneo — jugadores restantes, nivel de ciegas, premios */}
      {tableState.tournament && (
        <div className="flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-semibold z-10 bg-purple-950/50 border-b border-purple-800/40 whitespace-nowrap overflow-x-auto">
          {!isMobile && (
            <>
              <span className="text-purple-200">🏆 {tableState.tournament.name || 'Torneo'}</span>
              <span className="text-purple-700">·</span>
            </>
          )}
          <span className="text-white">👥 {tableState.tournament.remaining}/{tableState.tournament.total}</span>
          <span className="text-purple-700">·</span>
          <span className="text-sky-300">⏫ Niv {tableState.tournament.level} ({tableState.tournament.smallBlind}/{tableState.tournament.bigBlind}{tableState.tournament.ante ? ` a${tableState.tournament.ante}` : ''})</span>
          <span className="text-purple-700">·</span>
          {tableState.tournament.remaining > tableState.tournament.paidPlaces ? (
            <span className="text-yellow-300">🏅 {tableState.tournament.remaining - tableState.tournament.paidPlaces} a premios</span>
          ) : (
            <span className="text-green-400 font-bold">🏅 ¡EN PREMIOS!</span>
          )}
          {tableState.tournament.tournamentId && (
            <>
              <span className="text-purple-700">·</span>
              <TournamentStandings tournamentId={tableState.tournament.tournamentId} myId={player?.id} compact={isMobile} />
            </>
          )}
        </div>
      )}

      {/* Main area — table fills the screen, Full Tilt style; bottom strip reserved for floating panels */}
      <div className={`flex-1 relative overflow-hidden min-h-0 pt-1 ${isMobile ? 'px-1 pb-[108px]' : 'px-3 pb-[88px]'}`}>
        <div
          ref={containerRefCb}
          className="relative w-full h-full"
        >

          {/* Riel neón morado — forma estadio (lados rectos, extremos redondos) */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'linear-gradient(180deg, #b14ee0 0%, #8a2be2 12%, #6a1fb0 50%, #4a1580 85%, #3a1066 100%)',
              boxShadow: '0 0 24px 4px rgba(160,60,220,0.55), inset 0 2px 12px rgba(0,0,0,0.5), 0 10px 36px rgba(0,0,0,0.7)',
            }}
          />

          {/* Fieltro oscuro */}
          <div
            className="absolute rounded-full"
            style={{
              top: '7%', left: '3.5%', right: '3.5%', bottom: '7%',
              background: 'radial-gradient(ellipse at 50% 40%, #241a2e 0%, #1a1222 45%, #120b18 100%)',
              boxShadow: 'inset 0 2px 26px rgba(0,0,0,0.6)',
            }}
          />

          {/* Línea de borde interior */}
          <div
            className="absolute rounded-full border-2 border-fuchsia-400/20"
            style={{ top: '12%', left: '6.5%', right: '6.5%', bottom: '12%' }}
          />

          {/* Felt watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <span className="font-black tracking-widest" style={{
              fontSize: 'clamp(28px, 5vw, 52px)',
              color: 'rgba(200,120,240,0.07)',
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

          {/* Sillas FIJAS vacías — ancladas a la mesa (pods "Libre") */}
          {tableState.seats.map((seat, i) => {
            if (seat.playerId || !seatToVisual.get(i)) return null;
            const pos = getVisualPosition(i);
            return (
              <motion.div
                key={`empty-${i}`}
                className="absolute z-0 pointer-events-none"
                style={{ ...pos }}
                animate={{ scale: seatScale }}
                transformTemplate={(t) => `translate(-50%, -50%) scale(${t.scale ?? 1})`}
              >
                <div
                  className="rounded-full flex items-center justify-center"
                  style={{
                    width: 66, height: 66,
                    background: 'radial-gradient(circle, rgba(30,18,42,0.5) 55%, transparent 100%)',
                    border: '2px dashed rgba(160,110,200,0.28)',
                  }}
                >
                  <span className="text-[9px] font-semibold" style={{ color: 'rgba(200,160,230,0.5)' }}>Libre</span>
                </div>
              </motion.div>
            );
          })}

          {/* Player seats with enter/exit transitions */}
          <AnimatePresence>
            {tableState.seats.map((seat, i) => {
              if (!seat.playerId) return null;
              const visualPos = getVisualPosition(i);
              // Top-row seats (on the rail): cards below the plate.
              // Side seats: cards above (clear of chat/panels).
              // Hero: cards beside the plate (handled via isMe).
              const topPct = parseFloat(visualPos.top);
              // Asientos de arriba (cerca del borde superior): cartas hacia abajo.
              const cardsBelow = topPct < 22;
              return (
                <motion.div
                  key={seat.playerId}
                  className="absolute z-10"
                  style={{ ...visualPos }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: seatScale }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.3 }}
                  transformTemplate={(t) => `translate(-50%, -50%) scale(${t.scale ?? 1})`}
                >
                  <PlayerSeat
                    seat={seat}
                    myCards={myCards}
                    isMe={seat.playerId === player?.id}
                    isActionRequired={actionRequired?.playerId === seat.playerId}
                    reactions={reactions}
                    revealedCards={revealedCards[seat.playerId]}
                    isWinner={lastWinner?.winners?.some(w => w.playerId === seat.playerId)}
                    cardsBelow={cardsBelow}
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

        {/* Chat — escritorio: flotante fijo; móvil: cajón colapsable con botón */}
        {isMobile ? (
          <>
            <button
              onClick={() => setChatOpen(o => !o)}
              className="absolute bottom-2 left-2 z-40 w-11 h-11 rounded-full bg-black/70 border border-white/15 backdrop-blur-sm flex items-center justify-center text-lg"
            >
              💬
            </button>
            {chatOpen && (
              <div className="absolute inset-x-2 bottom-16 h-[45%] bg-black/90 rounded-lg border border-white/15 overflow-hidden z-40 backdrop-blur-sm">
                <button onClick={() => setChatOpen(false)} className="absolute top-1 right-2 z-10 text-gray-400 text-lg">✕</button>
                <ChatBox chat={chat} onSend={(t) => sendChat(t, 'chat')} onEmote={(t) => sendChat(t, 'emote')} onReaction={sendReaction} />
              </div>
            )}
          </>
        ) : (
          <div className="absolute bottom-3 left-3 w-[300px] h-[140px] bg-black/75 rounded-lg border border-white/10 overflow-hidden z-30 backdrop-blur-sm">
            <ChatBox chat={chat} onSend={(t) => sendChat(t, 'chat')} onEmote={(t) => sendChat(t, 'emote')} onReaction={sendReaction} />
          </div>
        )}

        {/* Live hand info — only while I'm still in the hand */}
        {['active', 'all_in'].includes(mySeat?.status) && (
          <div className={isMobile ? 'absolute top-[57%] left-1/2 -translate-x-1/2 z-30 scale-90' : 'absolute bottom-[110px] right-3 z-30'}>
            <HandInfo myCards={myCards} community={tableState.community} phase={tableState.phase} />
          </div>
        )}

        {/* Panel de acción — escritorio: abajo-derecha; móvil: barra full-width abajo */}
        <div
          className={isMobile
            ? 'absolute bottom-0 inset-x-0 bg-black/85 border-t border-white/10 z-30 backdrop-blur-sm'
            : 'absolute bottom-3 right-3 bg-black/75 rounded-lg border border-white/10 z-30 backdrop-blur-sm'}
          style={isMobile ? { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)' } : undefined}
        >
          <ActionPanel
            isMobile={isMobile}
            compact={isMobile && vw < 480}
            autoFold={autoFold}
            onToggleAutoFold={toggleAutoFold}
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
