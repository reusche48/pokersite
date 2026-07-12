'use strict';

// Persistencia de mesas CASH ante reinicios.
//
// El estado de juego (stacks) vive solo en RAM (tableManager). El buy-in se
// debita en la DB al sentarse y solo se re-acredita al salir/desconectar. Si el
// proceso reinicia (deploy/crash) los stacks en RAM se pierden: el jugador pagó
// el buy-in pero nunca recupera sus fichas.
//
// Estrategia (bajo riesgo, sin pérdida de dinero): guardamos un snapshot de los
// stacks de los jugadores HUMANOS sentados (al terminar cada mano y al
// entrar/salir), y al arrancar el servidor REEMBOLSAMOS esos stacks al saldo del
// jugador y limpiamos el snapshot (idempotente: no reembolsa dos veces). Las
// mesas cash no reanudan la partida en curso — el jugador vuelve a sentarse —,
// pero el dinero nunca se pierde ni se duplica.

const pool = require('./../config/db');

// Guarda los stacks de los jugadores sentados en una mesa cash. Se ignoran las
// mesas de torneo (esas ya persisten aparte) y se guardan también los bots, que
// se filtran al reanudar (no se les reembolsa nada).
async function snapshotCashTable(table) {
  if (!table || table.isTournament) return;
  try {
    const seated = table.seats
      .filter(s => s.playerId && s.status !== 'empty')
      .map(s => ({ playerId: s.playerId, stack: Math.max(0, Math.floor(s.stack) || 0) }));
    const json = seated.length ? JSON.stringify(seated) : null;
    await pool.query('UPDATE tables_cash SET runtime_json = ? WHERE id = ?', [json, table.id]);
  } catch (e) {
    console.error('[cashSnapshot]', table.id, e.message);
  }
}

// Al arrancar: reembolsa a cada jugador humano el stack con el que quedó en cada
// mesa cash y limpia el snapshot. Idempotente por el UPDATE ... = NULL final.
async function resumeCashTables() {
  let refunded = 0, tables = 0;
  try {
    const [rows] = await pool.query(
      "SELECT id, chip_mode, runtime_json FROM tables_cash WHERE runtime_json IS NOT NULL AND status != 'closed'"
    );
    for (const t of rows) {
      let seated;
      try { seated = JSON.parse(t.runtime_json); } catch { seated = null; }
      if (!Array.isArray(seated) || !seated.length) {
        await pool.query('UPDATE tables_cash SET runtime_json = NULL WHERE id = ?', [t.id]);
        continue;
      }
      tables++;
      const chipCol = t.chip_mode === 'real' ? 'real_chips' : 'play_chips';
      const ids = seated.map(s => s.playerId);
      // Identificar bots para NO reembolsarles (sus fichas son efímeras)
      const [bots] = await pool.query(
        `SELECT id FROM players WHERE is_bot = 1 AND id IN (${ids.map(() => '?').join(',')})`, ids
      );
      const botSet = new Set(bots.map(b => b.id));
      for (const s of seated) {
        const stack = Math.max(0, Math.floor(Number(s.stack)) || 0);
        if (stack <= 0 || botSet.has(s.playerId)) continue;
        try {
          await pool.query(`UPDATE players SET ${chipCol} = ${chipCol} + ? WHERE id = ?`, [stack, s.playerId]);
          await pool.query(
            `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id)
             VALUES (?, ?, ?, 'buy_in', ?)`,
            [s.playerId, t.chip_mode, stack, t.id]
          );
          refunded++;
        } catch (e) {
          console.error('[cashResume] refund', s.playerId, e.message);
        }
      }
      // Limpiar SIEMPRE el snapshot para no reembolsar dos veces en el próximo reinicio
      await pool.query('UPDATE tables_cash SET runtime_json = NULL WHERE id = ?', [t.id]);
    }
    if (tables) console.log(`[cashResume] ${refunded} reembolso(s) de ${tables} mesa(s) cash tras reinicio`);
  } catch (e) {
    console.error('[cashResume]', e.message);
  }
}

module.exports = { snapshotCashTable, resumeCashTables };
