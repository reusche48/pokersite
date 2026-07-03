import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chip, chipBreakdown } from './ChipStack';
import { playSfx } from '../../sounds/sfx';

let _flightId = 0;

// Renders transient chip flights driven by anim events.
// Each flight snapshots from/to pixel coords at spawn time.
export function ChipFlightLayer({ animEvents, consumeAnim, getSeatXY, getBetXY, centerXY, ready = true }) {
  const [flights, setFlights] = useState([]);
  const processed = useRef(new Set());

  useEffect(() => {
    if (!ready) return; // container not measured yet
    for (const ev of animEvents) {
      if (processed.current.has(ev.id)) continue;
      if (!['bet_fly', 'collect', 'pot_to_winner'].includes(ev.type)) continue;
      processed.current.add(ev.id);

      const newFlights = [];

      if (ev.type === 'bet_fly') {
        const from = getSeatXY(ev.position);
        const to = getBetXY(ev.position);
        const chips = chipBreakdown(ev.amount, 3);
        chips.forEach((c, i) => {
          newFlights.push({
            id: ++_flightId,
            from: { x: from.x + (Math.random() - 0.5) * 14, y: from.y },
            to: { x: to.x + (Math.random() - 0.5) * 10, y: to.y },
            color: c.color, edge: c.edge,
            delay: i * 0.05,
            duration: 0.45,
          });
        });
        playSfx('chip_bet');
      }

      if (ev.type === 'collect') {
        ev.bets.forEach((bet, seatIdx) => {
          const from = getBetXY(bet.position);
          const chips = chipBreakdown(bet.amount, 3);
          chips.forEach((c, i) => {
            newFlights.push({
              id: ++_flightId,
              from: { x: from.x + (Math.random() - 0.5) * 10, y: from.y },
              to: { x: centerXY.x + (Math.random() - 0.5) * 20, y: centerXY.y },
              color: c.color, edge: c.edge,
              delay: seatIdx * 0.08 + i * 0.04,
              duration: 0.5,
            });
          });
        });
        playSfx('chip_stack');
      }

      if (ev.type === 'pot_to_winner') {
        ev.positions.forEach((pos, wIdx) => {
          const to = getSeatXY(pos);
          for (let i = 0; i < 7; i++) {
            const denom = chipBreakdown(100 * (i + 1), 1)[0];
            newFlights.push({
              id: ++_flightId,
              from: { x: centerXY.x + (Math.random() - 0.5) * 24, y: centerXY.y },
              to: { x: to.x + (Math.random() - 0.5) * 20, y: to.y },
              color: denom.color, edge: denom.edge,
              delay: (ev.delay || 0) + wIdx * 0.1 + i * 0.06,
              duration: 0.55,
            });
          }
        });
        setTimeout(() => playSfx('chip_win'), (ev.delay || 0) * 1000);
      }

      if (newFlights.length) {
        setFlights(prev => [...prev, ...newFlights]);
        // Safety: remove stuck flights after sequence + margin
        const maxEnd = Math.max(...newFlights.map(f => f.delay + f.duration));
        const ids = newFlights.map(f => f.id);
        setTimeout(() => setFlights(prev => prev.filter(f => !ids.includes(f.id))), (maxEnd + 1) * 1000);
      }
      consumeAnim(ev.id);
    }
  }, [animEvents, consumeAnim, getSeatXY, getBetXY, centerXY, ready]);

  function removeFlight(id) {
    setFlights(prev => prev.filter(f => f.id !== id));
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      <AnimatePresence>
        {flights.map(f => (
          <motion.div
            key={f.id}
            style={{ position: 'absolute', left: f.from.x, top: f.from.y }}
            initial={{ x: 0, y: 0, scale: 0.7, opacity: 0.9 }}
            animate={{ x: f.to.x - f.from.x, y: f.to.y - f.from.y, scale: 1, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: f.duration, delay: f.delay, ease: [0.25, 0.8, 0.4, 1] }}
            onAnimationComplete={() => removeFlight(f.id)}
          >
            <Chip color={f.color} edge={f.edge} size={18} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
