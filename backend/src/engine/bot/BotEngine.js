'use strict';

// Motor de decisión de bots, parametrizado por nivel (5–10).
// El nivel 5 es la base histórica (testBot.js). Cada nivel superior AÑADE
// capacidades de forma acumulativa. Además cada bot tiene una "personalidad"
// (jitter determinista por nombre) para que dos bots del mismo nivel no
// jueguen idéntico.

const { bestHand } = require('../variants/holdem/handEvaluator');

// Capacidades activas por nivel (acumulativas)
const LEVEL_CONFIG = {
  5:  { position: false, texture: false, sizing: false, modeling: false, balanced: false, pushfold: false, bluffFreq: 0.10 },
  6:  { position: true,  texture: false, sizing: false, modeling: false, balanced: false, pushfold: false, bluffFreq: 0.10 },
  7:  { position: true,  texture: true,  sizing: false, modeling: false, balanced: false, pushfold: false, bluffFreq: 0.10 },
  8:  { position: true,  texture: true,  sizing: true,  modeling: false, balanced: false, pushfold: false, bluffFreq: 0.11 },
  9:  { position: true,  texture: true,  sizing: true,  modeling: true,  balanced: false, pushfold: false, bluffFreq: 0.12 },
  10: { position: true,  texture: true,  sizing: true,  modeling: true,  balanced: true,  pushfold: true,  bluffFreq: 0.14 },
};

class BotEngine {
  constructor({ level = 5, personality = {} } = {}) {
    this.level = Math.max(5, Math.min(10, level));
    this.cfg = LEVEL_CONFIG[this.level];
    // personality: aggro/tight en [-0.15, 0.15] aprox
    this.aggro = personality.aggro || 0;
    this.tight = personality.tight || 0;
    // Modelado de rival (nivel 9+): stats por nickname dentro de la sesión
    this.opp = new Map(); // nickname -> { hands, vpip, aggroActs, totalActs }
  }

  // ── Observación de acciones para el modelado de rival ──
  observe({ nickname, action, phase }) {
    if (!this.cfg.modeling || !nickname) return;
    let o = this.opp.get(nickname);
    if (!o) { o = { hands: 0, vpip: 0, aggroActs: 0, totalActs: 0 }; this.opp.set(nickname, o); }
    o.totalActs++;
    if (['raise', 'all_in'].includes(action)) o.aggroActs++;
    if (phase === 'pre_flop' && ['call', 'raise', 'all_in'].includes(action)) o.vpip++;
  }
  noteHandStart(nicknames = []) {
    if (!this.cfg.modeling) return;
    for (const n of nicknames) {
      const o = this.opp.get(n);
      if (o) o.hands++;
    }
  }
  _readOpp(nickname) {
    const o = this.opp.get(nickname);
    if (!o || o.hands < 6) return { known: false };
    const vpipRate = o.vpip / Math.max(o.hands, 1);
    const aggroRate = o.aggroActs / Math.max(o.totalActs, 1);
    return {
      known: true,
      station: vpipRate > 0.55 && aggroRate < 0.15, // paga mucho, sube poco
      nit: vpipRate < 0.20,                          // juega poquísimas manos
    };
  }

