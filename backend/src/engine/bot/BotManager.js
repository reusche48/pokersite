'use strict';

// Orquesta los bots vivos en proceso. Un bot activo = un BotClient (socket loopback).
// Escala esperada: decenas de bots activos a la vez (no los 100 simultáneos).

const pool = require('../../config/db');
const { BotClient } = require('./BotClient');

// botId -> { client, tableId, level, nickname }
const activeBots = new Map();

// Trae bots libres (no sentados ahora) de un nivel dado
async function pickAvailableBots(level, count) {
  const busy = [...activeBots.keys()];
  const placeholders = busy.length ? busy.map(() => '?').join(',') : null;
  let sql = `SELECT b.bot_id, b.level, b.personality_json, p.nickname, p.play_chips
             FROM bots b JOIN players p ON p.id = b.bot_id
             WHERE b.level = ?`;
  const params = [level];
  if (placeholders) { sql += ` AND b.bot_id NOT IN (${placeholders})`; params.push(...busy); }
  sql += ` ORDER BY RAND() LIMIT ?`;
  params.push(count);
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Sienta N bots de un nivel en una mesa
async function seatBots({ tableId, level, count, buyIn = 500 }) {
  const bots = await pickAvailableBots(level, count);
  const seated = [];
  let delay = 0;
  for (const b of bots) {
    let personality = {};
    try { personality = typeof b.personality_json === 'string' ? JSON.parse(b.personality_json) : (b.personality_json || {}); } catch {}
    // Escalonar las conexiones para no saturar el server de golpe
    setTimeout(() => {
      if (activeBots.has(b.bot_id)) return;
      const client = new BotClient({
        botId: b.bot_id, nickname: b.nickname, level: b.level,
        personality, tableId, buyIn,
      });
      activeBots.set(b.bot_id, { client, tableId, level: b.level, nickname: b.nickname });
    }, delay);
    delay += 350;
    seated.push({ botId: b.bot_id, nickname: b.nickname, level: b.level });
  }
  return { requested: count, seated: seated.length, bots: seated };
}

// Retira bots (todos de una mesa, o una lista concreta)
function unseatBots({ tableId, ids }) {
  let removed = 0;
  for (const [botId, info] of activeBots) {
    const match = ids ? ids.includes(botId) : info.tableId === tableId;
    if (match) {
      try { info.client.leave(); } catch {}
      activeBots.delete(botId);
      removed++;
    }
  }
  return { removed };
}

// Lista de bots vivos (uso admin — sí incluye nivel)
function listActive() {
  return [...activeBots.entries()].map(([botId, i]) => ({
    botId, nickname: i.nickname, level: i.level, tableId: i.tableId,
  }));
}

module.exports = { seatBots, unseatBots, listActive };
