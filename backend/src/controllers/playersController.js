'use strict';

const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');

async function getMe(req, res) {
  const [rows] = await pool.query(
    'SELECT id, nickname, email, play_chips, real_chips, avatar_config, country, created_at FROM players WHERE id = ?',
    [req.player.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}

async function getHistory(req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT id, table_id, tournament_id, hand_number, game_type, chip_mode,
            pot_total, winners_json, started_at, ended_at
     FROM hand_history
     WHERE JSON_SEARCH(players_json, 'one', ?, NULL, '$[*].playerId') IS NOT NULL
     ORDER BY ended_at DESC LIMIT ? OFFSET ?`,
    [req.player.id, limit, offset]
  );
  res.json(rows);
}

async function refill(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query('SELECT play_chips FROM players WHERE id = ? FOR UPDATE', [req.player.id]);
    if (p.play_chips >= 100) {
      await conn.rollback();
      return res.status(400).json({ error: 'You have enough chips' });
    }
    await conn.query('UPDATE players SET play_chips = play_chips + 1000 WHERE id = ?', [req.player.id]);
    await conn.query(
      `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason) VALUES (?, 'play', 1000, 'refill')`,
      [req.player.id]
    );
    await conn.commit();
    const [[updated]] = await conn.query('SELECT play_chips FROM players WHERE id = ?', [req.player.id]);
    res.json({ play_chips: updated.play_chips });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function updateAvatar(req, res) {
  const { avatarConfig } = req.body;
  if (!avatarConfig) return res.status(400).json({ error: 'avatarConfig required' });
  await pool.query('UPDATE players SET avatar_config = ? WHERE id = ?', [JSON.stringify(avatarConfig), req.player.id]);
  res.json({ ok: true });
}

// ── Estadísticas del jugador (a partir de su historial de manos) ──
async function getStats(req, res) {
  const pid = req.player.id;
  const [rows] = await pool.query(
    `SELECT actions_json, winners_json, ended_at
     FROM hand_history
     WHERE JSON_SEARCH(players_json, 'one', ?, NULL, '$[*].playerId') IS NOT NULL
     ORDER BY ended_at DESC LIMIT 500`,
    [pid]
  );
  const jp = v => { try { return typeof v === 'string' ? JSON.parse(v) : (v || []); } catch { return []; } };

  let wins = 0, totalWon = 0, totalInvested = 0, bestWin = 0;
  const byDay = new Map(); // 'YYYY-MM-DD' → { hands, net }

  for (const r of rows) {
    const winners = jp(r.winners_json);
    const actions = jp(r.actions_json);
    let won = 0, invested = 0;
    for (const w of winners) if (w.playerId === pid) won += Number(w.amount) || 0;
    for (const a of actions) {
      if (a.playerId === pid && a.action !== 'win' && Number(a.amount) > 0) invested += Number(a.amount);
    }
    if (won > 0) { wins++; totalWon += won; if (won > bestWin) bestWin = won; }
    totalInvested += invested;

    const day = new Date(r.ended_at).toISOString().slice(0, 10);
    const d = byDay.get(day) || { hands: 0, net: 0 };
    d.hands++;
    d.net += won - invested;
    byDay.set(day, d);
  }

  const series = [...byDay.entries()]
    .map(([date, d]) => ({ date, hands: d.hands, net: Math.round(d.net) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json({
    totalHands: rows.length,
    wins,
    winRate: rows.length ? Math.round((wins / rows.length) * 100) : 0,
    totalWon: Math.round(totalWon),
    totalInvested: Math.round(totalInvested),
    net: Math.round(totalWon - totalInvested),
    bestWin: Math.round(bestWin),
    series,
  });
}

// ── Etiquetas de testers (qué nivel le adivinan a cada jugador/bot) ──
async function saveLabel(req, res) {
  const { targetId, estimatedLevel, tag, note } = req.body;
  if (!targetId) return res.status(400).json({ error: 'targetId requerido' });
  if (targetId === req.player.id) return res.status(400).json({ error: 'No puedes etiquetarte a ti mismo' });
  const lvl = estimatedLevel === null || estimatedLevel === undefined ? null : Number(estimatedLevel);
  if (lvl !== null && (lvl < 1 || lvl > 10)) return res.status(400).json({ error: 'Nivel estimado 1-10' });
  await pool.query(
    `INSERT INTO tester_labels (tester_id, target_id, estimated_level, tag, note)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE estimated_level = VALUES(estimated_level), tag = VALUES(tag), note = VALUES(note)`,
    [req.player.id, targetId, lvl, tag || null, (note || '').slice(0, 200) || null]
  );
  res.json({ ok: true });
}

async function getLabels(req, res) {
  const [rows] = await pool.query(
    'SELECT target_id, estimated_level, tag, note FROM tester_labels WHERE tester_id = ?',
    [req.player.id]
  );
  // Mapa targetId -> { estimatedLevel, tag, note } para consumo directo en el cliente
  const map = {};
  for (const r of rows) map[r.target_id] = { estimatedLevel: r.estimated_level, tag: r.tag, note: r.note };
  res.json(map);
}

module.exports = { getMe, getHistory, refill, updateAvatar, saveLabel, getLabels, getStats };
