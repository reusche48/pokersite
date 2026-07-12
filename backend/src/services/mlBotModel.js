'use strict';

// Modelo de detección de bots por comportamiento temporal (Etapa 4, ML).
// Entrena una regresión logística sobre distribuciones DOCUMENTADAS de juego
// automatizado vs orgánico, y se valida contra los bots reales del sistema.
// A medida que juegan humanos reales, sus perfiles pueden reemplazar a los
// controles sintéticos para reentrenar con datos reales.
//
// Honestidad metodológica: los positivos (bots) siguen el modelo de "pensar"
// real del BotEngine (base por nivel + jitter uniforme). Los negativos
// (humanos) siguen una distribución de alta variabilidad — el hecho conocido
// de que los humanos varían mucho su tiempo de decisión y las máquinas no.

const fs = require('fs');
const path = require('path');
const { LogisticRegression, metrics } = require('./mlClassifier');

const MODEL_PATH = path.join(__dirname, '..', '..', 'data', 'ml_bot_model.json');
const FEATURES = ['media', 'desv', 'cv', 'mediana', 'fraccionRapida', 'minimo'];

// ── Features a partir de una serie de tiempos de reacción (ms) ──
function featuresFromTimes(times) {
  const n = times.length;
  if (n < 2) return null;
  const mean = times.reduce((s, x) => s + x, 0) / n;
  const std = Math.sqrt(times.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const fastFrac = times.filter(x => x < 800).length / n;
  const min = sorted[0];
  return [mean / 1000, std / 1000, mean ? std / mean : 0, median / 1000, fastFrac, min / 1000];
}

// ── Generadores de datos (distribuciones documentadas) ──
function randn() { // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Bot: "pensar" del BotEngine → base por nivel + jitter uniforme 0..700ms
function synthBotTimes() {
  const level = 5 + Math.floor(Math.random() * 8);
  const base = 1900 - (level - 5) * 120;
  const k = 15 + Math.floor(Math.random() * 20);
  const t = [];
  for (let i = 0; i < k; i++) t.push(Math.max(120, base + Math.random() * 700 + randn() * 40));
  return t;
}
// Humano: alta variabilidad — a veces snap, a veces tanquea; CV alto
function synthHumanTimes() {
  const meanH = 1800 + Math.random() * 3500;   // 1.8–5.3 s de media
  const cvH = 0.5 + Math.random() * 0.7;        // dispersión grande
  const k = 15 + Math.floor(Math.random() * 20);
  const t = [];
  for (let i = 0; i < k; i++) {
    let v = meanH * (1 + cvH * randn());
    if (Math.random() < 0.12) v = 300 + Math.random() * 500;   // decisión instantánea ocasional
    if (Math.random() < 0.08) v = meanH * (2 + Math.random() * 2); // tanqueo ocasional
    t.push(Math.max(150, v));
  }
  return t;
}

function buildDataset(nPer = 500) {
  const X = [], y = [];
  for (let i = 0; i < nPer; i++) {
    const b = featuresFromTimes(synthBotTimes()); if (b) { X.push(b); y.push(1); }
    const h = featuresFromTimes(synthHumanTimes()); if (h) { X.push(h); y.push(0); }
  }
  return { X, y };
}

function splitTrainTest(X, y, testFrac = 0.3) {
  const idx = X.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const cut = Math.floor(X.length * (1 - testFrac));
  const tr = idx.slice(0, cut), te = idx.slice(cut);
  return {
    Xtr: tr.map(i => X[i]), ytr: tr.map(i => y[i]),
    Xte: te.map(i => X[i]), yte: te.map(i => y[i]),
  };
}

// ── Entrenar + validar + guardar ──
// realBotProfiles: [{ nickname, times:[...] }] para validación en datos reales.
function train({ nPer = 500, realBotProfiles = [] } = {}) {
  const { X, y } = buildDataset(nPer);
  const { Xtr, ytr, Xte, yte } = splitTrainTest(X, y);
  const model = new LogisticRegression({ lr: 0.3, epochs: 600, l2: 0.002 });
  model.fit(Xtr, ytr);
  const probTe = Xte.map(r => model.proba(r));
  const m = metrics(yte, probTe);

  // Validación en bots REALES del sistema (los que tengan suficientes acciones)
  let realHit = 0, realN = 0;
  for (const rb of realBotProfiles) {
    const f = featuresFromTimes(rb.times);
    if (!f) continue;
    realN++;
    if (model.proba(f) >= 0.5) realHit++;
  }

  const card = {
    entrenadoConSinteticos: X.length,
    test: { n: yte.length, ...round(m) },
    validacionBotsReales: { n: realN, detectados: realHit, tasa: realN ? +(realHit / realN).toFixed(2) : null },
    pesos: FEATURES.map((f, i) => ({ feature: f, peso: +model.w[i].toFixed(3) })),
    entrenado_ts: Date.now(),
  };
  const payload = { model: model.toJSON(), features: FEATURES, card };
  try {
    fs.mkdirSync(path.dirname(MODEL_PATH), { recursive: true });
    fs.writeFileSync(MODEL_PATH, JSON.stringify(payload));
  } catch (e) { console.error('[mlBotModel] guardar:', e.message); }
  _cache = payload;
  return card;
}

function round(m) {
  return { acc: +m.acc.toFixed(3), precision: +m.precision.toFixed(3), recall: +m.recall.toFixed(3), f1: +m.f1.toFixed(3) };
}

// ── Cargar / puntuar ──
let _cache = undefined;
function load() {
  if (_cache !== undefined) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8')); }
  catch { _cache = null; }
  return _cache;
}

// Probabilidad de que una serie de tiempos venga de un bot + top factores.
function scoreTimes(times) {
  const payload = load();
  if (!payload) return null;
  const f = featuresFromTimes(times);
  if (!f) return null;
  const model = LogisticRegression.fromJSON(payload.model);
  const prob = model.proba(f);
  const contrib = model.contributions(f);
  const factores = payload.features
    .map((name, i) => ({ name, aporte: contrib[i] }))
    .filter(x => x.aporte > 0.15)
    .sort((a, b) => b.aporte - a.aporte)
    .slice(0, 2)
    .map(x => x.name);
  return { prob: +prob.toFixed(3), factores };
}

function modelCard() { const p = load(); return p ? p.card : null; }

module.exports = { train, load, scoreTimes, modelCard, featuresFromTimes, FEATURES, MODEL_PATH };
