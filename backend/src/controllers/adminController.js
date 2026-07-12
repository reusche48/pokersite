'use strict';

const pool = require('../config/db');
const botManager = require('../engine/bot/BotManager');
const tm = require('../engine/tableManager');
const riskEngine = require('../services/riskEngine');
const mlBotModel = require('../services/mlBotModel');

// POST /admin/bots/seat  { tableId, level, count, buyIn? }
async function seatBots(req, res) {
  const { tableId, level, count = 1, buyIn } = req.body;
  if (!tableId) return res.status(400).json({ error: 'tableId requerido' });
  if (![5, 6, 7, 8, 9, 10, 11, 12].includes(Number(level))) return res.status(400).json({ error: 'Nivel debe ser 5-12' });
  const n = Math.max(1, Math.min(Number(count) || 1, 8));
  if (!tm.getTable(tableId)) return res.status(404).json({ error: 'Mesa no encontrada (¿está creada y viva?)' });
  const result = await botManager.seatBots({ tableId, level: Number(level), count: n, buyIn: buyIn ? Number(buyIn) : undefined });
  res.json(result);
}

// POST /admin/bots/unseat  { tableId }  ó  { ids: [...] }
async function unseatBots(req, res) {
  const { tableId, ids } = req.body;
  if (!tableId && !ids) return res.status(400).json({ error: 'tableId o ids requerido' });
  res.json(botManager.unseatBots({ tableId, ids }));
}

// GET /admin/bots  → bots vivos (con nivel, solo admin)
async function listActiveBots(req, res) {
  res.json(botManager.listActive());
}

// GET /admin/labels/accuracy → compara nivel adivinado por cada tester vs nivel real
async function labelAccuracy(req, res) {
  const [rows] = await pool.query(
    `SELECT t.tester_id, pt.nickname AS tester_nick,
            t.target_id, po.nickname AS target_nick,
            t.estimated_level, b.level AS real_level
     FROM tester_labels t
     JOIN players pt ON pt.id = t.tester_id
     JOIN players po ON po.id = t.target_id
     JOIN bots b ON b.bot_id = t.target_id
     WHERE t.estimated_level IS NOT NULL
     ORDER BY pt.nickname, po.nickname`
  );
  // Resumen de precisión por tester
  const byTester = {};
  for (const r of rows) {
    const k = r.tester_id;
    if (!byTester[k]) byTester[k] = { tester: r.tester_nick, total: 0, exactos: 0, cerca: 0, sumaError: 0, detalle: [] };
    const err = Math.abs(r.estimated_level - r.real_level);
    byTester[k].total++;
    if (err === 0) byTester[k].exactos++;
    if (err <= 1) byTester[k].cerca++;
    byTester[k].sumaError += err;
    byTester[k].detalle.push({ bot: r.target_nick, adivinado: r.estimated_level, real: r.real_level, error: err });
  }
  const resumen = Object.values(byTester).map(t => ({
    ...t,
    errorPromedio: t.total ? +(t.sumaError / t.total).toFixed(2) : 0,
  }));
  res.json(resumen);
}

// GET /admin/dashboard → panorama en vivo del sistema
async function dashboard(req, res) {
  const [[players]] = await pool.query(
    'SELECT COUNT(*) total, SUM(is_bot=0) humanos, SUM(is_bot=1) bots FROM players'
  );
  const [[chips]] = await pool.query(
    'SELECT SUM(play_chips) circulacion FROM players WHERE is_bot = 0'
  );
  const [[handsToday]] = await pool.query(
    'SELECT COUNT(*) n FROM hand_history WHERE ended_at >= CURDATE()'
  );
  const [[handsTotal]] = await pool.query('SELECT COUNT(*) n FROM hand_history');
  const [tourneys] = await pool.query(
    `SELECT name, status, prize_pool,
       (SELECT COUNT(*) FROM tournament_registrations r WHERE r.tournament_id = t.id) regs
     FROM tournaments t WHERE status IN ('registering','running') ORDER BY created_at DESC LIMIT 10`
  );
  const [lastTx] = await pool.query(
    `SELECT ct.delta, ct.reason, ct.created_at, p.nickname
     FROM chip_transactions ct JOIN players p ON p.id = ct.player_id
     ORDER BY ct.id DESC LIMIT 12`
  );
  // Mesas vivas en memoria (con gente sentada)
  const liveTables = tm.getAllTables()
    .map(t => ({
      id: t.id, name: t.name, isTournament: !!t.isTournament, handNumber: t.handNumber || 0,
      seated: t.seats.filter(s => s.playerId).length, maxSeats: t.seats.length,
    }))
    .filter(t => t.seated > 0);
  res.json({
    players: { total: players.total, humanos: players.humanos, bots: players.bots },
    chipsCirculacion: Number(chips.circulacion) || 0,
    manosHoy: handsToday.n,
    manosTotal: handsTotal.n,
    botsActivos: botManager.listActive().length,
    mesasVivas: liveTables,
    torneos: tourneys,
    ultimasTransacciones: lastTx,
  });
}

