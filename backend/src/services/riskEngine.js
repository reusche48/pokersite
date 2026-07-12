'use strict';

// Motor de riesgo anti-fraude (Etapa 3). A partir del historial de manos calcula
// un PERFIL DE COMPORTAMIENTO por jugador humano y un SCORE de riesgo 0–100 con
// nivel Verde/Amarillo/Naranja/Rojo. Cada punto del score lleva su MOTIVO — nada
// de cajas negras: el admin ve por qué se marcó a alguien.
//
// Señales:
//  · Timing (anti-bot/anti-RTA): los humanos varían mucho su tiempo de decisión;
//    las máquinas no. Un coeficiente de variación bajo es la firma más delatora.
//  · Multicuenta: comparte dispositivo/IP con otras cuentas (viene de login_events).
//  · Colusión: flujo de fichas fuertemente asimétrico y repetido con otro jugador.
//
// NO sanciona solo: produce alertas explicables para revisión humana.

const mlBotModel = require('./mlBotModel');

function stats(arr) {
  const n = arr.length;
  if (!n) return { n: 0 };
  const mean = arr.reduce((s, x) => s + x, 0) / n;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const fastFrac = arr.filter(x => x < 800).length / n;
  return { n, mean, std, cv: mean ? std / mean : 0, median, fastFrac };
}

function levelFor(score) {
  if (score >= 75) return 'rojo';
  if (score >= 50) return 'naranja';
  if (score >= 25) return 'amarillo';
  return 'verde';
}

const VOLUNTARY = new Set(['fold', 'check', 'call', 'raise', 'all_in', 'call_allin']);
const PREFLOP_VPIP = new Set(['call', 'raise', 'all_in', 'call_allin']);
const PREFLOP_PFR = new Set(['raise', 'all_in']);
const CONTRIB = new Set(['small_blind', 'big_blind', 'ante', 'call', 'raise', 'all_in', 'call_allin', 'bet']);

