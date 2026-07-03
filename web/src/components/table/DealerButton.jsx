import { motion } from 'framer-motion';

// Single table-level dealer button that slides between seats when the dealer rotates.
// Sits between the dealer's seat and the table center, like Full Tilt.
export function DealerButton({ getSeatXY, centerXY, dealerPosition, heroPosition }) {
  if (dealerPosition === null || dealerPosition === undefined) return null;
  const seat = getSeatXY(dealerPosition);
  if (!seat || (seat.x === 0 && seat.y === 0)) return null;

  // Beside the nameplate (never on top of it).
  // Hero's cards sit on his LEFT, so his puck always goes right;
  // everyone else gets it on the side facing the table center.
  const SIDE_OFFSET = 88; // half plate width (~65px) + puck + margin
  const isHero = dealerPosition === heroPosition;
  const goRight = isHero || seat.x <= centerXY.x;
  const x = seat.x + (goRight ? SIDE_OFFSET : -SIDE_OFFSET);
  const y = seat.y;

  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      initial={false}
      animate={{ left: x - 13, top: y - 13 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
    >
      {/* White dealer puck — slightly bigger than chips (26px vs 18px), soft glow */}
      <div
        className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[12px] font-black text-black"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #ffffff 60%, #d8d8d8 100%)',
          border: '2px solid #b5b5b5',
          boxShadow: '0 0 6px 1px rgba(255,255,255,0.45), 0 2px 4px rgba(0,0,0,0.5)',
        }}
      >
        D
      </div>
    </motion.div>
  );
}
