import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayingCard } from '../common/PlayingCard';
import { playSfx } from '../../sounds/sfx';

let _dealId = 0;

// Card backs fly from table center to each occupied seat (2 rounds, real dealing order).
export function DealLayer({ animEvents, consumeAnim, getSeatXY, centerXY, ready = true }) {
  const [cards, setCards] = useState([]);
  const processed = useRef(new Set());

  useEffect(() => {
    if (!ready) return; // container not measured yet — wait, don't consume
    for (const ev of animEvents) {
      if (processed.current.has(ev.id)) continue;
      if (ev.type !== 'deal') continue;
      processed.current.add(ev.id);

      const newCards = [];
      let order = 0;
      // Two passes — one card per seat per round, like a real dealer
      for (let round = 0; round < 2; round++) {
        for (const pos of ev.positions) {
          const to = getSeatXY(pos);
          const delay = order * 0.09;
          newCards.push({
            id: ++_dealId,
            to: { x: to.x + (round === 0 ? -12 : 12), y: to.y + 30 },
            delay,
            rotate: (Math.random() - 0.5) * 30,
          });
          setTimeout(() => playSfx('card_deal'), delay * 1000);
          order++;
        }
      }
      setCards(prev => [...prev, ...newCards]);
      consumeAnim(ev.id);
      // Safety: clear any stuck cards after the full sequence + margin
      const maxDelay = newCards.length ? Math.max(...newCards.map(c => c.delay)) : 0;
      const ids = newCards.map(c => c.id);
      setTimeout(() => setCards(prev => prev.filter(c => !ids.includes(c.id))), (maxDelay + 1.2) * 1000);
    }
  }, [animEvents, consumeAnim, getSeatXY, centerXY, ready]);

  function removeCard(id) {
    setCards(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      <AnimatePresence>
        {cards.map(c => (
          <motion.div
            key={c.id}
            style={{ position: 'absolute', left: centerXY.x, top: centerXY.y }}
            initial={{ x: 0, y: 0, scale: 0.5, rotate: 0, opacity: 1 }}
            animate={{ x: c.to.x - centerXY.x, y: c.to.y - centerXY.y, scale: 1, rotate: c.rotate }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, delay: c.delay, ease: 'easeOut' }}
            onAnimationComplete={() => setTimeout(() => removeCard(c.id), 150)}
          >
            <PlayingCard faceDown small />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
