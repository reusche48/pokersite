'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createDeck, shuffle, deal } = require('../src/engine/deck');

test('la baraja tiene 52 cartas únicas', () => {
  const deck = createDeck();
  assert.strictEqual(deck.length, 52);
  const keys = new Set(deck.map(c => c.rank + c.suit));
  assert.strictEqual(keys.size, 52, 'sin duplicados');
});

test('shuffle conserva las 52 cartas (permutación, no pérdida)', () => {
  const deck = shuffle(createDeck());
  assert.strictEqual(deck.length, 52);
  assert.strictEqual(new Set(deck.map(c => c.rank + c.suit)).size, 52);
});

test('deal reparte del tope y reduce la baraja', () => {
  const deck = createDeck();
  const cards = deal(deck, 2);
  assert.strictEqual(cards.length, 2);
  assert.strictEqual(deck.length, 50);
});

test('shuffle no es la identidad (baraja de verdad)', () => {
  // Con RNG cripto, la probabilidad de que 52 cartas queden idénticas es ~0.
  const orig = createDeck().map(c => c.rank + c.suit);
  const shuffled = shuffle(createDeck()).map(c => c.rank + c.suit);
  const iguales = orig.every((k, i) => k === shuffled[i]);
  assert.strictEqual(iguales, false);
});
