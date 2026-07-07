import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from './Avatar';
import { PlayingCard } from '../common/PlayingCard';
import { EmojiFloat } from './EmojiFloat';
import { AnimatedNumber } from '../common/AnimatedNumber';
import { PLAYER_TAGS } from '../../hooks/usePlayerNotes';

function ThinkingDots() {
  return (
    <div className="flex gap-0.5 items-center ml-1">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-yellow-400"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function PlayerSeat({ seat, myCards, isMe, isActionRequired, reactions = [], revealedCards, isWinner, cardsBelow = false, playerNote, onProfileClick }) {
  if (seat.status === 'empty' || !seat.playerId) {
    return null;
  }

  const noteTag = playerNote?.tag ? PLAYER_TAGS[playerNote.tag] : null;

  const avatarState =
    seat.status === 'folded' ? 'folded'
    : seat.status === 'all_in' ? 'all_in'
    : isWinner ? 'won'
    : isActionRequired ? 'thinking'
    : 'idle';

  const myReactions = reactions.filter(r => r.playerId === seat.playerId);
  const isFolded = seat.status === 'folded';

  let displayCards = [];
  let showFaceUp = false;
  const hasReveal = !isMe && revealedCards?.length > 0;

  if (hasReveal) {
    // Opponent showdown reveal
    displayCards = revealedCards;
    showFaceUp = true;
  } else if (isMe && (myCards.length > 0 || revealedCards?.length > 0)) {
    // My cards — fall back to the showdown reveal if local state was cleared
    displayCards = myCards.length > 0 ? myCards : revealedCards;
    showFaceUp = true;
  } else if (!isMe && (seat.status === 'active' || seat.status === 'all_in')) {
    displayCards = [null, null];
    showFaceUp = false;
  }

  // Abanico: las cartas boca abajo de un rival van giradas y superpuestas
  // (como en las mesas pro). No aplica a mis cartas ni a un showdown revelado.
  const isFan = !isMe && !showFaceUp && displayCards.length > 1;
  const fanStyle = (i) => isFan
    ? { transform: `rotate(${i === 0 ? -10 : 10}deg) scale(0.9)`, transformOrigin: 'bottom center', marginLeft: i > 0 ? -16 : 0, zIndex: i }
    : {};

  const winnerCardGlow = isWinner && showFaceUp
    ? 'ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.7)]'
    : '';

  // Pulsing glow for whoever's turn it is; gold steady glow for the winner
  const plateAnimate = isActionRequired
    ? { boxShadow: ['0 0 4px 1px rgba(250,204,21,0.4)', '0 0 16px 4px rgba(250,204,21,0.8)', '0 0 4px 1px rgba(250,204,21,0.4)'] }
    : isWinner
      ? { scale: [1, 1.05, 1], boxShadow: '0 0 20px 4px rgba(250,204,21,0.5)' }
      : { boxShadow: '0 2px 8px rgba(0,0,0,0.4)' };

  const plateTransition = isActionRequired
    ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
    : isWinner
      ? { duration: 0.5, repeat: 3 }
      : { duration: 0.3 };

  // Color del aro del avatar según estado
  const ringColor = (isActionRequired || isWinner)
    ? '#facc15'
    : isMe
      ? '#3b82f6'
      : 'rgba(120,150,190,0.5)';
  const avatarSize = isMe ? 66 : 58;
  const cardTuck = Math.round(avatarSize * 0.4);

  // Bloque de cartas en abanico. Se coloca ENCIMA del avatar por defecto, o
  // DEBAJO (hacia el centro) para los asientos de arriba, así no se cortan
  // contra el borde superior de la mesa.
  const cardsBlock = displayCards.length > 0 ? (
    <div
      className={`flex relative z-0 ${isFan ? 'items-end' : 'gap-0.5'}`}
      style={cardsBelow ? { marginTop: 2 } : { marginBottom: -cardTuck }}
    >
      {displayCards.map((card, i) => (
        <motion.div
          key={`${seat.playerId}-card-${i}-${showFaceUp ? 'up' : 'down'}`}
          initial={hasReveal ? { rotateY: 180, scale: 0.7 } : false}
          animate={hasReveal ? { rotateY: 0, scale: 1 } : {}}
          whileHover={isMe && showFaceUp ? { y: -8, scale: 1.1 } : {}}
          transition={{ duration: hasReveal ? 0.7 : 0.2, delay: hasReveal ? i * 0.2 : 0, ease: 'easeOut' }}
          style={{ perspective: 800, ...fanStyle(i) }}
        >
          <div className={`rounded-md ${winnerCardGlow} transition-shadow duration-500`}>
            <PlayingCard card={showFaceUp ? card : null} faceDown={!showFaceUp} small={!isMe} />
          </div>
        </motion.div>
      ))}
    </div>
  ) : null;

  return (
    <div className={`relative flex flex-col items-center ${isFolded ? 'opacity-40' : ''}`}>
      {/* Floating emojis */}
      <AnimatePresence>
        {myReactions.map(r => <EmojiFloat key={r.id} emoji={r.emoji} />)}
      </AnimatePresence>

      {/* Cartas arriba del avatar (asientos normales) */}
      {!cardsBelow && cardsBlock}

      {/* Avatar circular grande con aro de estado */}
      <div className="relative z-10">
        {/* Base de asiento — ancla visualmente al jugador (no "flota") */}
        <div
          className="absolute inset-0 -m-2 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(30,18,42,0.7) 55%, rgba(20,12,28,0.35) 80%, transparent 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(160,110,200,0.35)',
          }}
        />
        <motion.div
          animate={plateAnimate}
          transition={plateTransition}
          onClick={!isMe && onProfileClick ? onProfileClick : undefined}
          className={`rounded-full p-1 ${!isMe && onProfileClick ? 'cursor-pointer hover:brightness-110' : ''}`}
          style={{ background: ringColor }}
        >
          <div className="rounded-full overflow-hidden" style={{ background: '#0c1118' }}>
            <Avatar nickname={seat.nickname} avatarConfig={seat.avatarConfig} state={avatarState} size={avatarSize} />
          </div>
        </motion.div>

        {/* Ciega (SB/BB) — pegada al avatar */}
        {(seat.isSB || seat.isBB) && (
          <span className={`absolute bottom-0 right-0 w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center border border-black/40 ${
            seat.isSB ? 'bg-blue-600' : 'bg-purple-600'
          }`}>
            {seat.isSB ? 'S' : 'B'}
          </span>
        )}

        {/* Etiqueta de perfil */}
        {noteTag && !isMe && (
          <div
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] shadow-lg"
            style={{ background: noteTag.color, border: '2px solid rgba(0,0,0,0.4)' }}
            title={`${noteTag.label}${playerNote.note ? ` — ${playerNote.note}` : ''}`}
          >
            {noteTag.emoji}
          </div>
        )}

        {/* Nivel estimado */}
        {!isMe && playerNote?.estimatedLevel && (
          <div
            className="absolute -top-1 -left-1 min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center text-[9px] font-black text-black shadow-lg bg-yellow-500 border border-black/40"
            title={`Nivel estimado: ${playerNote.estimatedLevel}`}
          >
            Nv{playerNote.estimatedLevel}
          </div>
        )}
      </div>

      {/* Pestaña de nombre + fichas (debajo del avatar) */}
      <div
        className="relative -mt-3 z-20 rounded-md px-2 py-0 flex flex-col items-center overflow-hidden"
        style={{
          minWidth: '52px',
          maxWidth: '112px',
          background: isWinner
            ? 'linear-gradient(180deg, #4a3800 0%, #2d2200 100%)'
            : isMe
              ? 'linear-gradient(180deg, #14306e 0%, #081a3e 100%)'
              : 'linear-gradient(180deg, #1d2733 0%, #0c1118 100%)',
          border: `1px solid ${isActionRequired ? 'rgba(250,204,21,0.8)' : 'rgba(120,150,190,0.4)'}`,
        }}
      >
        <span className={`flex items-center text-[11px] font-bold truncate max-w-[110px] leading-tight ${
          isWinner ? 'text-yellow-400' : isMe ? 'text-yellow-300' : 'text-white'
        }`}>
          {isWinner ? '👑 ' : ''}{seat.nickname}
          {isActionRequired && !isMe && <ThinkingDots />}
        </span>
        <span className="text-[11px] font-mono text-green-400 font-bold leading-tight">
          <AnimatedNumber value={seat.stack || 0} />
        </span>
        {/* Barra de tiempo de turno */}
        {isActionRequired && (
          <motion.div
            className="absolute bottom-0 left-0 h-[3px] bg-yellow-400"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 30, ease: 'linear' }}
          />
        )}
      </div>

      {/* Estados */}
      {seat.status === 'all_in' && (
        <div className="mt-0.5 bg-red-600 text-white text-[9px] font-black text-center px-2 py-0.5 rounded tracking-wider">
          ALL IN
        </div>
      )}
      {isFolded && (
        <div className="mt-0.5 bg-gray-700 text-gray-400 text-[9px] font-bold text-center px-2 py-0.5 rounded">
          RETIRADO
        </div>
      )}
      {isWinner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-0.5 bg-yellow-600 text-black text-[9px] font-black text-center px-2 py-0.5 rounded tracking-wider"
        >
          GANADOR
        </motion.div>
      )}

      {/* Cartas hacia abajo (asientos de arriba): debajo del nombre, visibles */}
      {cardsBelow && cardsBlock}
    </div>
  );
}