// POST /clubs/:id/tables/:tableId/bots — el dueño del club sienta bots en SU mesa
async function seatClubBots(req, res) {
  const { isClubOwner } = require('./clubsController');
  if (!(await isClubOwner(req.params.id, req.player.id))) {
    return res.status(403).json({ error: 'Solo el dueño del club puede sentar bots' });
  }
  const table = tm.getTable(req.params.tableId);
  if (!table || table.clubId !== req.params.id) return res.status(404).json({ error: 'Esa mesa no es de este club (¿está viva?)' });
  const { level, count = 1, buyIn } = req.body;
  if (![5, 6, 7, 8, 9, 10, 11, 12].includes(Number(level))) return res.status(400).json({ error: 'Nivel debe ser 5-12' });
  const n = Math.max(1, Math.min(Number(count) || 1, 8));
  const result = await botManager.seatBots({ tableId: req.params.tableId, level: Number(level), count: n, buyIn: buyIn ? Number(buyIn) : undefined });
  res.json(result);
}

// ── Vigilancia anti-trampas ──

// POST /admin/players/:id/ban  { banned: true|false, reason?, scoreAt? }
// Banear también lo expulsa de sus mesas al instante (kick de sockets:
// el middleware de conexión ya no lo dejará volver a entrar). Toda acción
// queda registrada en moderation_actions con su motivo (debido proceso).
async function banPlayer(req, res) {
  const targetId = req.params.id;
  const banned = req.body.banned !== false; // default: banear
  const reason = (req.body.reason || '').toString().slice(0, 300) || null;
  const scoreAt = Number.isFinite(+req.body.scoreAt) ? Math.round(+req.body.scoreAt) : null;
  if (targetId === req.player.id) return res.status(400).json({ error: 'No puedes banearte a ti mismo' });
  const [[target]] = await pool.query('SELECT id, nickname, is_admin, is_bot FROM players WHERE id = ?', [targetId]);
  if (!target) return res.status(404).json({ error: 'Jugador no encontrado' });
  if (target.is_admin) return res.status(400).json({ error: 'No se puede banear a un admin' });

  if (banned) {
    // token_version++ revoca sus JWT REST inmediatamente (no solo el socket).
    await pool.query('UPDATE players SET is_banned = 1, ban_reason = ?, token_version = token_version + 1 WHERE id = ?', [reason, targetId]);
  } else {
    // Desbanear limpia motivo y apelación
    await pool.query('UPDATE players SET is_banned = 0, ban_reason = NULL, appeal_text = NULL, appealed_at = NULL WHERE id = ?', [targetId]);
  }
  await pool.query(
    'INSERT INTO moderation_actions (player_id, action, reason, score_at, by_admin) VALUES (?, ?, ?, ?, ?)',
    [targetId, banned ? 'ban' : 'unban', reason, scoreAt, req.player.id]
  );

  let kicked = 0;
  if (banned) {
    const { getIo } = require('../engine/gameStateMachine');
    const io = getIo();
    if (io?.kickPlayer) kicked = io.kickPlayer(targetId);
  }
  res.json({ ok: true, nickname: target.nickname, banned, kicked });
}

