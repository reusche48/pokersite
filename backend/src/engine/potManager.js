'use strict';

const { compareHands } = require('./variants/holdem/handEvaluator');

class PotManager {
  constructor() {
    this.pots = []; // [{ amount, eligiblePlayerIds: Set }]
    this.streetBets = {}; // { playerId: amount }
    this.allInAmounts = []; // { playerId, amount }
  }

  addBet(playerId, amount, isAllIn = false) {
    this.streetBets[playerId] = (this.streetBets[playerId] || 0) + amount;
    if (isAllIn) {
      this.allInAmounts.push({ playerId, totalBet: this.streetBets[playerId] });
    }
  }

  // Call at end of each betting street to move streetBets into pots
  collectStreetBets(activePlayers) {
    const contributions = Object.entries(this.streetBets).map(([playerId, amount]) => ({
      playerId,
      amount,
    }));
    if (!contributions.length) return;

    const allInCaps = this.allInAmounts.map(a => a.totalBet).sort((x, y) => x - y);
    const playerIds = new Set(activePlayers);

    // Calculate running total per player across all pots
    const paid = {};
    for (const { playerId, amount } of contributions) paid[playerId] = amount;

    // Process each all-in cap level, then the remainder
    const levels = [...new Set(allInCaps)];
    let prevCap = 0;

    for (const cap of levels) {
      const levelSize = cap - prevCap;
      if (levelSize <= 0) continue;
      let potAmount = 0;
      const eligible = new Set();
      for (const { playerId, amount } of contributions) {
        const contribution = Math.min(Math.max(amount - prevCap, 0), levelSize);
        potAmount += contribution;
        // Only non-folded players can win the pot (their chips stay in regardless)
        if (amount >= cap && playerIds.has(playerId)) eligible.add(playerId);
      }
      if (potAmount > 0) this._addToPot(potAmount, eligible);
      prevCap = cap;
    }

    // Remainder pot (everyone who bet more than the last all-in cap)
    let remainder = 0;
    const remainderEligible = new Set();
    for (const { playerId, amount } of contributions) {
      const contribution = Math.max(amount - prevCap, 0);
      remainder += contribution;
      if (contribution > 0 && playerIds.has(playerId)) remainderEligible.add(playerId);
    }
    // Fallback: never create a pot nobody can win — give it to all active players
    if (remainder > 0) this._addToPot(remainder, remainderEligible.size ? remainderEligible : playerIds);

    this.streetBets = {};
    this.allInAmounts = [];
  }

  _addToPot(amount, eligible) {
    // Merge into existing pot with same eligible set if possible
    for (const pot of this.pots) {
      if (setsEqual(pot.eligiblePlayerIds, eligible)) {
        pot.amount += amount;
        return;
      }
    }
    this.pots.push({ amount, eligiblePlayerIds: new Set(eligible) });
  }

  // Award pots. winners: [{ playerId, hand }] sorted best→worst per pot
  awardPots(rankedPlayers) {
    const awards = {};
    for (const pot of this.pots) {
      let eligible = rankedPlayers.filter(p => pot.eligiblePlayerIds.has(p.playerId));
      // Nunca descartar un bote: si ningún elegible sigue en la mano (p.ej. se
      // retiraron o abandonaron todos los que podían ganarlo), se adjudica al
      // mejor jugador restante en la mano para NO destruir fichas.
      if (!eligible.length) eligible = rankedPlayers;
      if (!eligible.length) continue; // nadie en la mano — imposible en un showdown
      const best = eligible[0].hand;
      const tiedWinners = eligible.filter(p => p.hand && best && compareHands(p.hand, best) === 0);
      if (!tiedWinners.length) tiedWinners.push(eligible[0]);
      const share = Math.floor(pot.amount / tiedWinners.length);
      const remainder = pot.amount - share * tiedWinners.length;
      for (let i = 0; i < tiedWinners.length; i++) {
        const pid = tiedWinners[i].playerId;
        awards[pid] = (awards[pid] || 0) + share + (i === 0 ? remainder : 0);
      }
    }
    return awards;
  }

  totalPot() {
    return this.pots.reduce((s, p) => s + p.amount, 0) +
           Object.values(this.streetBets).reduce((s, v) => s + v, 0);
  }

  getPotsSnapshot() {
    return this.pots.map(p => ({ amount: p.amount, eligiblePlayerIds: [...p.eligiblePlayerIds] }));
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

module.exports = PotManager;
