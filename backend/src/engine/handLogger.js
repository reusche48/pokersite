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
    await pool.query(
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
  }
}

module.exports = HandLogger;
