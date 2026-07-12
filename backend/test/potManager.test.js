'use strict';

const test = require('node:test');
const assert = require('node:assert');
const PotManager = require('../src/engine/potManager');

// Manos ficticias: mayor "rank" gana (compareHands usa {rank, tiebreakers}).
const H = (r) => ({ rank: r, tiebreakers: [r] });
const sum = (awards) => Object.values(awards).reduce((a, b) => a + b, 0);

test('3-way all-in de stacks dispares (50/100/200): botes y conservación', () => {
  const pm = new PotManager();
  pm.addBet('A', 50, true);
  pm.addBet('B', 100, true);
  pm.addBet('C', 200, true);
  pm.collectStreetBets(['A', 'B', 'C']);
  assert.strictEqual(pm.totalPot(), 350);
  const awards = pm.awardPots([{ playerId: 'C', hand: H(9) }, { playerId: 'B', hand: H(5) }, { playerId: 'A', hand: H(3) }]);
  assert.strictEqual(sum(awards), 350, 'reparte exactamente el total');
  assert.strictEqual(awards['C'], 350, 'C gana los tres botes');
});

test('split pot: la ficha impar no se pierde', () => {
  const pm = new PotManager();
  pm.addBet('A', 25); pm.addBet('B', 25); pm.addBet('C', 25);
  pm.collectStreetBets(['A', 'B', 'C']);
  assert.strictEqual(pm.totalPot(), 75);
  const awards = pm.awardPots([{ playerId: 'A', hand: H(8) }, { playerId: 'B', hand: H(8) }, { playerId: 'C', hand: H(2) }]);
  assert.strictEqual(sum(awards), 75, 'conserva las 75 fichas incluida la impar');
});

test('BOTE HUÉRFANO: el único elegible de un side pot ya no está en la mano', () => {
  // A all-in 50; B y C apuestan 200 (side pot {B,C}=300) y luego se retiran.
  // En el showdown solo queda A. El side pot NO debe descartarse.
  const pm = new PotManager();
  pm.addBet('A', 50, true);
  pm.addBet('B', 200);
  pm.addBet('C', 200);
  pm.collectStreetBets(['A', 'B', 'C']);
  assert.strictEqual(pm.totalPot(), 450);
  const awards = pm.awardPots([{ playerId: 'A', hand: H(7) }]); // solo A en la mano
  assert.strictEqual(sum(awards), 450, 'ninguna ficha destruida');
  assert.strictEqual(awards['A'], 450, 'el bote huérfano va al único restante');
});

test('fichas de foldeados quedan en el bote pero no las gana el foldeado', () => {
  const pm = new PotManager();
  pm.addBet('A', 30); pm.addBet('B', 30); pm.addBet('C', 30);
  pm.collectStreetBets(['A', 'B']); // C se retiró: no elegible
  assert.strictEqual(pm.totalPot(), 90, 'las fichas de C siguen en el bote');
  const awards = pm.awardPots([{ playerId: 'A', hand: H(9) }, { playerId: 'B', hand: H(4) }]);
  assert.strictEqual(sum(awards), 90);
  assert.strictEqual(awards['C'] || 0, 0, 'C no gana nada');
  assert.strictEqual(awards['A'], 90);
});
