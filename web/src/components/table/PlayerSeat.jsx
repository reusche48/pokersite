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

export function PlayerSeat({ seat, myCards, isMe, isActionRequired, reactions = [], revealedCards, isWinner, cardsOnTop = false, playerNote, onProfileClick }) {
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

  return (
    <div className={`relative flex flex-col items-center ${isFolded ? 'opacity-40' : ''}`}>
      {/* Floating emojis */}
      <AnimatePresence>
        {myReactions.map(r => <EmojiFloat key={r.id} emoji={r.emoji} />)}
      </AnimatePresence>

      {/* Cards ABOVE nameplate for top-half seats (avoids board overlap) */}
      {cardsOnTop && displayCards.length > 0 && (
        <div className="flex gap-0.5 mb-1 relative z-10">
          {displayCards.map((card, i) => (
            <motion.div
              key={`${seat.playerId}-tcard-${i}-${showFaceUp ? 'up' : 'down'}`}
              initial={hasReveal ? { rotateY: 180, scale: 0.7 } : false}
              animate={hasReveal ? { rotateY: 0, scale: 1 } : {}}
              transition={{ duration: hasReveal ? 0.7 : 0.2, delay: hasReveal ? i * 0.2 : 0, ease: 'easeOut' }}
              style={{ perspective: 800 }}
            >
              <div className={`rounded-md ${winnerCardGlow} transition-shadow duration-500`}>
                <PlayingCard card={showFaceUp ? card : null} faceDown={!showFaceUp} small />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Profile tag badge — my read on this player */}
      {noteTag && !isMe && (
        <div
          className="absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full flex items-center justify-center text-sm shadow-lg"
          style={{ background: noteTag.color, border: '2px solid rgba(0,0,0,0.4)' }}
          title={`${noteTag.label}${playerNote.note ? ` — ${playerNote.note}` : ''}`}
        >
          {noteTag.emoji}
        </div>
      )}

      {/* Name plate (click an opponent to profile them) */}
      <motion.div
        animate={plateAnimate}
        transition={plateTransition}
        onClick={!isMe && onProfileClick ? onProfileClick : undefined}
        className={`relative rounded-full overflow-hidden ${!isMe && onProfileClick ? 'cursor-pointer hover:brightness-125' : ''}`}
        style={{
          background: isWinner
            ? 'linear-gradient(180deg, #4a3800 0%, #2d2200 100%)'
            : isMe
              ? 'linear-gradient(180deg, #14306e 0%, #081a3e 100%)'
              : 'linear-gradient(180deg, #1d2733 0%, #0c1118 100%)',
          minWidth: '108px',
          maxWidth: '140px',
          border: isActionRequired
            ? '2px solid rgba(250,204,21,0.8)'
            : noteTag && !isMe
              ? `2px solid ${noteTag.color}88`
              : '2px solid rgba(120,150,190,0.45)',
        }}
      >
        {/* Action timer bar */}
        {isActionRequired && (
          <motion.div
            className="absolute top-0 left-0 h-[3px] bg-yellow-400"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: 30, ease: 'linear' }}
          />
        )}

        <div className="flex items-center gap-1.5 px-2.5 py-1">
          <Avatar nickname={seat.nickname} state={avatarState} size={26} />
          <div className="flex flex-col min-w-0 items-center flex-1">
            <span className={`flex items-center text-xs font-bold truncate max-w-[80px] ${
              isWinner ? 'text-yellow-400' : isMe ? 'text-yellow-300' : 'text-white'
            }`}>
              {isWinner ? '👑 ' : ''}{seat.nickname}
              {isActionRequired && !isMe && <ThinkingDots />}
            </span>
            <span className="text-xs font-mono text-green-400 font-bold">
              <AnimatedNumber value={seat.stack || 0} />
            </span>
          </div>
          {/* Blind badge inside the plate — never floats over the board */}
          {(seat.isSB || seat.isBB) && (
            <span className={`w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center flex-shrink-0 ${
              seat.isSB ? 'bg-blue-600' : 'bg-purple-600'
            }`}>
              {seat.isSB ? 'S' : 'B'}
            </span>
          )}
        </div>

        {/* Status badge */}
        {seat.status === 'all_in' && (
          <div className="bg-red-600 text-white text-[9px] font-black text-center py-0.5 tracking-wider">
            ALL IN
          </div>
        )}
        {isFolded && (
          <div className="bg-gray-700 text-gray-400 text-[9px] font-bold text-center py-0.5">
            RETIRADO
          </div>
        )}
        {isWinner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-yellow-600 text-black text-[9px] font-black text-center py-0.5 tracking-wider"
          >
            GANADOR
          </motion.div>
        )}
      </motion.div>

      {/* My cards: LEFT of the nameplate (action panel sits bottom-right and would cover them below).
          Other bottom-half players: cards below as usual. */}
      {!cardsOnTop && displayCards.length > 0 && (
        <div
          className={`flex gap-0.5 z-10 ${
            isMe ? 'absolute right-full top-0 mr-2' : 'relative mt-1'
          }`}
        >
          {displayCards.map((card, i) => (
            <motion.div
              key={`${seat.playerId}-card-${i}-${showFaceUp ? 'up' : 'down'}`}
              initial={hasReveal ? { rotateY: 180, scale: 0.7 } : false}
              animate={hasReveal ? { rotateY: 0, scale: 1 } : {}}
              whileHover={isMe && showFaceUp ? { y: -8, scale: 1.1 } : {}}
              transition={{ duration: hasReveal ? 0.7 : 0.2, delay: hasReveal ? i * 0.2 : 0, ease: 'easeOut' }}
              style={{ perspective: 800 }}
            >
              <div className={`rounded-md ${winnerCardGlow} transition-shadow duration-500`}>
                <PlayingCard
                  card={showFaceUp ? card : null}
                  faceDown={!showFaceUp}
                  small={!isMe}
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
