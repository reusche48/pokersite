'use strict';

const HAND_RANKS = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10,
};

const HAND_NAMES = {
  1: 'Carta Alta',
  2: 'Par',
  3: 'Doble Par',
  4: 'Trío',
  5: 'Escalera',
  6: 'Color',
  7: 'Full House',
  8: 'Póker',
  9: 'Escalera de Color',
  10: 'Escalera Real',
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

function detailedHandName(rank, tiebreakers) {
  const base = HAND_NAMES[rank];
  const r = (v) => RANK_NAMES_ES[v] || v;
  const rs = (v) => RANK_SINGLE_ES[v] || v;

  switch (rank) {
    case 1: return `Carta Alta (${rs(tiebreakers[0])})`;
    case 2: return `Par de ${r(tiebreakers[0])}`;
    case 3: return `Doble Par de ${r(tiebreakers[0])} y ${r(tiebreakers[1])}`;
    case 4: return `Trío de ${r(tiebreakers[0])}`;
    case 5: return `Escalera al ${rs(tiebreakers[0])}`;
    case 6: return `Color (${rs(tiebreakers[0])} alta)`;
    case 7: return `Full House (${r(tiebreakers[0])} y ${r(tiebreakers[1])})`;
    case 8: return `Póker de ${r(tiebreakers[0])}`;
    case 9: return `Escalera de Color al ${rs(tiebreakers[0])}`;
    case 10: return 'Escalera Real';
    default: return base;
  }
}

// Generate all C(n, k) combinations
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function valueCounts(cards) {
  const counts = {};
  for (const c of cards) counts[c.value] = (counts[c.value] || 0) + 1;
  return counts;
}

function evaluate5(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const counts = valueCounts(cards);
  const freqs = Object.values(counts).sort((a, b) => b - a);
  const uniqueVals = [...new Set(values)].sort((a, b) => b - a);

  const isFlush = new Set(suits).size === 1;

  // Straight detection (including A-2-3-4-5)
  let isStraight = false;
  let straightHigh = 0;
  if (uniqueVals.length === 5) {
    if (uniqueVals[0] - uniqueVals[4] === 4) {
      isStraight = true;
      straightHigh = uniqueVals[0];
    } else if (JSON.stringify(uniqueVals) === JSON.stringify([14, 5, 4, 3, 2])) {
      // Wheel: A-2-3-4-5
      isStraight = true;
      straightHigh = 5;
    }
  }

  if (isFlush && isStraight) {
    if (straightHigh === 14) { const tb = [14]; return { rank: HAND_RANKS.ROYAL_FLUSH, tiebreakers: tb, name: detailedHandName(10, tb) }; }
    const tb = [straightHigh]; return { rank: HAND_RANKS.STRAIGHT_FLUSH, tiebreakers: tb, name: detailedHandName(9, tb) };
  }

  if (freqs[0] === 4) {
    const quadVal = parseInt(Object.keys(counts).find(k => counts[k] === 4));
    const kicker = values.find(v => v !== quadVal);
    const tb = [quadVal, kicker]; return { rank: HAND_RANKS.FOUR_OF_A_KIND, tiebreakers: tb, name: detailedHandName(8, tb) };
  }

  if (freqs[0] === 3 && freqs[1] === 2) {
    const tripVal = parseInt(Object.keys(counts).find(k => counts[k] === 3));
    const pairVal = parseInt(Object.keys(counts).find(k => counts[k] === 2));
    const tb = [tripVal, pairVal]; return { rank: HAND_RANKS.FULL_HOUSE, tiebreakers: tb, name: detailedHandName(7, tb) };
  }

  if (isFlush) {
    return { rank: HAND_RANKS.FLUSH, tiebreakers: values, name: detailedHandName(6, values) };
  }

  if (isStraight) {
    const tb = [straightHigh]; return { rank: HAND_RANKS.STRAIGHT, tiebreakers: tb, name: detailedHandName(5, tb) };
  }

  if (freqs[0] === 3) {
    const tripVal = parseInt(Object.keys(counts).find(k => counts[k] === 3));
    const kickers = values.filter(v => v !== tripVal);
    const tb = [tripVal, ...kickers]; return { rank: HAND_RANKS.THREE_OF_A_KIND, tiebreakers: tb, name: detailedHandName(4, tb) };
  }

  if (freqs[0] === 2 && freqs[1] === 2) {
    const pairs = Object.keys(counts).filter(k => counts[k] === 2).map(Number).sort((a, b) => b - a);
    const kicker = values.find(v => !pairs.includes(v));
    const tb = [...pairs, kicker]; return { rank: HAND_RANKS.TWO_PAIR, tiebreakers: tb, name: detailedHandName(3, tb) };
  }

  if (freqs[0] === 2) {
    const pairVal = parseInt(Object.keys(counts).find(k => counts[k] === 2));
    const kickers = values.filter(v => v !== pairVal);
    const tb = [pairVal, ...kickers]; return { rank: HAND_RANKS.ONE_PAIR, tiebreakers: tb, name: detailedHandName(2, tb) };
  }

  return { rank: HAND_RANKS.HIGH_CARD, tiebreakers: values, name: detailedHandName(1, values) };
}

// Returns 1 if a > b, -1 if a < b, 0 if tie
function compareHands(a, b) {
  // Null-safe: a missing hand always loses
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

// Find best 5-card hand from up to 7 cards
function bestHand(cards) {
  if (cards.length < 5) return null;
  const combos = combinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const evaluated = evaluate5(combo);
    if (!best || compareHands(evaluated, best) > 0) {
      best = { ...evaluated, cards: combo };
    }
  }
  return best;
}

module.exports = { bestHand, compareHands, HAND_RANKS, HAND_NAMES };
