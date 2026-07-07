'use strict';

const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const { startTournament, DEFAULT_BLINDS, defaultPayout, getPlayerTable } = require('../engine/tournamentManager');

const MAX_FIELD = 30; // hasta 5 mesas de 6

// GET /tournaments  → lista (con nº de inscritos)
async function listTournaments(req, res) {
  const [rows] = await pool.query(
    `SELECT t.*, (SELECT COUNT(*) FROM tournament_registrations r WHERE r.tournament_id = t.id) AS registered
     FROM tournaments t
     WHERE t.status IN ('registering','running')
     ORDER BY t.created_at DESC LIMIT 50`
  );
  res.json(rows);
}

// GET /tournaments/:id  → detalle + inscritos
async function getTournament(req, res) {
  const [rows] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Torneo no encontrado' });
  const [regs] = await pool.query(
    `SELECT r.player_id, p.nickname, r.final_position, r.prize_won
     FROM tournament_registrations r JOIN players p ON p.id = r.player_id
     WHERE r.tournament_id = ? ORDER BY r.registered_at`,
    [req.params.id]
  );
  res.json({ ...rows[0], registrations: regs });
}

// POST /tournaments  (admin) → crear Sit&Go
async function createTournament(req, res) {
  const { name, maxPlayers = 6, buyIn = 100, blindSchedule = null } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nombre requerido' });
  const max = Math.min(Math.max(Number(maxPlayers) || 6, 2), MAX_FIELD);
  const id = uuidv4();
  const scheduleJson = JSON.stringify(Array.isArray(blindSchedule) && blindSchedule.length ? blindSchedule : DEFAULT_BLINDS);
  const payoutJson = JSON.stringify(defaultPayout(max));
  await pool.query(
    `INSERT INTO tournaments
       (id, name, game_type, chip_mode, tournament_type, max_players, min_players, buy_in, rake, prize_pool, payout_json, blind_schedule_json, status, created_by)
     VALUES (?, ?, 'holdem', 'play', 'sit_and_go', ?, 2, ?, 0, 0, ?, ?, 'registering', ?)`,
    [id, name.trim(), max, Number(buyIn) || 100, payoutJson, scheduleJson, req.player.id]
  );
  res.status(201).json({ id, name: name.trim(), maxPlayers: max, buyIn: Number(buyIn) || 100 });
}

// Inscribe a un jugador (cobra el buy-in a play_chips y suma al bote de premios)
async function registerPlayer(tournamentId, playerId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[t]] = await conn.query('SELECT * FROM tournaments WHERE id = ? FOR UPDATE', [tournamentId]);
    if (!t) throw { http: 404, msg: 'Torneo no encontrado' };
    if (t.status !== 'registering') throw { http: 400, msg: 'Inscripciones cerradas' };
    const [[cnt]] = await conn.query('SELECT COUNT(*) n FROM tournament_registrations WHERE tournament_id = ?', [tournamentId]);
    if (cnt.n >= t.max_players) throw { http: 400, msg: 'Torneo lleno' };
    const [[already]] = await conn.query('SELECT 1 x FROM tournament_registrations WHERE tournament_id = ? AND player_id = ?', [tournamentId, playerId]);
    if (already) throw { http: 400, msg: 'Ya estás inscrito' };
    const buyIn = parseFloat(t.buy_in) || 0;
    const [[p]] = await conn.query('SELECT play_chips FROM players WHERE id = ? FOR UPDATE', [playerId]);
    if (!p || p.play_chips < buyIn) throw { http: 400, msg: 'Fichas insuficientes para el buy-in' };
    await conn.query('UPDATE players SET play_chips = play_chips - ? WHERE id = ?', [buyIn, playerId]);
    await conn.query('INSERT INTO tournament_registrations (tournament_id, player_id) VALUES (?, ?)', [tournamentId, playerId]);
    await conn.query('UPDATE tournaments SET prize_pool = prize_pool + ? WHERE id = ?', [buyIn, tournamentId]);
    await conn.query(
      `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, 'play', ?, 'tournament_buyin', ?)`,
      [playerId, -buyIn, tournamentId]
    );
    await conn.commit();
    return { newCount: cnt.n + 1, max: t.max_players };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// POST /tournaments/:id/register  (el propio jugador)
async function register(req, res) {
  try {
    const r = await registerPlayer(req.params.id, req.player.id);
    // Auto-arranque al llenarse
    if (r.newCount >= r.max) startTournament(req.params.id).catch(e => console.error('[torneo autostart]', e.message));
    res.json({ ok: true, ...r });
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[register]', e); res.status(500).json({ error: 'Error al inscribir' });
  }
}

// POST /tournaments/:id/unregister
async function unregister(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[t]] = await conn.query('SELECT * FROM tournaments WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!t || t.status !== 'registering') { await conn.rollback(); return res.status(400).json({ error: 'No se puede cancelar' }); }
    const [del] = await conn.query('DELETE FROM tournament_registrations WHERE tournament_id = ? AND player_id = ?', [req.params.id, req.player.id]);
    if (del.affectedRows) {
      const buyIn = parseFloat(t.buy_in) || 0;
      await conn.query('UPDATE players SET play_chips = play_chips + ? WHERE id = ?', [buyIn, req.player.id]);
      await conn.query('UPDATE tournaments SET prize_pool = GREATEST(prize_pool - ?, 0) WHERE id = ?', [buyIn, req.params.id]);
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback(); res.status(500).json({ error: 'Error' });
  } finally {
    conn.release();
  }
}

// POST /tournaments/:id/bots  (admin) → rellenar con N bots de un nivel
async function fillBots(req, res) {
  const { level, count = 1 } = req.body;
  if (![5, 6, 7, 8, 9, 10].includes(Number(level))) return res.status(400).json({ error: 'Nivel 5-10' });
  const [[t]] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [req.params.id]);
  if (!t || t.status !== 'registering') return res.status(400).json({ error: 'Inscripciones cerradas' });
  const [[cnt]] = await pool.query('SELECT COUNT(*) n FROM tournament_registrations WHERE tournament_id = ?', [req.params.id]);
  const room = t.max_players - cnt.n;
  const n = Math.min(Number(count) || 1, room);
  if (n <= 0) return res.status(400).json({ error: 'Torneo lleno' });
  const [bots] = await pool.query(
    `SELECT b.bot_id FROM bots b
     WHERE b.level = ? AND b.bot_id NOT IN (SELECT player_id FROM tournament_registrations WHERE tournament_id = ?)
     ORDER BY RAND() LIMIT ?`,
    [Number(level), req.params.id, n]
  );
  let added = 0;
  for (const b of bots) {
    try { await registerPlayer(req.params.id, b.bot_id); added++; } catch {}
  }
  // Si con esto se llenó el cupo, arranca solo
  if (cnt.n + added >= t.max_players) {
    startTournament(req.params.id).catch(e => console.error('[torneo autostart bots]', e.message));
  }
  res.json({ added, started: cnt.n + added >= t.max_players });
}

// POST /tournaments/:id/start  (admin) → forzar inicio
async function start(req, res) {
  try {
    const r = await startTournament(req.params.id);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

// GET /tournaments/:id/my-table  → mesa actual del jugador (para (re)entrar)
async function myTable(req, res) {
  const tableId = getPlayerTable(req.params.id, req.player.id);
  if (!tableId) return res.status(404).json({ error: 'No estás en una mesa activa de este torneo' });
  res.json({ tableId });
}

module.exports = { listTournaments, getTournament, createTournament, register, unregister, fillBots, start, myTable };