// pool: conexión mysql.
// opts.sharedFlags: Map playerId -> { device:[nombres], ip:[nombres] }
// opts.interacted: Set de playerId que han emitido señal de interacción humana
async function analyze(pool, { handLimit = 3000, sharedFlags = new Map(), interacted = new Set(), includeBots = false } = {}) {
  const [players] = await pool.query('SELECT id, nickname, is_bot FROM players');
  const nick = new Map(players.map(p => [p.id, p.nickname]));
  const isBot = new Map(players.map(p => [p.id, !!p.is_bot]));

  const [hands] = await pool.query(
    `SELECT players_json, actions_json, winners_json FROM hand_history ORDER BY id DESC LIMIT ?`,
    [handLimit]
  );
  const jp = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

  // Acumuladores por jugador
  const P = new Map(); // id -> { times:[], hands, vpip, pfr, preflopSeen }
  const get = id => {
    let p = P.get(id);
    if (!p) { p = { times: [], hands: 0, vpip: 0, pfr: 0, preflopSeen: 0 }; P.set(id, p); }
    return p;
  };
  const flow = new Map(); // "loser>winner" -> { amount, hands }

  for (const h of hands) {
    const players_ = jp(h.players_json) || [];
    const actions = jp(h.actions_json) || [];
    const winners = jp(h.winners_json) || [];

    // Índice de la primera calle comunitaria → separa preflop de postflop
    const flopIdx = actions.findIndex(a => a.action === 'street_flop');
    const preEnd = flopIdx === -1 ? actions.length : flopIdx;

    // Manos vistas + timing + VPIP/PFR
    const seen = new Set();
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (!a.playerId) continue;
      // Timing: solo acciones voluntarias, no automáticas, con reacción medida
      if (VOLUNTARY.has(a.action) && a.auto === false && typeof a.reactionMs === 'number') {
        get(a.playerId).times.push(a.reactionMs);
      }
      // Preflop: VPIP / PFR
      if (i < preEnd) {
        if (!seen.has(a.playerId) && (PREFLOP_VPIP.has(a.action) || a.action === 'check' || a.action === 'fold')) {
          get(a.playerId).preflopSeen++;
          seen.add(a.playerId);
        }
        if (PREFLOP_VPIP.has(a.action)) get(a.playerId).vpip++;
        if (PREFLOP_PFR.has(a.action)) get(a.playerId).pfr++;
      }
    }
    for (const pl of players_) if (pl.playerId) get(pl.playerId).hands++;

    // Flujo de fichas (chip dumping) — solo entre humanos
    if (winners.length) {
      const contributed = {};
      for (const a of actions) {
        if (a.playerId && a.amount > 0 && CONTRIB.has(a.action)) {
          contributed[a.playerId] = (contributed[a.playerId] || 0) + Number(a.amount);
        }
      }
      const totalWon = winners.reduce((s, w) => s + Number(w.amount || 0), 0) || 1;
      const winnerIds = new Set(winners.map(w => w.playerId));
      for (const pl of players_) {
        const pid = pl.playerId;
        if (!pid || winnerIds.has(pid)) continue;
        const lost = contributed[pid] || 0;
        if (lost <= 0) continue;
        for (const w of winners) {
          if (isBot.get(pid) || isBot.get(w.playerId)) continue; // solo humano↔humano
          const share = Number(w.amount || 0) / totalWon;
          const key = `${pid}>${w.playerId}`;
          const f = flow.get(key) || { amount: 0, hands: 0 };
          f.amount += lost * share; f.hands += 1;
          flow.set(key, f);
        }
      }
    }
  }

  // Pares de colusión (flujo asimétrico fuerte y repetido)
  const collusionPairs = [];
  const colludeWith = new Map(); // id -> [nombres]
  for (const [key, f] of flow) {
    const [loserId, winnerId] = key.split('>');
    const rev = flow.get(`${winnerId}>${loserId}`) || { amount: 0 };
    if (f.hands >= 8 && f.amount >= 1500 && f.amount >= 3 * rev.amount) {
      collusionPairs.push({
        pierdeId: loserId, pierde: nick.get(loserId),
        ganaId: winnerId, gana: nick.get(winnerId),
        fichas: Math.round(f.amount), fichasInverso: Math.round(rev.amount), manos: f.hands,
      });
      for (const id of [loserId, winnerId]) {
        if (!colludeWith.has(id)) colludeWith.set(id, []);
        colludeWith.get(id).push(nick.get(id === loserId ? winnerId : loserId));
      }
    }
  }
  collusionPairs.sort((a, b) => b.fichas - a.fichas);

  // chipFlows (misma forma que antes, para el panel)
  const chipFlows = collusionPairs.slice(0, 20);

  // ── Score por jugador ──
  // Candidatos: quienes jugaron manos + quienes comparten dispositivo/IP
  // (una multicuenta que nunca jugó igual debe puntuar por la señal de sharing).
  const candidatos = new Set([...P.keys(), ...sharedFlags.keys()]);
  const scored = [];
  for (const id of candidatos) {
    if (isBot.get(id) && !includeBots) continue;
    const p = P.get(id) || { times: [], hands: 0, vpip: 0, pfr: 0, preflopSeen: 0 };
    if (!p.hands && !sharedFlags.has(id)) continue;
    const t = stats(p.times);
    const motivos = [];
    let score = 0;

    // Timing por REGLAS (solo con muestra suficiente, sin falsos positivos)
    let iaProb = null;
    if (t.n >= 15) {
      if (t.cv < 0.20) { score += 45; motivos.push(`Tiempos de reacción anormalmente uniformes (CV ${t.cv.toFixed(2)}) — firma de automatización`); }
      else if (t.cv < 0.35) { score += 22; motivos.push(`Tiempos de reacción poco variables (CV ${t.cv.toFixed(2)})`); }
      if (t.std < 350) { score += 18; motivos.push(`Muy baja dispersión temporal (±${Math.round(t.std)} ms)`); }
      if (t.fastFrac > 0.85) { score += 18; motivos.push(`Decide muy rápido casi siempre (${Math.round(t.fastFrac * 100)}% < 0,8 s)`); }
      if (t.mean < 500) { score += 15; motivos.push(`Reacción casi instantánea sostenida (${Math.round(t.mean)} ms de media)`); }

      // Modelo de ML (corrobora las reglas con una probabilidad calibrada)
      const ml = mlBotModel.scoreTimes(p.times);
      if (ml) {
        iaProb = ml.prob;
        if (ml.prob >= 0.85) {
          score += 20;
          motivos.push(`IA: ${Math.round(ml.prob * 100)}% de probabilidad de automatización${ml.factores.length ? ` (${ml.factores.join(', ')})` : ''}`);
        }
      }
    } else {
      motivos.push(`Timing insuficiente (${t.n} acciones) — análisis temporal omitido`);
    }

    // Multicuenta (dispositivo pesa más que IP)
    const sf = sharedFlags.get(id);
    if (sf?.device?.length) { score += 30; motivos.push(`Comparte dispositivo con: ${[...new Set(sf.device)].join(', ')}`); }
    else if (sf?.ip?.length) { score += 12; motivos.push(`Comparte IP/red con: ${[...new Set(sf.ip)].join(', ')}`); }

    // Colusión
    const cw = colludeWith.get(id);
    if (cw?.length) { score += 30; motivos.push(`Flujo de fichas sospechoso con: ${[...new Set(cw)].join(', ')}`); }

    // Endurecimiento del cliente: actúa mucho pero nunca emitió señal de
    // interacción humana → posible bot hablando directo al socket.
    if (!isBot.get(id) && t.n >= 20 && !interacted.has(id)) {
      score += 18;
      motivos.push('Actúa sin señales de interacción humana (posible automatización directa al socket)');
    }

    score = Math.min(100, score);
    scored.push({
      id, nickname: nick.get(id), isBot: isBot.get(id),
      score, nivel: levelFor(score), motivos,
      perfil: {
        manos: p.hands, acciones: t.n,
        reaccionMediaMs: t.n ? Math.round(t.mean) : null,
        reaccionCV: t.n ? +t.cv.toFixed(2) : null,
        iaProb,
        vpip: p.preflopSeen ? Math.round(100 * p.vpip / p.preflopSeen) : null,
        pfr: p.preflopSeen ? Math.round(100 * p.pfr / p.preflopSeen) : null,
      },
    });
  }
  scored.sort((a, b) => b.score - a.score);

  return { jugadores: scored, colusion: collusionPairs, chipFlows };
}

