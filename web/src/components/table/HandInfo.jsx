import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { myBestHand, myDraws } from '../../utils/handEval';

// Live "what do I have" panel — hand made + draws being chased.
// Es TEMPORAL: aparece unos segundos cuando cambia la jugada (carta nueva) y
// luego se desvanece, para no tapar las cartas del jugador.
export function HandInfo({ myCards, community, phase }) {
  const info = useMemo(() => {
    if (!myCards?.length || phase === 'waiting') return null;
    const hand = myBestHand(myCards, community || []);
    const draws = myDraws(myCards, community || []);
    return { hand, draws };
  }, [myCards, community, phase]);

  // Firma de la jugada actual: cambia con la mano, la calle o una carta nueva.
  const sig = info?.hand ? `${info.hand.name}|${phase}|${community?.length || 0}` : null;
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!sig) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
  }, [sig]);

  if (!info?.hand) return null;
  const madeHand = info.hand.rank >= 2;         // par o mejor
  const draws = info.draws || [];
  // Solo vale la pena mostrarlo si tengo jugada hecha o un proyecto.
  // "Carta alta" a secas (ej. "Cinco alta") no se muestra — no aporta nada.
  if (!madeHand && draws.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.4 }}
          className="bg-black/75 border border-white/10 rounded-lg px-3 py-2 backdrop-blur-sm pointer-events-none select-none"
        >
          {madeHand && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Tienes</span>
              <span className="text-sm font-bold text-yellow-300">{info.hand.name}</span>
            </div>
          )}
          {draws.map((d, i) => (
            <div key={i} className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Buscas</span>
              <span className="text-xs font-semibold text-sky-300">
                {d.label} <span className="text-gray-400">({d.outs} outs)</span>
              </span>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
