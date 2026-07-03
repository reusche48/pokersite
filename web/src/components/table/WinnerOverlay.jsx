import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

export function WinnerOverlay({ lastWinner, myPlayerId, onDismiss }) {
  const fired = useRef(false);

  useEffect(() => {
    if (!lastWinner) { fired.current = false; return; }
    const isMyWin = lastWinner.winners?.some(w => w.playerId === myPlayerId);
    if (isMyWin && !fired.current) {
      fired.current = true;
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.5 } });
    }
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [lastWinner]);

  const winners = lastWinner?.winners || [];

  return (
    <AnimatePresence>
      {lastWinner && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="absolute z-50 pointer-events-none"
          style={{ top: '62%', left: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <div className="bg-black/80 border border-yellow-500/60 rounded-xl px-6 py-3 text-center shadow-lg backdrop-blur-sm">
            {winners.map((w, i) => (
              <div key={i}>
                <div className="text-yellow-400 font-bold text-base">
                  🏆 {w.playerId === myPlayerId ? '¡Ganaste!' : `${w.nickname} gana`}
                </div>
                <div className="text-green-400 font-mono text-xl font-bold">+${w.amount?.toLocaleString()}</div>
                {w.handName && w.handName !== 'Winner' && (
                  <div className="text-gray-300 text-sm mt-1">{w.handName}</div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
