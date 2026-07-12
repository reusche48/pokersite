'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { bestHand, compareHands, HAND_RANKS } = require('../src/engine/variants/holdem/handEvaluator');

const VAL = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14 };
// c('As') -> { rank:'A', suit:'s', value:14 }
const c = (s) => ({ rank: s[0], suit: s[1], value: VAL[s[0]] });
const hand = (...ss) => bestHand(ss.map(c));

test('ranking: escalera real es el máximo', () => {
  const royal = hand('As', 'Ks', 'Qs', 'Js', 'Ts', '2h', '3d');
  assert.strictEqual(royal.rank, HAND_RANKS.ROYAL_FLUSH);
});

test('rueda A-2-3-4-5 es escalera de 5, no de A', () => {
  const wheel = hand('Ah', '2d', '3c', '4s', '5h', 'Kd', 'Qc');
  assert.strictEqual(wheel.rank, HAND_RANKS.STRAIGHT);
  assert.strictEqual(wheel.tiebreakers[0], 5); // 5-high, no 14
});

test('escalera de color vence a póker (four of a kind)', () => {
  const sf = hand('9s', '8s', '7s', '6s', '5s', 'Ah', 'Ad');
  const quads = hand('Ah', 'Ad', 'Ac', 'As', 'Kd', '2c', '3h');
  assert.strictEqual(sf.rank, HAND_RANKS.STRAIGHT_FLUSH);
  assert.strictEqual(quads.rank, HAND_RANKS.FOUR_OF_A_KIND);
  assert.ok(compareHands(sf, quads) > 0);
});

test('full house vence a color', () => {
  const boat = hand('Kh', 'Kd', 'Kc', 'Qs', 'Qh', '2d', '3c');
  const flush = hand('Ah', '9h', '7h', '4h', '2h', 'Ks', 'Qd');
  assert.strictEqual(boat.rank, HAND_RANKS.FULL_HOUSE);
  assert.strictEqual(flush.rank, HAND_RANKS.FLUSH);
  assert.ok(compareHands(boat, flush) > 0);
});

test('mejor mano de 7 cartas: elige el color aunque haya un par', () => {
  const h = hand('Ah', 'Kh', 'Qh', 'Jh', '2h', 'As', 'Ad');
  assert.strictEqual(h.rank, HAND_RANKS.FLUSH); // color A-high vence a par de ases
});

test('desempate por kicker: A-K-Q-J-9 vence a A-K-Q-J-8', () => {
  const a = hand('Ah', 'Kd', 'Qc', 'Js', '9h', '2d', '3c');
  const b = hand('As', 'Kc', 'Qd', 'Jh', '8h', '2c', '3d');
  assert.strictEqual(a.rank, HAND_RANKS.HIGH_CARD);
  assert.strictEqual(b.rank, HAND_RANKS.HIGH_CARD);
  assert.ok(compareHands(a, b) > 0);
});

test('desempate de doble par por el kicker', () => {
  const a = hand('Ah', 'Ad', 'Kc', 'Ks', 'Qh', '2d', '3c'); // AA KK Q
  const b = hand('As', 'Ac', 'Kd', 'Kh', 'Jh', '2c', '3d'); // AA KK J
  assert.strictEqual(a.rank, HAND_RANKS.TWO_PAIR);
  assert.ok(compareHands(a, b) > 0);
});

test('manos idénticas empatan (compareHands = 0)', () => {
  const a = hand('Ah', 'Kd', 'Qc', 'Js', 'Th', '2d', '3c'); // escalera A-high
  const b = hand('As', 'Kc', 'Qd', 'Jh', 'Ts', '4d', '5c'); // escalera A-high
  assert.strictEqual(a.rank, HAND_RANKS.STRAIGHT);
  assert.strictEqual(compareHands(a, b), 0);
});
