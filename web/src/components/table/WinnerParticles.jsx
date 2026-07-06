import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

let _burstId = 0;
const GOLD = ['#ffd700', '#ffea70', '#f5b301', '#fff3b0'];

// Explosión de partículas doradas que brota del asiento del ganador.
export function WinnerParticles({ lastWinner, seats, getSeatXY, ready = true }) {
  const [particles, setParticles] = useState([]);
  const fired = useRef(null);

  useEffect(() => {
    if (!ready || !lastWinner?.winners?.length) return;
    // Un disparo por mano ganada (identificamos por referencia del objeto)
    if (fired.current === lastWinner) return;
    fired.current = lastWinner;

    const burst = [];
    for (const w of lastWinner.winners) {
      const seat = seats?.find(s => s.playerId === w.playerId);
      if (!seat) continue;
      const { x, y } = getSeatXY(seat.position);
      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * (0.15 + 0.7 * Math.random())) + Math.PI; // hacia arriba
        const dist = 60 + Math.random() * 90;
        burst.push({
          id: ++_burstId,
          x, y,
          dx: Math.cos(angle) * dist * (Math.random() > 0.5 ? 1 : -1) * 0.6,
          dy: -Math.abs(Math.sin(angle)) * dist,
          size: 4 + Math.random() * 6,
          color: GOLD[i % GOLD.length],
          delay: Math.random() * 0.35,
          spin: (Math.random() - 0.5) * 360,
        });
      }
    }
    if (!burst.length) return;
    setParticles(prev => [...prev, ...burst]);
    const ids = burst.map(p => p.id);
    setTimeout(() => setParticles(prev => prev.filter(p => !ids.includes(p.id))), 2200);
  }, [lastWinner, seats, getSeatXY, ready]);

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      <AnimatePresence>
        {particles.map(p => (
          <motion.div
            key={p.id}
            style={{
              position: 'absolute', left: p.x, top: p.y,
              width: p.size, height: p.size,
              background: p.color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              boxShadow: `0 0 6px ${p.color}`,
            }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{ x: p.dx, y: p.dy, opacity: 0, rotate: p.spin, scale: 0.4 }}
            transition={{ duration: 1.4, delay: p.delay, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