  // ── Fuerza de mano ──
  _preflopStrength(cards) {
    if (cards.length < 2) return 0;
    const [a, b] = cards;
    const hi = Math.max(a.value, b.value);
    const lo = Math.min(a.value, b.value);
    const suited = a.suit === b.suit;
    const gap = hi - lo;
    if (a.value === b.value) return 4 + (a.value - 2) * 0.5; // par
    let s = 0;
    if (hi === 14) s = 4;
    else if (hi === 13) s = 3;
    else if (hi === 12) s = 2.5;
    else if (hi >= 10) s = 2;
    else s = 1;
    if (suited) s += 1;
    if (gap === 1) s += 1;
    else if (gap === 2) s += 0.5;
    if (lo >= 10) s += 1;
    return Math.min(s, 9);
  }
  _postflopStrength(myCards, community) {
    const hand = bestHand([...myCards, ...community]);
    if (!hand) return { s: 0, rank: 0 };
    let s = (hand.rank - 1) * 1.6;
    if (hand.rank === 1 && hand.tiebreakers[0] >= 13) s += 0.8;
    return { s: Math.min(s, 10), rank: hand.rank };
  }
  _detectDraws(myCards, community) {
    if (community.length < 3 || community.length >= 5) return { flush: false, straight: false };
    const all = [...myCards, ...community];
    const suitCount = {};
    for (const c of all) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
    const flushSuit = Object.keys(suitCount).find(su => suitCount[su] === 4);
    const flush = !!flushSuit && myCards.some(c => c.suit === flushSuit);
    const vals = [...new Set(all.map(c => c.value))].sort((x, y) => x - y);
    let straight = false;
    for (let i = 0; i <= vals.length - 4; i++) {
      if (vals[i + 3] - vals[i] === 3 && vals[i] >= 2 && vals[i + 3] <= 13) { straight = true; break; }
    }
    return { flush, straight };
  }

  // ── Textura del tablero (nivel 7+) ── devuelve "humedad" 0..1
  _boardWetness(community) {
    if (community.length < 3) return 0;
    let w = 0;
    const suits = {};
    for (const c of community) suits[c.suit] = (suits[c.suit] || 0) + 1;
    const maxSuit = Math.max(...Object.values(suits));
    if (maxSuit >= 3) w += 0.5;         // color posible
    else if (maxSuit === 2) w += 0.2;   // proyecto de color
    const vals = [...new Set(community.map(c => c.value))].sort((a, b) => a - b);
    for (let i = 0; i < vals.length - 1; i++) {
      if (vals[i + 1] - vals[i] <= 2) { w += 0.25; break; } // conectado
    }
    return Math.min(w, 1);
  }

  // ── Posición (nivel 6+) ── posFactor 0 (temprana) .. 1 (botón)
  _posFactor(ctx) {
    const active = ctx.seats.filter(s => s.playerId && ['active', 'all_in'].includes(s.status))
      .sort((a, b) => a.position - b.position);
    const n = active.length;
    if (n <= 1) return 0.5;
    // Orden de acción postflop: empieza en SB y el botón actúa último
    const sbIdx = active.findIndex(s => s.isSB);
    const start = sbIdx >= 0 ? sbIdx : (active.findIndex(s => s.isDealer) + 1) % n;
    const order = [...active.slice(start), ...active.slice(0, start)];
    const myIdx = order.findIndex(s => s.position === ctx.myPosition);
    if (myIdx < 0) return 0.5;
    return myIdx / (n - 1); // SB=0 ... botón=1
  }

  // ── Sizing (nivel 8+) ── tamaño de apuesta según bote/textura
  _sizeBet(ctx, { value, wetness }) {
    const { pot, currentBet, lastRaiseSize, myStack, myStreetBet, bigBlind } = ctx;
    const minRaiseTo = currentBet + lastRaiseSize;
    if (!this.cfg.sizing) return Math.min(minRaiseTo, currentBet + myStreetBet + myStack);
    // Fracción de bote: más grande por valor y en boards húmedos (protección)
    let frac = value ? 0.6 : 0.45;
    frac += wetness * 0.25;
    frac += this.aggro * 0.5;
    const target = currentBet + Math.round((pot || bigBlind) * frac);
    const raiseTo = Math.max(minRaiseTo, target);
    const cap = myStreetBet + myStack; // no más de lo que tengo
    return Math.min(raiseTo, cap);
  }

