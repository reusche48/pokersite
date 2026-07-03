import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PlayingCard } from '../common/PlayingCard';

export function Board({ community = [], phase, play }) {
  const prevCount = useRef(0);

  // Sound for each newly revealed community card
  useEffect(() => {
    const valid = community.filter(c => c && c.rank).length;
    if (valid > prevCount.current && play) {
      const newCards = valid - prevCount.current;
      for (let i = 0; i < newCards; i++) {
        setTimeout(() => play('card_deal'), i * 150);
      }
    }
    prevCount.current = valid;
  }, [community, play]);

  const cards = community.filter(card => card && card.rank && card.suit);
  if (!cards.length) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1.5" style={{ perspective: 600 }}>
        {cards.map((card, i) => (
          <AnimatePresence key={i}>
            <motion.div
              initial={{ rotateY: 90, y: -20, opacity: 0 }}
              animate={{ rotateY: 0, y: 0, opacity: 1 }}
              transition={{ delay: i >= 3 ? 0 : i * 0.15, duration: 0.4, ease: 'easeOut' }}
            >
              <PlayingCard card={card} />
            </motion.div>
          </AnimatePresence>
        ))}
      </div>
    </div>
  );
}
