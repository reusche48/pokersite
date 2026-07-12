'use strict';

const pool = require('../config/db');

class HandLogger {
  constructor() {
    this.actions = [];
    this.seq = 0;
    this.startedAt = new Date();
  }

  log(playerId, action, amount, potAfter, extra = {}) {
    this.actions.push({
      seq: ++this.seq,
      playerId,
      action,
      amount,
      potAfter,
      at: new Date().toISOString(),
      ...extra,
    });
  }

  async persist({ tableId, tournamentId, handNumber, gameType, chipMode, players, community, potTotal, winners }) {
    const [result] = await pool.query(
      `INSERT INTO hand_history
        (table_id, tournament_id, hand_number, game_type, chip_mode,
         players_json, community_json, actions_json, pot_total, winners_json,
         started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        tableId,
        tournamentId || null,
        handNumber,
        gameType,
        chipMode,
        JSON.stringify(players),
        JSON.stringify(community),
        JSON.stringify(this.actions),
        potTotal,
        JSON.stringify(winners),
        this.startedAt,
      ]
    );

    // Poblar hand_players (pertenencia + neto por jugador) para consultar el
    // historial/stats con un JOIN indexado en vez de JSON_SEARCH. El neto es
    // ganado − invertido, calculado de las acciones y los ganadores de la mano.
    try {
      const handId = result.insertId;
      const invested = {};
      for (const a of this.actions) {
        if (a.playerId && a.action !== 'win' && Number(a.amount) > 0) {
          invested[a.playerId] = (invested[a.playerId] || 0) + Number(a.amount);
        }
      }
      const won = {};
      for (const w of (winners || [])) {
        if (w && w.playerId) won[w.playerId] = (won[w.playerId] || 0) + (Number(w.amount) || 0);
      }
      const seen = new Set();
      const values = [];
      for (const p of (players || [])) {
        if (!p || !p.playerId || seen.has(p.playerId)) continue;
        seen.add(p.playerId);
        values.push([handId, p.playerId, Math.round((won[p.playerId] || 0) - (invested[p.playerId] || 0))]);
      }
      if (values.length) await pool.query('INSERT IGNORE INTO hand_players (hand_id, player_id, net) VALUES ?', [values]);
    } catch (e) {
      console.error('[HandLogger] hand_players:', e.message);
    }
  }
}

module.exports = HandLogger;
