'use strict';

const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { setIo } = require('../engine/gameStateMachine');
const tm = require('../engine/tableManager');
const { snapshotCashTable } = require('../engine/cashPersistence');
const registerTableHandlers = require('./tableHandlers');

// Track which sockets belong to which player
const playerSockets = new Map(); // playerId → Set<socketId>

module.exports = function initSockets(io) {
  setIo(io);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('No token'));
    try {
      socket.player = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next(new Error('Invalid token'));
    }
    // El baneo se revisa también aquí, no solo en el login: un JWT vigente
    // no debe permitir seguir jugando después de un ban.
    try {
      const [[p]] = await pool.query('SELECT is_banned, is_bot FROM players WHERE id = ?', [socket.player.id]);
      if (p?.is_banned) return next(new Error('Account banned'));
      socket.isBot = !!p?.is_bot;
    } catch (e) {
      console.error('[socket auth] ban check:', e.message);
    }
    next();
  });

  io.on('connection', (socket) => {
    const pid = socket.player.id;
    socket.join(`player:${pid}`);

    // Rastro de conexión de humanos (los bots son loopback local, puro ruido)
    if (!socket.isBot) {
      const fwd = socket.handshake.headers['x-forwarded-for'];
      const ip = (typeof fwd === 'string' ? fwd.split(',')[0].trim() : '') || socket.handshake.address || '?';
      const ua = (socket.handshake.headers['user-agent'] || '').slice(0, 255);
      // Huella de dispositivo enviada por el cliente (hash estable, no PII).
      // Coincidencias entre cuentas ⇒ multicuenta; cambio dentro de una cuenta ⇒ posible ghosting.
      const fp = (socket.handshake.auth?.fingerprint || '').toString().slice(0, 64) || null;
      pool.query('INSERT INTO login_events (player_id, ip, user_agent, fingerprint) VALUES (?, ?, ?, ?)', [pid, ip, ua, fp])
        .catch(e => console.error('[login_events]', e.message));
    }

    // Track socket
    if (!playerSockets.has(pid)) playerSockets.set(pid, new Set());
    playerSockets.get(pid).add(socket.id);

    registerTableHandlers(socket, io);

    // Señal de interacción humana: el cliente real (navegador) la emite cuando
    // hay clics/toques/teclas. Un bot que habla directo al socket NO la emite.
    // Marca la última interacción (throttled) → el motor de riesgo puede señalar
    // cuentas humanas que actúan sin ninguna señal de interacción (automatización).
    let lastSig = 0;
    socket.on('client_signal', () => {
      if (socket.isBot) return;
      const now = Date.now();
      if (now - lastSig < 30000) return; // como máximo 1 actualización cada 30 s
      lastSig = now;
      pool.query('UPDATE players SET last_interaction = NOW() WHERE id = ?', [pid]).catch(() => {});
    });

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
          // En torneos, una desconexión breve NO expulsa: el jugador conserva
          // su asiento y sus fichas de torneo (se le auto-foldea si es su turno).
          if (table.isTournament) continue;

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
            // Actualizar el snapshot: el jugador ya fue reembolsado en vivo, así
            // que NO debe seguir en el snapshot (evita un doble reembolso al
            // reiniciar el server).
            snapshotCashTable(table);
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

  // Expulsar en vivo todos los sockets de un jugador (al banearlo)
  io.kickPlayer = (playerId) => {
    const sockets = playerSockets.get(playerId);
    if (!sockets) return 0;
    let n = 0;
    for (const sid of [...sockets]) {
      const s = io.sockets.sockets.get(sid);
      if (s) { s.disconnect(true); n++; }
    }
    return n;
  };
};