// Recolecta los tiempos de reacción por jugador (para entrenar/validar el ML).
// botsOnly=true devuelve solo perfiles de bots con suficientes acciones —
// son el ground truth para validar el detector.
async function collectTimes(pool, { handLimit = 5000, botsOnly = false, minActions = 12 } = {}) {
  const [players] = await pool.query('SELECT id, nickname, is_bot FROM players');
  const nick = new Map(players.map(p => [p.id, p.nickname]));
  const isBot = new Map(players.map(p => [p.id, !!p.is_bot]));
  const [hands] = await pool.query(
    'SELECT actions_json FROM hand_history ORDER BY id DESC LIMIT ?', [handLimit]
  );
  const jp = v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
  const times = new Map();
  for (const h of hands) {
    const actions = jp(h.actions_json) || [];
    for (const a of actions) {
      if (a.playerId && VOLUNTARY.has(a.action) && a.auto === false && typeof a.reactionMs === 'number') {
        if (!times.has(a.playerId)) times.set(a.playerId, []);
        times.get(a.playerId).push(a.reactionMs);
      }
    }
  }
  const out = [];
  for (const [id, arr] of times) {
    if (arr.length < minActions) continue;
    if (botsOnly && !isBot.get(id)) continue;
    out.push({ id, nickname: nick.get(id), isBot: isBot.get(id), times: arr });
  }
  return out;
}

module.exports = { analyze, levelFor, collectTimes };