// Agrupa cuentas humanas que comparten una misma clave (IP o huella) en la
// ventana. Devuelve grupos con ≥2 cuentas, cada uno con la lista de jugadores
// (id+nick) para poder banear desde el panel. Se agrupa en JS para conservar
// los IDs (un GROUP_CONCAT los perdería).
async function groupBySharedKey(keyCol, extraWhere = '') {
  const [rows] = await pool.query(
    `SELECT le.${keyCol} AS k, le.player_id AS id, p.nickname, MAX(le.at) AS ultima
     FROM login_events le JOIN players p ON p.id = le.player_id
     WHERE p.is_bot = 0 AND le.${keyCol} IS NOT NULL ${extraWhere}
       AND le.at >= NOW() - INTERVAL 30 DAY
     GROUP BY le.${keyCol}, le.player_id, p.nickname`
  );
  const groups = new Map();
  for (const r of rows) {
    let g = groups.get(r.k);
    if (!g) { g = { clave: r.k, jugadores: [], ultima_vez: r.ultima }; groups.set(r.k, g); }
    g.jugadores.push({ id: r.id, nickname: r.nickname });
    if (r.ultima > g.ultima_vez) g.ultima_vez = r.ultima;
  }
  return [...groups.values()]
    .filter(g => g.jugadores.length >= 2)
    .map(g => ({ ...g, cuentas: g.jugadores.length }))
    .sort((a, b) => b.cuentas - a.cuentas || new Date(b.ultima_vez) - new Date(a.ultima_vez))
    .slice(0, 30);
}

// GET /admin/security → señales de trampa para revisión humana.
// Nada aquí banea solo: son alertas para que el admin decida.
async function securityReport(req, res) {
  // 1) Cuentas que comparten IP o dispositivo (multicuenta / colusión de casa)
  const sameIp = await groupBySharedKey('ip');
  const sameDevice = await groupBySharedKey('fingerprint');

  // 2) Mapa de "con quién comparte" por jugador → alimenta el score de riesgo
  const sharedFlags = new Map();
  const addShared = (groups, kind) => {
    for (const g of groups) {
      for (const j of g.jugadores) {
        const others = g.jugadores.filter(o => o.id !== j.id).map(o => o.nickname);
        if (!others.length) continue;
        const sf = sharedFlags.get(j.id) || { device: [], ip: [] };
        sf[kind].push(...others);
        sharedFlags.set(j.id, sf);
      }
    }
  };
  addShared(sameDevice, 'device');
  addShared(sameIp, 'ip');

  // 3) Quién ha emitido señal de interacción humana (endurecimiento del cliente)
  const [interRows] = await pool.query('SELECT id FROM players WHERE last_interaction IS NOT NULL');
  const interacted = new Set(interRows.map(r => r.id));

  // 4) Motor de riesgo: perfiles de comportamiento, colusión y score 0–100
  //    (un solo recorrido del historial hace timing + VPIP/PFR + flujo de fichas)
  const risk = await riskEngine.analyze(pool, { handLimit: 3000, sharedFlags, interacted });

  // 4) Baneados actuales (con motivo y si apelaron)
  const [banned] = await pool.query(
    `SELECT id, nickname, last_seen, ban_reason, appeal_text, appealed_at
     FROM players WHERE is_banned = 1 ORDER BY appealed_at IS NULL, last_seen DESC`
  );

  // 5) Bitácora de moderación reciente (trazabilidad)
  const [bitacora] = await pool.query(
    `SELECT m.action, m.reason, m.score_at, m.at, p.nickname
     FROM moderation_actions m JOIN players p ON p.id = m.player_id
     ORDER BY m.id DESC LIMIT 20`
  );

  res.json({
    mismaIp: sameIp,
    mismoDispositivo: sameDevice,
    flujoFichas: risk.chipFlows,
    jugadores: risk.jugadores,   // ranking de riesgo con score + motivos
    baneados: banned,
    bitacora,
    modeloIA: mlBotModel.modelCard(),  // ficha del modelo (null si no entrenado)
  });
}

// POST /admin/ml/train → (re)entrena el detector de bots y lo valida contra
// los bots reales del sistema. Devuelve la ficha del modelo con las métricas.
async function trainModel(req, res) {
  try {
    const realBotProfiles = await riskEngine.collectTimes(pool, { botsOnly: true, minActions: 12 });
    const card = mlBotModel.train({ nPer: 600, realBotProfiles });
    res.json({ ok: true, ...card });
  } catch (e) {
    console.error('[trainModel]', e); res.status(500).json({ error: 'Error al entrenar el modelo' });
  }
}

module.exports = { seatBots, unseatBots, listActiveBots, labelAccuracy, dashboard, seatClubBots, banPlayer, securityReport, trainModel };
