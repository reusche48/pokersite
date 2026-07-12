'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { validateAction } = require('../src/engine/actionValidator');

// Mesa mínima: A (pos 0) por actuar, apuesta actual 10, ya puso 0 → debe 10.
function baseTable(over = {}) {
  return {
    phase: 'pre_flop',
    actionPosition: 0,
    currentBet: 10,
    lastRaiseSize: 10,
    bigBlind: 10,
    streetBets: {},
    seats: [{ playerId: 'A', position: 0, status: 'active', stack: 100 }],
    ...over,
  };
}

test('rechaza acción fuera de fase (waiting/showdown)', () => {
  for (const phase of ['waiting', 'showdown']) {
    const r = validateAction(baseTable({ phase }), 'A', { type: 'call' });
    assert.strictEqual(r.valid, false, `fase ${phase} debe rechazarse`);
  }
});

test('rechaza si no es tu turno', () => {
  const r = validateAction(baseTable({ actionPosition: 1 }), 'A', { type: 'call' });
  assert.strictEqual(r.valid, false);
});

test('check ilegal cuando debes fichas', () => {
  const r = validateAction(baseTable(), 'A', { type: 'check' });
  assert.strictEqual(r.valid, false);
});

test('call resuelve al monto debido', () => {
  const r = validateAction(baseTable(), 'A', { type: 'call' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.resolvedAmount, 10);
});

test('raise por debajo del mínimo se rechaza', () => {
  // min raise-to = currentBet(10) + lastRaiseSize(10) = 20; pedir 15 es ilegal
  const r = validateAction(baseTable(), 'A', { type: 'raise', amount: 15 });
  assert.strictEqual(r.valid, false);
});

test('raise con monto no entero se rechaza', () => {
  const r = validateAction(baseTable(), 'A', { type: 'raise', amount: 20.5 });
  assert.strictEqual(r.valid, false);
});

test('raise válido a 20 (mínimo) se acepta', () => {
  const r = validateAction(baseTable(), 'A', { type: 'raise', amount: 20 });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.resolvedAmount, 20); // 20 - myBet(0)
});

test('all-in por debajo del min-raise se permite (no reabre)', () => {
  // stack 15 < min-raise: va all-in for less, válido
  const r = validateAction(baseTable({ seats: [{ playerId: 'A', position: 0, status: 'active', stack: 15 }] }), 'A', { type: 'raise', amount: 15 });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.isAllIn, true);
});

test('call all-in for less cuando el stack no cubre lo debido', () => {
  const r = validateAction(baseTable({ currentBet: 200, seats: [{ playerId: 'A', position: 0, status: 'active', stack: 40 }] }), 'A', { type: 'call' });
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.resolvedAmount, 40);
  assert.strictEqual(r.isAllIn, true);
});
