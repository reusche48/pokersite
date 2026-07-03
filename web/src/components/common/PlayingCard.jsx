import { motion } from 'framer-motion';

const SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SUIT_COLORS = { h: '#e53935', d: '#2196f3', c: '#388e3c', s: '#212121' };
const RANK_DISPLAY = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export function PlayingCard({ card, faceDown = false, small = false, className = '' }) {
  const w = small ? 36 : 52;
  const h = small ? 52 : 74;

  if (faceDown || !card) {
    return (
      <div
        className={`relative rounded-md shadow-lg overflow-hidden flex-shrink-0 ${className}`}
        style={{
          width: w, height: h,
          background: 'linear-gradient(145deg, #1a237e 0%, #0d47a1 40%, #1a237e 100%)',
          border: '1.5px solid #3949ab',
        }}
      >
        <div className="absolute inset-[3px] rounded-sm border border-white/10"
          style={{
            background: `
              repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 4px),
              repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 4px)
            `,
          }}
        />
      </div>
    );
  }

  const rank = RANK_DISPLAY[card.rank] || card.rank;
  const suit = SUIT_SYMBOLS[card.suit] || card.suit;
  const color = SUIT_COLORS[card.suit] || '#000';

  return (
    <motion.div
      initial={{ rotateY: 90, scale: 0.8 }}
      animate={{ rotateY: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`relative rounded-md shadow-lg overflow-hidden flex-shrink-0 ${className}`}
      style={{
        width: w, height: h,
        background: 'linear-gradient(180deg, #fff 0%, #f8f8f8 100%)',
        border: '1px solid #ccc',
      }}
    >
      <div className="absolute top-[2px] left-[3px] flex flex-col items-center leading-none" style={{ color }}>
        <span className="font-bold" style={{ fontSize: small ? 10 : 13, lineHeight: 1.1 }}>{rank}</span>
        <span style={{ fontSize: small ? 9 : 11, lineHeight: 1 }}>{suit}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center" style={{ color }}>
        <span style={{ fontSize: small ? 16 : 22 }}>{suit}</span>
      </div>
      <div className="absolute bottom-[2px] right-[3px] flex flex-col items-center leading-none rotate-180" style={{ color }}>
        <span className="font-bold" style={{ fontSize: small ? 10 : 13, lineHeight: 1.1 }}>{rank}</span>
        <span style={{ fontSize: small ? 9 : 11, lineHeight: 1 }}>{suit}</span>
      </div>
    </motion.div>
  );
}
