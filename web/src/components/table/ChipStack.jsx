// Denominated poker chip stack visual.
// chipBreakdown(73) → [{value:25,color},{value:25},{value:5}...] capped at 8 discs.

const DENOMS = [
  { value: 1000, color: '#FFD54F', edge: '#B8860B' },  // gold
  { value: 500,  color: '#9C27B0', edge: '#6A1B9A' },  // purple
  { value: 100,  color: '#37474F', edge: '#111'    },  // black
  { value: 25,   color: '#43A047', edge: '#1B5E20' },  // green
  { value: 5,    color: '#E53935', edge: '#8B0000' },  // red
  { value: 1,    color: '#ECEFF1', edge: '#90A4AE' },  // white
];

export function chipBreakdown(amount, maxChips = 8) {
  const chips = [];
  let rest = Math.max(0, Math.round(amount));
  for (const d of DENOMS) {
    while (rest >= d.value && chips.length < maxChips) {
      chips.push(d);
      rest -= d.value;
    }
    if (chips.length >= maxChips) break;
  }
  if (!chips.length && amount > 0) chips.push(DENOMS[DENOMS.length - 1]);
  return chips;
}

export function Chip({ color = '#E53935', edge = '#8B0000', size = 22, style = {} }) {
  return (
    <div
      style={{
        width: size, height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 30%, ${color} 60%, ${edge} 100%)`,
        border: `2px dashed rgba(255,255,255,0.7)`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        boxSizing: 'border-box',
        ...style,
      }}
    />
  );
}

export function ChipStack({ amount, size = 22, showLabel = true }) {
  if (!amount || amount <= 0) return null;
  const chips = chipBreakdown(amount);

  return (
    <div className="flex flex-col items-center pointer-events-none select-none">
      <div className="relative" style={{ width: size, height: size + (chips.length - 1) * 4 }}>
        {chips.map((c, i) => (
          <Chip
            key={i}
            color={c.color}
            edge={c.edge}
            size={size}
            style={{ position: 'absolute', bottom: i * 4, left: 0 }}
          />
        ))}
      </div>
      {showLabel && (
        <span className="text-white text-[10px] font-bold mt-0.5 bg-black/50 px-1.5 rounded">
          {amount.toLocaleString()}
        </span>
      )}
    </div>
  );
}