  // ── Decisión principal ──
  decide(ctx) {
    const { myCards, community, currentBet, lastRaiseSize, myStreetBet, myStack, pot, bigBlind } = ctx;
    const owed = Math.max(0, currentBet - myStreetBet);
    const postflop = community.length >= 3;

    let strength, rank = 0;
    if (postflop) { const r = this._postflopStrength(myCards, community); strength = r.s; rank = r.rank; }
    else strength = this._preflopStrength(myCards);

    const draws = postflop ? this._detectDraws(myCards, community) : { flush: false, straight: false };
    const hasDraw = draws.flush || draws.straight;
    if (draws.flush) strength += 2.5;
    if (draws.straight) strength += 2;

    const wetness = this.cfg.texture ? this._boardWetness(community) : 0;
    // Nivel 7: no sobrevalorar un par en board húmedo
    if (this.cfg.texture && postflop && rank <= 2 && wetness > 0.4) strength -= wetness * 1.5;

    const posFactor = this.cfg.position ? this._posFactor(ctx) : 0.5;

    // Nivel 10: push/fold con stack corto (M = stack / bigBlind)
    if (this.cfg.pushfold && !postflop && bigBlind > 0) {
      const M = myStack / bigBlind;
      if (M > 0 && M < 8) {
        const shoveReq = 4.5 - posFactor * 1.5 + this.tight; // en posición, empuja más flojo
        if (strength >= shoveReq && myStack > 0) return { type: 'raise', amount: myStreetBet + myStack };
        if (owed > 0) return { type: 'fold' };
        return { type: 'check' };
      }
    }

    // Ajuste por personalidad y posición sobre los umbrales
    const posBonus = this.cfg.position ? (posFactor - 0.5) * 2.0 : 0; // ±1.0
    const effStrength = strength + posBonus + this.aggro;

    // Modelado de rival (nivel 9): ¿el que apostó es estación o nit?
    let vsStation = false, vsNit = false;
    if (this.cfg.modeling && ctx.lastAggressorNick) {
      const read = this._readOpp(ctx.lastAggressorNick);
      if (read.known) { vsStation = read.station; vsNit = read.nit; }
    }

    const bluffFreq = this.cfg.bluffFreq * (1 + this.aggro) * (vsStation ? 0.3 : 1) * (vsNit ? 1.6 : 1);

    // ── Sin apuesta que igualar ──
    if (owed === 0) {
      const canBet = myStack > lastRaiseSize;
      const raiseTo = this._sizeBet(ctx, { value: true, wetness });
      // Value bet
      if (postflop && effStrength >= 4.5 && Math.random() < (0.55 + this.aggro) && canBet) {
        return { type: 'raise', amount: this._sizeBet(ctx, { value: true, wetness }) };
      }
      // Semi-bluff con proyecto
      if (hasDraw && Math.random() < 0.35 && canBet) {
        return { type: 'raise', amount: this._sizeBet(ctx, { value: false, wetness }) };
      }
      // Bluff puro (frecuencia según nivel/rival)
      if (postflop && Math.random() < bluffFreq && canBet) {
        return { type: 'raise', amount: this._sizeBet(ctx, { value: false, wetness }) };
      }
      // Preflop open-raise: umbral según posición
      if (!postflop && canBet) {
        const openReq = (this.cfg.position ? 5.5 + (1 - posFactor) * 2.5 : 6) + this.tight;
        if (strength >= openReq && Math.random() < (0.5 + this.aggro)) {
          return { type: 'raise', amount: raiseTo };
        }
      }
      return { type: 'check' };
    }

    // ── Frente a una apuesta ──
    const raiseThreshold = (postflop ? 6 : 7) + this.tight;
    if (effStrength >= raiseThreshold && Math.random() < (0.4 + this.aggro) && myStack > owed + lastRaiseSize) {
      return { type: 'raise', amount: this._sizeBet(ctx, { value: true, wetness }) };
    }

    // Pot odds: precio vs equity estimada
    const price = owed / Math.max(pot + owed, 1);
    let equity = Math.min(effStrength / 11, 0.9);
    if (vsStation) equity += 0.05; // paga: cobramos más fino pero también nos pagan
    if (vsNit) equity -= 0.08;     // si el nit apuesta, cuidado
    if (equity >= price) return { type: 'call' };

    // Calls baratos con mano jugable
    if (owed <= bigBlind && strength >= 1 && !vsNit) return { type: 'call' };

    return { type: 'fold' };
  }
}

module.exports = { BotEngine, LEVEL_CONFIG };
