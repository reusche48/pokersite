'use strict';

const pool = require('../config/db');
const tm = require('../engine/tableManager');
const { startHand, processAction, publicTableState, handlePlayerExit } = require('../engine/gameStateMachine');
const { snapshotCashTable } = require('../engine/cashPersistence');

// SQL column whitelist — never interpolate anything else into queries
const CHIP_COLS = { real: 'real_chips', play: 'play_chips' };
function chipColFor(table) {
  return CHIP_COLS[table.chipMode] || 'play_chips';
}

module.exports = function registerTableHandlers(socket, io) {
  const { player } = socket; // set by auth middleware
  let joining = false; // prevent concurrent join_table calls

  socket.on('join_table', async ({ tableId, buyIn }) => {
    if (joining) return;
    joining = true;
    try {
      let table = tm.getTable(tableId);
      if (!table) {
        // Try to load from DB
        const [rows] = await pool.query('SELECT * FROM tables_cash WHERE id = ?', [tableId]);
        if (!rows.length) return socket.emit('error', { code: 'TABLE_NOT_FOUND' });
        const t = rows[0];
        table = tm.createTable({
          id: t.id, name: t.name, gameType: t.game_type, chipMode: t.chip_mode,
          maxSeats: t.max_seats, smallBlind: t.small_blind, bigBlind: t.big_blind,
          buyInMin: t.buy_in_min, buyInMax: t.buy_in_max,
        });
        // Mesa de club: restaurar club y rake al rehidratar tras un reinicio
        if (t.club_id) {
          const live = tm.getTable(t.id);
          live.clubId = t.club_id;
          live.rakePct = parseFloat(t.rake_pct) || 0;
          live.rakeCapBB = Number(t.rake_cap_bb) || 0;
        }
      }

      // Mesa de club: miembros activos del club o de un club ALIADO (unión).
      // (Los bots están exentos — solo el dueño del club puede sentarlos.)
      if (table.clubId) {
        const { canPlayClub } = require('../controllers/clubsController');
        const [[bot]] = await pool.query('SELECT 1 x FROM players WHERE id = ? AND is_bot = 1', [player.id]);
        if (!bot && !(await canPlayClub(table.clubId, player.id))) {
          return socket.emit('error', { code: 'NOT_CLUB_MEMBER', message: 'Esta mesa es de un club — únete al club (o a su unión) primero' });
        }
      }

      // Mesa de torneo: solo los inscritos, que el manager ya sentó, pueden
      // entrar (llegan por el rejoin idempotente de más abajo). Un intruso NO
      // está sentado → se le impide comprar un asiento y jugar contra los
      // inscritos (evita robo de fichas y corrupción de standings/rebalanceo).
      if (table.isTournament && !tm.isPlayerSeated(table, player.id)) {
        return socket.emit('error', { code: 'NOT_IN_TOURNAMENT', message: 'Esta mesa es de un torneo — inscríbete desde el lobby' });
      }

      // Un socket solo debe estar en UNA sala de mesa a la vez. Al entrar a una
      // mesa, sale de cualquier otra sala table:* (clave para mover jugadores
      // entre mesas en torneos multi-mesa sin recibir eventos de dos mesas).
      for (const room of socket.rooms) {
        if (room.startsWith('table:') && room !== `table:${tableId}`) socket.leave(room);
      }

      // If player already seated — just re-join room, re-send state
      if (tm.isPlayerSeated(table, player.id)) {
        socket.join(`table:${tableId}`);
        socket.join(`player:${player.id}`);
        socket.emit('table_state', publicTableState(table));
        const existingSeat = tm.getPlayerSeat(table, player.id);
        // Re-send hole cards whenever the seat still holds them
        // (they're only cleared when the next hand starts)
        if (existingSeat?.cards?.length > 0) {
          socket.emit('cards_dealt', { holeCards: existingSeat.cards });
        }
        // Re-send action_required if it's this player's turn
        if (table.actionPosition !== null && table.phase !== 'waiting') {
          const actionSeat = table.seats.find(s => s.position === table.actionPosition);
          if (actionSeat?.playerId === player.id) {
            socket.emit('action_required', {
              playerId: player.id,
              timeoutMs: Math.max(0, (table.actionDeadline || 0) - Date.now()),
              deadline: table.actionDeadline,
            });
          }
        }
        return;
      }

      // Anti-ratholing: returning to the same table within 30 min requires
      // buying in for AT LEAST the stack you left with (recargar sí, bajar no)
      const RATHOLE_WINDOW_MS = 30 * 60 * 1000;
      let ratholeMin = 0;
      const leaver = table.recentLeavers.get(player.id);
      if (leaver) {
        if (Date.now() - leaver.at > RATHOLE_WINDOW_MS) {
          table.recentLeavers.delete(player.id); // window expired
        } else {
          ratholeMin = leaver.stack;
        }
      }

      const amount = parseFloat(buyIn);
      // El buy-in debe ser un entero positivo y finito. Sin esto, un buyIn no
      // numérico → amount=NaN, y NaN<min y NaN>max son AMBAS falsas: pasaría la
      // validación y descontaría play_chips - NaN, corrompiendo saldo y bote.
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        return socket.emit('error', { code: 'INVALID_BUYIN', message: 'Buy-in inválido' });
      }
      // The previous-stack rule may exceed the table max — that's allowed
      const effectiveMax = Math.max(table.buyInMax, ratholeMin);
      if (amount < table.buyInMin || amount > effectiveMax) {
        return socket.emit('error', { code: 'INVALID_BUYIN', message: `Buy-in debe ser ${table.buyInMin}–${effectiveMax}` });
      }
      if (ratholeMin > 0 && amount < ratholeMin) {
        return socket.emit('error', {
          code: 'ANTI_RATHOLING',
          message: `Saliste de esta mesa con ${ratholeMin} fichas hace poco. Para volver debes entrar con al menos ${ratholeMin} (o esperar 30 minutos).`,
          minBuyIn: ratholeMin,
        });
      }
      if (!table.seats.some(s => s.status === 'empty' && !s.playerId)) {
        return socket.emit('error', { code: 'TABLE_FULL', message: 'Mesa llena' });
      }

      const chipCol = chipColFor(table);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [[p]] = await conn.query(`SELECT ${chipCol} AS chips FROM players WHERE id = ? FOR UPDATE`, [player.id]);
        if (!p || p.chips < amount) {
          await conn.rollback();
          return socket.emit('error', { code: 'INSUFFICIENT_CHIPS' });
        }
        await conn.query(`UPDATE players SET ${chipCol} = ${chipCol} - ? WHERE id = ?`, [amount, player.id]);
        await conn.query(
          `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, ?, ?, 'buy_in', ?)`,
          [player.id, table.chipMode, -amount, tableId]
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }

      // Double-check not seated (race condition guard)
      if (tm.isPlayerSeated(table, player.id)) {
        // Refund — someone else seated us between check and now
        await pool.query(`UPDATE players SET ${chipCol} = ${chipCol} + ? WHERE id = ?`, [amount, player.id]);
        socket.join(`table:${tableId}`);
        socket.emit('table_state', publicTableState(table));
        return;
      }

      const seat = tm.seatPlayer(table, player.id, player.nickname, amount);
      if (!seat) {
        // Table filled while we were charging — REFUND
        await pool.query(`UPDATE players SET ${chipCol} = ${chipCol} + ? WHERE id = ?`, [amount, player.id]);
        await pool.query(
          `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, ?, ?, 'buy_in', ?)`,
          [player.id, table.chipMode, amount, tableId]
        );
        return socket.emit('error', { code: 'TABLE_FULL', message: 'Mesa llena' });
      }

      // Cargar el avatar personalizado del jugador al asiento (para que todos lo vean)
      try {
        const [[av]] = await pool.query('SELECT avatar_config FROM players WHERE id = ?', [player.id]);
        if (av?.avatar_config) {
          seat.avatarConfig = typeof av.avatar_config === 'string' ? JSON.parse(av.avatar_config) : av.avatar_config;
        }
      } catch {}

      // Joining mid-hand? Wait for the next hand (no cards, no action)
      if (table.phase !== 'waiting') {
        seat.status = 'sitting_out';
      }

      socket.join(`table:${tableId}`);
      socket.join(`player:${player.id}`);

      io.to(`table:${tableId}`).emit('player_joined', { seat: { ...seat, cards: [] } });
      socket.emit('table_state', publicTableState(table));
      // Persistir el nuevo stack para poder reembolsarlo si el server reinicia
      snapshotCashTable(table);

      // Auto-start hand if 2+ players and game is waiting. Timer cancelable y
      // único (el guard de fase de startHand ya evita el doble reparto, pero
      // no dejamos timers colgando que se acumulen entre joins).
      const readyPlayers = table.seats.filter(s => s.status === 'active' && s.stack > 0);
      if (readyPlayers.length >= 2 && table.phase === 'waiting') {
        clearTimeout(table.nextHandTimeout);
        table.nextHandTimeout = setTimeout(() => startHand(table), 3000);
      }
    } catch (err) {
      console.error('[join_table]', err);
      socket.emit('error', { code: 'SERVER_ERROR', message: err.message });
    } finally {
      joining = false;
    }
  });

  // ── Modo espectador (rail) ── mirar una mesa en vivo SIN sentarse.
  // Solo recibe el estado público (las cartas privadas nunca viajan por la
  // sala de la mesa: se envían socket a socket al repartir), así que un
  // espectador jamás puede ver manos ajenas antes del showdown.
  socket.on('watch_table', async ({ tableId }) => {
    try {
      let table = tm.getTable(tableId);
      if (!table) {
        // Igual que join_table: si la mesa cash existe en DB, se rehidrata
        const [rows] = await pool.query('SELECT * FROM tables_cash WHERE id = ?', [tableId]);
        if (!rows.length) return socket.emit('error', { code: 'TABLE_NOT_FOUND', message: 'Esa mesa ya no está viva' });
        const t = rows[0];
        table = tm.createTable({
          id: t.id, name: t.name, gameType: t.game_type, chipMode: t.chip_mode,
          maxSeats: t.max_seats, smallBlind: t.small_blind, bigBlind: t.big_blind,
          buyInMin: t.buy_in_min, buyInMax: t.buy_in_max,
        });
        if (t.club_id) {
          const live = tm.getTable(t.id);
          live.clubId = t.club_id;
          live.rakePct = parseFloat(t.rake_pct) || 0;
          live.rakeCapBB = Number(t.rake_cap_bb) || 0;
        }
      }

      // Mesas de club: solo miembros (o de la unión) pueden mirar
      if (table.clubId) {
        const { canPlayClub } = require('../controllers/clubsController');
        if (!(await canPlayClub(table.clubId, player.id))) {
          return socket.emit('error', { code: 'NOT_CLUB_MEMBER', message: 'Esta mesa es de un club — únete al club primero' });
        }
      }

      // Un socket en una sola sala de mesa a la vez (igual que al sentarse)
      for (const room of socket.rooms) {
        if (room.startsWith('table:') && room !== `table:${tableId}`) socket.leave(room);
      }
      socket.join(`table:${tableId}`);
      socket.emit('table_state', publicTableState(table));
    } catch (err) {
      console.error('[watch_table]', err);
      socket.emit('error', { code: 'SERVER_ERROR', message: err.message });
    }
  });

  socket.on('unwatch_table', ({ tableId }) => {
    socket.leave(`table:${tableId}`);
  });

  socket.on('leave_table', async ({ tableId }) => {
    const table = tm.getTable(tableId);
    if (!table) return;

    // Fold first if mid-hand so the game keeps moving
    handlePlayerExit(table, player.id);

    // Mesa de torneo: NO se puede "cobrar" el stack al salir. Abandonar un
    // torneo es dejar que las ciegas te desangren / te eliminen; abonar el
    // stack a play_chips sería duplicar fichas (pagaste el buy-in y retirarías
    // 1500+). Se conserva el asiento para que el runtime del torneo siga
    // consistente (el jugador queda como ausente y se le hace blind-out).
    if (table.isTournament) {
      socket.leave(`table:${tableId}`);
      return;
    }

    // All-in en una mano en curso: su parte del bote debe repartirse en el
    // showdown. No se le quita el asiento (eso dejaría un side pot huérfano);
    // solo sale de la sala. Tras la mano quedará como asiento normal.
    const mySeat = tm.getPlayerSeat(table, player.id);
    if (mySeat && mySeat.status === 'all_in' && table.phase !== 'waiting') {
      socket.leave(`table:${tableId}`);
      return;
    }

    const stack = tm.standPlayer(table, player.id);
    if (stack === null) return;

    // Anti-ratholing: remember the stack they left with
    if (stack > 0) {
      table.recentLeavers.set(player.id, { stack, at: Date.now() });
    }

    if (stack > 0) {
      const chipCol = chipColFor(table);
      try {
        await pool.query(`UPDATE players SET ${chipCol} = ${chipCol} + ? WHERE id = ?`, [stack, player.id]);
        await pool.query(
          `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, ?, ?, 'buy_in', ?)`,
          [player.id, table.chipMode, stack, tableId]
        );
      } catch (e) {
        console.error('[leave_table] refund error:', e);
      }
      socket.emit('chips_updated', { chipMode: table.chipMode, amount: stack });
    }

    socket.leave(`table:${tableId}`);
    io.to(`table:${tableId}`).emit('player_left', { playerId: player.id });
    // Actualizar el snapshot tras salir (ya no hay que reembolsar este stack)
    snapshotCashTable(table);
  });

  socket.on('game_action', ({ tableId, type, amount }) => {
    const table = tm.getTable(tableId);
    if (!table) return socket.emit('error', { code: 'TABLE_NOT_FOUND' });
    processAction(table, player.id, { type, amount });
  });

  // Player voluntarily reveals their cards to the table
  socket.on('reveal_cards', ({ tableId }) => {
    const table = tm.getTable(tableId);
    if (!table) return;
    const seat = table.seats.find(s => s.playerId === player.id);
    if (!seat || !seat.cards?.length) return;
    io.to(`table:${tableId}`).emit('cards_revealed', {
      playerId: player.id,
      nickname: player.nickname,
      cards: seat.cards,
    });
    io.to(`table:${tableId}`).emit('chat_received', {
      playerId: null, nickname: 'Dealer', type: 'dealer',
      text: `${player.nickname} muestra sus cartas`,
      at: new Date().toISOString(),
    });
  });

  socket.on('send_reaction', ({ tableId, emoji }) => {
    if (!emoji || emoji.length > 8) return;
    io.to(`table:${tableId}`).emit('reaction_received', { playerId: player.id, emoji });
    const table = tm.getTable(tableId);
    if (table?.handLogger && table.phase !== 'waiting') {
      table.handLogger.log(player.id, 'reaction', 0, table.pot || 0, { emoji });
    }
  });

  socket.on('chat_message', ({ tableId, text, type = 'chat' }) => {
    if (!text || text.trim().length > 200) return;
    io.to(`table:${tableId}`).emit('chat_received', {
      playerId: player.id,
      nickname: player.nickname,
      text: text.trim(),
      type,
      at: new Date().toISOString(),
    });
    const table = tm.getTable(tableId);
    if (table?.handLogger && table.phase !== 'waiting') {
      table.handLogger.log(player.id, 'chat', 0, table.pot || 0, { text: text.trim(), chatType: type });
    }
  });
};
