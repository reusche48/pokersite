import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayingCard } from '../common/PlayingCard';

let _muckId = 0;

// Al retirarse un jugador, sus dos cartas vuelan boca abajo desde su asiento
// hacia el centro de la mesa (el "muck"), girando y desvaneciéndose.
export function MuckLayer({ animEvents, consumeAnim, getSeatXY, centerXY, ready = true }) {
  const [cards, setCards] = useState([]);
  const processed = useRef(new Set());

  useEffect(() => {
    if (!ready) return;
    for (const ev of animEvents) {
      if (processed.current.has(ev.id)) continue;
      if (ev.type !== 'muck') continue;
      processed.current.add(ev.id);

      const from = getSeatXY(ev.position);
      const newCards = [0, 1].map(i => ({
        id: ++_muckId,
        from: { x: from.x + (i === 0 ? -12 : 12), y: from.y + 30 },
        delay: i * 0.06,
        rotate: (Math.random() - 0.5) * 220,
        driftX: (Math.random() - 0.5) * 40,
      }));
      setCards(prev => [...prev, ...newCards]);
      consumeAnim(ev.id);
      const ids = newCards.map(c => c.id);
      setTimeout(() => setCards(prev => prev.filter(c => !ids.includes(c.id))), 900);
    }
  }, [animEvents, consumeAnim, getSeatXY, centerXY, ready]);

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      <AnimatePresence>
        {cards.map(c => (
          <motion.div
            key={c.id}
            style={{ position: 'absolute', left: c.from.x, top: c.from.y }}
            initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
            animate={{
              x: centerXY.x - c.from.x + c.driftX,
              y: centerXY.y - c.from.y + 20,
              scale: 0.55,
              rotate: c.rotate,
              opacity: 0,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, delay: c.delay, ease: 'easeIn' }}
          >
            <PlayingCard faceDown small />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
