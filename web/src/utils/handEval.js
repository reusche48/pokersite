// Frontend hand evaluator — mirror of the backend engine's evaluator,
// used for the live "what do I have" indicator.

const HAND_NAMES = {
  1: 'Carta Alta', 2: 'Par', 3: 'Doble Par', 4: 'Trío', 5: 'Escalera',
  6: 'Color', 7: 'Full House', 8: 'Póker', 9: 'Escalera de Color', 10: 'Escalera Real',
};

const RANK_NAMES_ES = {
  2: 'Doses', 3: 'Treses', 4: 'Cuatros', 5: 'Cincos', 6: 'Seises',
  7: 'Sietes', 8: 'Ochos', 9: 'Nueves', 10: 'Dieces',
  11: 'Jotas', 12: 'Damas', 13: 'Reyes', 14: 'Ases',
};
const RANK_SINGLE_ES = {
  2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis',
  7: 'Siete', 8: 'Ocho', 9: 'Nueve', 10: 'Diez',
  11: 'Jota', 12: 'Dama', 13: 'Rey', 14: 'As',
};

function detailedName(rank, tb) {
  const r = v => RANK_NAMES_ES[v] || v;
  const rs = v => RANK_SINGLE_ES[v] || v;
  switch (rank) {
    case 1: return `Carta Alta (${rs(tb[0])})`;
    case 2: return `Par de ${r(tb[0])}`;
    case 3: return `Doble Par de ${r(tb[0])} y ${r(tb[1])}`;
    case 4: return `Trío de ${r(tb[0])}`;
    case 5: return `Escalera al ${rs(tb[0])}`;
    case 6: return `Color (${rs(tb[0])} alta)`;
    case 7: return `Full House (${r(tb[0])} y ${r(tb[1])})`;
    case 8: return `Póker de ${r(tb[0])}`;
    case 9: return `Escalera de Color al ${rs(tb[0])}`;
    case 10: return 'Escalera Real';
    default: return HAND_NAMES[rank];
  }
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ];
}

function evaluate5(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const counts = {};
  for (const c of cards) counts[c.value] = (counts[c.value] || 0) + 1;
  const freqs = Object.values(counts).sort((a, b) => b - a);
  const uniq = [...new Set(values)].sort((a, b) => b - a);

  const isFlush = new Set(suits).size === 1;
  let isStraight = false, hi = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { isStraight = true; hi = uniq[0]; }
    else if (JSON.stringify(uniq) === JSON.stringify([14, 5, 4, 3, 2])) { isStraight = true; hi = 5; }
  }

  if (isFlush && isStraight) return hi === 14 ? { rank: 10, tb: [14] } : { rank: 9, tb: [hi] };
  if (freqs[0] === 4) {
    const q = +Object.keys(counts).find(k => counts[k] === 4);
    return { rank: 8, tb: [q, values.find(v => v !== q)] };
  }
  if (freqs[0] === 3 && freqs[1] === 2) {
    const t = +Object.keys(counts).find(k => counts[k] === 3);
    const p = +Object.keys(counts).find(k => counts[k] === 2);
    return { rank: 7, tb: [t, p] };
  }
  if (isFlush) return { rank: 6, tb: values };
  if (isStraight) return { rank: 5, tb: [hi] };
  if (freqs[0] === 3) {
    const t = +Object.keys(counts).find(k => counts[k] === 3);
    return { rank: 4, tb: [t, ...values.filter(v => v !== t)] };
  }
  if (freqs[0] === 2 && freqs[1] === 2) {
    const ps = Object.keys(counts).filter(k => counts[k] === 2).map(Number).sort((a, b) => b - a);
    return { rank: 3, tb: [...ps, values.find(v => !ps.includes(v))] };
  }
  if (freqs[0] === 2) {
    const p = +Object.keys(counts).find(k => counts[k] === 2);
    return { rank: 2, tb: [p, ...values.filter(v => v !== p)] };
  }
  return { rank: 1, tb: values };
}

export function myBestHand(holeCards, community) {
  const all = [...holeCards, ...community].filter(c => c && c.rank);
  if (all.length < 5) {
    // Pre-flop / incomplete: describe hole cards
    if (holeCards.length === 2) {
      const [a, b] = holeCards;
      if (a.value === b.value) return { name: `Par de ${RANK_NAMES_ES[a.value]}`, rank: 2 };
      const hi = Math.max(a.value, b.value);
      const suited = a.suit === b.suit ? ' del mismo palo' : '';
      return { name: `${RANK_SINGLE_ES[hi]} alta${suited}`, rank: 1 };
    }
    return null;
  }
  let best = null;
  for (const combo of combinations(all, 5)) {
    const e = evaluate5(combo);
    if (!best || e.rank > best.rank ||
        (e.rank === best.rank && e.tb.some((v, i) => v > (best.tb[i] || 0) && e.tb.slice(0, i).every((x, j) => x === best.tb[j])))) {
      best = e;
    }
  }
  return { name: detailedName(best.rank, best.tb), rank: best.rank };
}

// Draw detection — what am I chasing?
export function myDraws(holeCards, community) {
  const comm = community.filter(c => c && c.rank);
  if (comm.length < 3 || comm.length >= 5) return [];
  const all = [...holeCards, ...comm];
  const draws = [];

  // Flush draw: exactly 4 of a suit (using at least one hole card)
  const suitCount = {};
  for (const c of all) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
  const fs = Object.keys(suitCount).find(s => suitCount[s] === 4);
  if (fs && holeCards.some(c => c.suit === fs)) {
    draws.push({ label: 'Proyecto de color', outs: 9 });
  }

  // Straight draws
  const vals = [...new Set(all.map(c => c.value))].sort((a, b) => a - b);
  const withWheelAce = vals.includes(14) ? [1, ...vals] : vals;
  let openEnded = false, gutshot = false;
  // open-ended: 4 consecutive (not capped both ends)
  for (let i = 0; i <= withWheelAce.length - 4; i++) {
    const w = withWheelAce.slice(i, i + 4);
    if (w[3] - w[0] === 3 && w[0] > 1 && w[3] < 14) openEnded = true;
  }
  // gutshot: 5-window with exactly one hole
  for (let lo = 1; lo <= 10; lo++) {
    const present = [0, 1, 2, 3, 4].filter(d => withWheelAce.includes(lo + d)).length;
    if (present === 4) gutshot = true;
  }
  if (openEnded) draws.push({ label: 'Proyecto de escalera abierta', outs: 8 });
  else if (gutshot) draws.push({ label: 'Proyecto de escalera interna', outs: 4 });

  return draws;
}
