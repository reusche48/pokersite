import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { myBestHand, myDraws } from '../../utils/handEval';

// Live "what do I have" panel — hand made + draws being chased.
export function HandInfo({ myCards, community, phase }) {
  const info = useMemo(() => {
    if (!myCards?.length || phase === 'waiting') return null;
    const hand = myBestHand(myCards, community || []);
    const draws = myDraws(myCards, community || []);
    return { hand, draws };
  }, [myCards, community, phase]);

  if (!info?.hand) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="bg-black/75 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm pointer-events-none select-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Tienes</span>
          <span className="text-sm font-bold text-yellow-300">{info.hand.name}</span>
        </div>
        {info.draws.map((d, i) => (
          <div key={i} className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Buscas</span>
            <span className="text-xs font-semibold text-sky-300">
              {d.label} <span className="text-gray-400">({d.outs} outs)</span>
            </span>
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
