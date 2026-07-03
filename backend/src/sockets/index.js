'use strict';

const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { setIo } = require('../engine/gameStateMachine');
const tm = require('../engine/tableManager');
const registerTableHandlers = require('./tableHandlers');

// Track which sockets belong to which player
const playerSockets = new Map(); // playerId → Set<socketId>

module.exports = function initSockets(io) {
  setIo(io);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('No token'));
    try {
      socket.player = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const pid = socket.player.id;
    socket.join(`player:${pid}`);

    // Track socket
    if (!playerSockets.has(pid)) playerSockets.set(pid, new Set());
    playerSockets.get(pid).add(socket.id);

    registerTableHandlers(socket, io);

    socket.on('disconnect', async () => {
      // Remove socket from tracking
      const sockets = playerSockets.get(pid);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) playerSockets.delete(pid);
      }

      // If player has no more sockets, remove from all tables (if game is waiting)
      // If game is active, keep the seat but they'll time out
      if (!playerSockets.has(pid) || playerSockets.get(pid).size === 0) {
        for (const table of tm.getAllTables()) {
          const seat = table.seats.find(s => s.playerId === pid);
          if (!seat) continue;

          if (table.phase === 'waiting') {
            // Safe to remove — no hand in progress
            const stack = tm.standPlayer(table, pid);
            if (stack > 0) {
              // Anti-ratholing tracking on disconnect too
              table.recentLeavers.set(pid, { stack, at: Date.now() });
              const CHIP_COLS = { real: 'real_chips', play: 'play_chips' };
              const chipCol = CHIP_COLS[table.chipMode] || 'play_chips';
              try {
                await pool.query(`UPDATE players SET ${chipCol} = ${chipCol} + ? WHERE id = ?`, [stack, pid]);
                await pool.query(
                  `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, ?, ?, 'buy_in', ?)`,
                  [pid, table.chipMode, stack, table.id]
                );
              } catch (e) { console.error('[disconnect] chip refund error:', e); }
            }
            io.to(`table:${table.id}`).emit('player_left', { playerId: pid });
          }
          // If game is active, the action timeout will auto-fold them
        }
      }
    });
  });

  // Utility: check if a player is currently connected
  io.isPlayerConnected = (playerId) => {
    const sockets = playerSockets.get(playerId);
    return sockets && sockets.size > 0;
  };
};
