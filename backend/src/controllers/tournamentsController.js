'use strict';

const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const { startTournament, DEFAULT_BLINDS, defaultPayout, getPlayerTable, getStandings, isLateRegOpen, lateJoin } = require('../engine/tournamentManager');

const MAX_FIELD = 30; // hasta 5 mesas de 6

// Jugador desde el token si viene (la ruta de lista es pública)
function playerFromReq(req) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    return token ? jwt.verify(token, process.env.JWT_SECRET) : null;
  } catch { return null; }
}

// GET /tournaments  → lista (con nº de inscritos + mi estado si hay token)
async function listTournaments(req, res) {
  const [rows] = await pool.query(
    `SELECT t.*, (SELECT COUNT(*) FROM tournament_registrations r WHERE r.tournament_id = t.id) AS registered
     FROM tournaments t
     WHERE t.status IN ('registering','running') AND t.club_id IS NULL
     ORDER BY t.created_at DESC LIMIT 50`
  );
  const me = playerFromReq(req);
  let myRegs = new Map();
  if (me && rows.length) {
    const ids = rows.map(r => r.id);
    const [regs] = await pool.query(
      `SELECT tournament_id, final_position FROM tournament_registrations
       WHERE player_id = ? AND tournament_id IN (${ids.map(() => '?').join(',')})`,
      [me.id, ...ids]
    );
    myRegs = new Map(regs.map(r => [r.tournament_id, r]));
  }
  res.json(rows.map(t => {
    const reg = myRegs.get(t.id);
    return {
      ...t,
      am_registered: !!reg,
      my_final_position: reg?.final_position ?? null,
      late_reg_open: t.status === 'running' ? isLateRegOpen(t.id) : false,
    };
  }));
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

// ── Programación de inicio por fecha/hora ──
const startSchedules = new Map(); // tournamentId → timer

function scheduleStart(id, whenMs) {
  const prev = startSchedules.get(id);
  if (prev) clearTimeout(prev);
  const delay = Math.max(0, whenMs - Date.now());
  if (delay > 2147483647) return; // demasiado lejos; se reprograma al reiniciar
  const timer = setTimeout(() => {
    startSchedules.delete(id);
    fireScheduledStart(id).catch(e => console.error('[torneo programado]', e.message));
  }, delay);
  startSchedules.set(id, timer);
}

// A la hora programada: rellena los cupos libres con bots variados y arranca.
async function fireScheduledStart(id) {
  const [[t]] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [id]);
  if (!t || t.status !== 'registering') return; // ya arrancó/cancelado
  const [[cnt]] = await pool.query('SELECT COUNT(*) n FROM tournament_registrations WHERE tournament_id = ?', [id]);
  const room = t.max_players - cnt.n;
  if (room > 0) {
    const [bots] = await pool.query(
      `SELECT bot_id FROM bots
       WHERE bot_id NOT IN (SELECT player_id FROM tournament_registrations WHERE tournament_id = ?)
       ORDER BY RAND() LIMIT ?`,
      [id, room]
    );
    for (const b of bots) { try { await registerPlayer(id, b.bot_id); } catch {} }
  }
  await startTournament(id).catch(e => console.error('[torneo programado start]', e.message));
}

// Al arrancar el servidor: reprograma los torneos con hora futura.
async function initScheduler() {
  try {
    const [rows] = await pool.query(
      "SELECT id, starts_at FROM tournaments WHERE status = 'registering' AND starts_at IS NOT NULL"
    );
    for (const r of rows) {
      const whenMs = new Date(r.starts_at).getTime();
      scheduleStart(r.id, Math.max(whenMs, Date.now() + 3000)); // si ya pasó, en 3s
    }
    if (rows.length) console.log(`[Torneos] ${rows.length} inicio(s) programado(s) reprogramados`);
  } catch (e) { console.error('[Torneos] initScheduler:', e.message); }
}

// Núcleo de creación de torneo (lo usan el admin global y los dueños de club).
// Opcionales: startsAt (inicio programado), buyIn=0 (freeroll),
// addedPrize (premio que aporta la casa), bounty (recompensa por eliminación),
// fee (comisión de inscripción → caja del club).
async function doCreateTournament(body, creatorId, clubId = null) {
  const { name, maxPlayers = 6, blindSchedule = null, startsAt = null } = body;
  if (!name || !name.trim()) throw { http: 400, msg: 'Nombre requerido' };
  const max = Math.min(Math.max(Number(maxPlayers) || 6, 2), MAX_FIELD);
  const buyInNum = body.buyIn === undefined ? 100 : Math.max(0, Number(body.buyIn) || 0);
  const bountyNum = Math.max(0, Number(body.bounty) || 0);
  const feeNum = clubId ? Math.max(0, Number(body.fee) || 0) : 0;
  const addedPrize = Math.max(0, Number(body.addedPrize) || 0);
  if (bountyNum > buyInNum) throw { http: 400, msg: 'El bounty no puede superar el buy-in' };
  if (feeNum > buyInNum) throw { http: 400, msg: 'La comisión no puede superar el buy-in' };
  if (buyInNum === 0 && addedPrize === 0) throw { http: 400, msg: 'Un freeroll necesita premio añadido' };
  let startsAtDate = null;
  if (startsAt) {
    startsAtDate = new Date(startsAt);
    if (isNaN(startsAtDate.getTime())) throw { http: 400, msg: 'Fecha/hora inválida' };
  }
  // Por invitación: solo el organizador inscribe (nadie se apunta solo). Solo
  // aplica a torneos de club (en el lobby no tiene sentido).
  const inviteOnly = clubId && !!body.inviteOnly ? 1 : 0;
  const id = uuidv4();
  const scheduleJson = JSON.stringify(Array.isArray(blindSchedule) && blindSchedule.length ? blindSchedule : DEFAULT_BLINDS);
  const payoutJson = JSON.stringify(defaultPayout(max));
  await pool.query(
    `INSERT INTO tournaments
       (id, name, game_type, chip_mode, tournament_type, max_players, min_players, buy_in, rake, prize_pool, payout_json, blind_schedule_json, status, starts_at, bounty, fee, club_id, invite_only, created_by)
     VALUES (?, ?, 'holdem', 'play', 'sit_and_go', ?, 2, ?, 0, ?, ?, ?, 'registering', ?, ?, ?, ?, ?, ?)`,
    [id, name.trim(), max, buyInNum, addedPrize, payoutJson, scheduleJson, startsAtDate, bountyNum, feeNum, clubId, inviteOnly, creatorId]
  );
  if (startsAtDate) scheduleStart(id, startsAtDate.getTime());
  return { id, name: name.trim(), maxPlayers: max, buyIn: buyInNum, bounty: bountyNum, fee: feeNum, addedPrize, startsAt: startsAtDate, clubId, inviteOnly };
}

// POST /tournaments  (admin global)
async function createTournament(req, res) {
  try {
    const r = await doCreateTournament(req.body, req.player.id, null);
    res.status(201).json(r);
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[createTournament]', e);
    // code (p.ej. ER_BAD_FIELD_ERROR) ayuda a diagnosticar en producción sin
    // exponer detalles internos (no incluye SQL ni mensaje).
    res.status(500).json({ error: 'Error al crear torneo', code: e.code || undefined });
  }
}

// POST /clubs/:id/tournaments  (dueño del club)
async function createClubTournament(req, res) {
  try {
    const { isClubOwner } = require('./clubsController');
    if (!(await isClubOwner(req.params.id, req.player.id))) {
      return res.status(403).json({ error: 'Solo el dueño del club puede crear torneos' });
    }
    const r = await doCreateTournament(req.body, req.player.id, req.params.id);
    res.status(201).json(r);
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[createClubTournament]', e);
    res.status(500).json({ error: 'Error al crear torneo', code: e.code || undefined });
  }
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
    // Torneo de club: miembros activos del club o de un club aliado (unión).
    // (Los bots están exentos — los mete el dueño.)
    if (t.club_id) {
      const [[bot]] = await conn.query('SELECT is_bot FROM players WHERE id = ?', [playerId]);
      if (!bot?.is_bot) {
        const { canPlayClub } = require('./clubsController');
        if (!(await canPlayClub(t.club_id, playerId))) {
          throw { http: 403, msg: 'Este torneo es de un club — únete al club (o a su unión) primero' };
        }
      }
    }
    const buyIn = parseFloat(t.buy_in) || 0;
    const fee = parseFloat(t.fee) || 0;
    const total = buyIn + fee; // "buy-in + fee": el fee va a la caja del club
    const [[p]] = await conn.query('SELECT play_chips FROM players WHERE id = ? FOR UPDATE', [playerId]);
    if (!p || p.play_chips < total) throw { http: 400, msg: `Fichas insuficientes (necesitas ${total})` };
    await conn.query('UPDATE players SET play_chips = play_chips - ? WHERE id = ?', [total, playerId]);
    await conn.query('INSERT INTO tournament_registrations (tournament_id, player_id) VALUES (?, ?)', [tournamentId, playerId]);
    // En torneos bounty, la parte de la recompensa se reserva (se paga al cazador)
    const poolAdd = Math.max(0, buyIn - (parseFloat(t.bounty) || 0));
    await conn.query('UPDATE tournaments SET prize_pool = prize_pool + ? WHERE id = ?', [poolAdd, tournamentId]);
    if (fee > 0 && t.club_id) {
      await conn.query('UPDATE clubs SET treasury = treasury + ? WHERE id = ?', [fee, t.club_id]);
      await conn.query(
        `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, 'play', ?, 'rake', ?)`,
        [playerId, -fee, t.club_id]
      );
    }
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

// Cobra el buy-in y registra/reactiva la inscripción de un late-reg / re-entry.
// Transaccional: si algo falla, no se descuentan fichas.
async function chargeLateEntry(t, playerId, reentry) {
  const buyIn = parseFloat(t.buy_in) || 0;
  const fee = parseFloat(t.fee) || 0;
  const total = buyIn + fee;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query('SELECT play_chips FROM players WHERE id = ? FOR UPDATE', [playerId]);
    if (!p || p.play_chips < total) throw { http: 400, msg: `Fichas insuficientes (necesitas ${total})` };
    await conn.query('UPDATE players SET play_chips = play_chips - ? WHERE id = ?', [total, playerId]);
    if (fee > 0 && t.club_id) {
      await conn.query('UPDATE clubs SET treasury = treasury + ? WHERE id = ?', [fee, t.club_id]);
      await conn.query(
        `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, 'play', ?, 'rake', ?)`,
        [playerId, -fee, t.club_id]
      );
    }
    if (reentry) {
      await conn.query(
        'UPDATE tournament_registrations SET final_position = NULL, prize_won = NULL WHERE tournament_id = ? AND player_id = ?',
        [t.id, playerId]
      );
    } else {
      await conn.query('INSERT INTO tournament_registrations (tournament_id, player_id) VALUES (?, ?)', [t.id, playerId]);
    }
    const poolAdd = Math.max(0, buyIn - (parseFloat(t.bounty) || 0));
    await conn.query('UPDATE tournaments SET prize_pool = prize_pool + ? WHERE id = ?', [poolAdd, t.id]);
    await conn.query(
      `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, 'play', ?, 'tournament_buyin', ?)`,
      [playerId, -buyIn, t.id]
    );
    await conn.commit();
    return buyIn;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// POST /tournaments/:id/register  (el propio jugador)
// Tres caminos: inscripción normal (registering), inscripción tardía y
// re-entry (running con la ventana de late-reg abierta).
async function register(req, res) {
  const tid = req.params.id, pid = req.player.id;
  try {
    const [[t]] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [tid]);
    if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

    // Torneo POR INVITACIÓN: nadie se apunta solo; solo el organizador inscribe.
    // (El dueño sí puede auto-inscribirse para jugar él también.)
    if (t.invite_only) {
      const { isClubOwner } = require('./clubsController');
      const soyOrganizador = t.club_id && await isClubOwner(t.club_id, pid);
      if (!soyOrganizador) return res.status(403).json({ error: 'Este torneo es por invitación — solo el organizador inscribe.' });
    }

    if (t.status === 'running') {
      if (!isLateRegOpen(tid)) return res.status(400).json({ error: 'La inscripción tardía ya cerró' });
      // Torneo de club: miembros activos del club o de un club aliado (unión)
      if (t.club_id) {
        const { canPlayClub } = require('./clubsController');
        if (!(await canPlayClub(t.club_id, pid))) {
          return res.status(403).json({ error: 'Este torneo es de un club — únete al club (o a su unión) primero' });
        }
      }
      const [[reg]] = await pool.query(
        'SELECT final_position FROM tournament_registrations WHERE tournament_id = ? AND player_id = ?', [tid, pid]
      );
      if (reg && reg.final_position === null) return res.status(400).json({ error: 'Ya estás jugando este torneo' });
      const reentry = !!reg; // inscrito y eliminado → re-entry
      const buyIn = await chargeLateEntry(t, pid, reentry);
      const tableId = lateJoin(tid, pid, req.player.nickname, {
        reentry,
        addPrize: Math.max(0, buyIn - (parseFloat(t.bounty) || 0)),
      });
      if (!tableId) {
        // Sin asiento libre → reembolso completo (buy-in + fee, con auditoría)
        const feeR = parseFloat(t.fee) || 0;
        await pool.query('UPDATE players SET play_chips = play_chips + ? WHERE id = ?', [buyIn + feeR, pid]);
        if (feeR > 0 && t.club_id) {
          await pool.query('UPDATE clubs SET treasury = treasury - ? WHERE id = ?', [feeR, t.club_id]);
        }
        const poolAdd = Math.max(0, buyIn - (parseFloat(t.bounty) || 0));
        await pool.query('UPDATE tournaments SET prize_pool = prize_pool - ? WHERE id = ?', [poolAdd, tid]);
        // (delta positivo con el mismo reason = reversa del cobro)
        await pool.query(
          `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, 'play', ?, 'tournament_buyin', ?)`,
          [pid, buyIn, tid]
        );
        if (!reentry) await pool.query('DELETE FROM tournament_registrations WHERE tournament_id = ? AND player_id = ?', [tid, pid]);
        return res.status(400).json({ error: 'No hay asientos libres ahora mismo' });
      }
      return res.json({ ok: true, late: true, reentry, tableId });
    }

    const r = await registerPlayer(tid, pid);
    // Auto-arranque al llenarse
    if (r.newCount >= r.max) startTournament(tid).catch(e => console.error('[torneo autostart]', e.message));
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
// Núcleo del relleno con bots (lo usan el admin global y los dueños de club)
async function doFillBots(tournamentId, level, count) {
  if (![5, 6, 7, 8, 9, 10, 11, 12].includes(Number(level))) throw { http: 400, msg: 'Nivel 5-12' };
  const [[t]] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  if (!t || t.status !== 'registering') throw { http: 400, msg: 'Inscripciones cerradas' };
  const [[cnt]] = await pool.query('SELECT COUNT(*) n FROM tournament_registrations WHERE tournament_id = ?', [tournamentId]);
  const room = t.max_players - cnt.n;
  const n = Math.min(Number(count) || 1, room);
  if (n <= 0) throw { http: 400, msg: 'Torneo lleno' };
  const [bots] = await pool.query(
    `SELECT b.bot_id FROM bots b
     WHERE b.level = ? AND b.bot_id NOT IN (SELECT player_id FROM tournament_registrations WHERE tournament_id = ?)
     ORDER BY RAND() LIMIT ?`,
    [Number(level), tournamentId, n]
  );
  let added = 0;
  for (const b of bots) {
    try { await registerPlayer(tournamentId, b.bot_id); added++; } catch {}
  }
  // Si con esto se llenó el cupo, arranca solo
  if (cnt.n + added >= t.max_players) {
    startTournament(tournamentId).catch(e => console.error('[torneo autostart bots]', e.message));
  }
  return { added, started: cnt.n + added >= t.max_players };
}

// POST /tournaments/:id/bots  (admin global)
async function fillBots(req, res) {
  try {
    res.json(await doFillBots(req.params.id, req.body.level, req.body.count ?? 1));
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[fillBots]', e); res.status(500).json({ error: 'Error al agregar bots' });
  }
}

// POST /clubs/:id/tournaments/:tid/bots  (dueño del club, en SU torneo)
async function fillClubBots(req, res) {
  try {
    const { isClubOwner } = require('./clubsController');
    if (!(await isClubOwner(req.params.id, req.player.id))) {
      return res.status(403).json({ error: 'Solo el dueño del club puede agregar bots' });
    }
    const [[t]] = await pool.query('SELECT club_id FROM tournaments WHERE id = ?', [req.params.tid]);
    if (!t || t.club_id !== req.params.id) return res.status(404).json({ error: 'Ese torneo no es de este club' });
    res.json(await doFillBots(req.params.tid, req.body.level, req.body.count ?? 1));
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[fillClubBots]', e); res.status(500).json({ error: 'Error al agregar bots' });
  }
}

// Núcleo del RELLENO RÁPIDO (pruebas): inscribe a `pid` (si falta), llena TODOS
// los asientos con bots aleatorios y arranca el torneo. Devuelve {tableId} o
// lanza {http,msg}. Lo usan el admin (torneos del lobby) y el dueño del club.
async function doQuickFill(tid, pid) {
  const [[t]] = await pool.query('SELECT * FROM tournaments WHERE id = ?', [tid]);
  if (!t) throw { http: 404, msg: 'Torneo no encontrado' };
  if (t.status !== 'registering') throw { http: 400, msg: 'El torneo ya arrancó o cerró' };

  // 1) Inscribir al jugador si aún no lo está (respeta buy-in/fichas)
  const [[mine]] = await pool.query('SELECT 1 x FROM tournament_registrations WHERE tournament_id = ? AND player_id = ?', [tid, pid]);
  if (!mine) await registerPlayer(tid, pid);

  // 2) Llenar los asientos restantes con bots ALEATORIOS (cualquier nivel)
  const [[cnt]] = await pool.query('SELECT COUNT(*) n FROM tournament_registrations WHERE tournament_id = ?', [tid]);
  const room = t.max_players - cnt.n;
  if (room > 0) {
    const [bots] = await pool.query(
      `SELECT bot_id FROM bots
       WHERE bot_id NOT IN (SELECT player_id FROM tournament_registrations WHERE tournament_id = ?)
       ORDER BY RAND() LIMIT ?`,
      [tid, room]
    );
    for (const b of bots) { try { await registerPlayer(tid, b.bot_id); } catch {} }
  }

  // 3) Arrancar el torneo (esperamos para poder devolver la mesa)
  try { await startTournament(tid); }
  catch (e) { throw { http: 400, msg: e.message || 'No se pudo arrancar el torneo' }; }

  // 4) La mesa del jugador, para llevarlo directo
  return { ok: true, started: true, tableId: getPlayerTable(tid, pid) || null };
}

// POST /tournaments/:id/quickfill  (admin) → torneos del lobby
async function quickFill(req, res) {
  try {
    res.json(await doQuickFill(req.params.id, req.player.id));
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[quickFill]', e); res.status(500).json({ error: 'Error en el relleno rápido' });
  }
}

// POST /clubs/:id/tournaments/:tid/invite  { playerId }  (dueño del club)
// El organizador inscribe a un miembro concreto (el que pagó). Cobra el buy-in
// en fichas al invitado, como una inscripción normal.
async function inviteToClubTournament(req, res) {
  try {
    const { isClubOwner, canPlayClub } = require('./clubsController');
    if (!(await isClubOwner(req.params.id, req.player.id))) {
      return res.status(403).json({ error: 'Solo el dueño del club puede inscribir jugadores' });
    }
    const [[t]] = await pool.query('SELECT club_id, status FROM tournaments WHERE id = ?', [req.params.tid]);
    if (!t || t.club_id !== req.params.id) return res.status(404).json({ error: 'Ese torneo no es de este club' });
    if (t.status !== 'registering') return res.status(400).json({ error: 'Inscripciones cerradas' });
    const playerId = (req.body.playerId || '').toString();
    if (!playerId) return res.status(400).json({ error: 'Falta el jugador' });
    if (!(await canPlayClub(req.params.id, playerId))) {
      return res.status(400).json({ error: 'Ese jugador no es miembro activo del club' });
    }
    await registerPlayer(req.params.tid, playerId); // cobra el buy-in al invitado
    res.json({ ok: true });
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[inviteToClubTournament]', e); res.status(500).json({ error: 'No se pudo inscribir al jugador' });
  }
}

// POST /clubs/:id/tournaments/:tid/quickfill  (dueño del club)
async function quickFillClub(req, res) {
  try {
    const { isClubOwner } = require('./clubsController');
    if (!(await isClubOwner(req.params.id, req.player.id))) {
      return res.status(403).json({ error: 'Solo el dueño del club puede usar el relleno rápido' });
    }
    const [[t]] = await pool.query('SELECT club_id FROM tournaments WHERE id = ?', [req.params.tid]);
    if (!t || t.club_id !== req.params.id) return res.status(404).json({ error: 'Ese torneo no es de este club' });
    res.json(await doQuickFill(req.params.tid, req.player.id));
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[quickFillClub]', e); res.status(500).json({ error: 'Error en el relleno rápido' });
  }
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
  const { resolveMyTable } = require('../engine/tournamentManager');
  const r = resolveMyTable(req.params.id, req.player.id);
  // r = { tableId, spectate }. Si estás eliminado, spectate:true → ves la mesa
  // final; si el torneo ya terminó, null → 404.
  if (!r) return res.status(404).json({ error: 'El torneo ya terminó' });
  res.json(r);
}

// GET /tournaments/:id/standings  → clasificación (vivos + eliminados)
function standings(req, res) {
  const data = getStandings(req.params.id);
  if (!data) return res.status(404).json({ error: 'Torneo no activo' });
  res.json(data);
}

// GET /tournaments/:id/public  → MARCADOR PÚBLICO (sin login). Cualquiera con
// el link ve el estado del torneo: inscritos / en curso / resultado final.
// Solo datos públicos (nada de cartas ni nada sensible).
async function publicStandings(req, res) {
  const tid = req.params.id;
  const [[t]] = await pool.query(
    'SELECT id, name, status, buy_in, fee, prize_pool, max_players, starts_at, bounty FROM tournaments WHERE id = ?', [tid]
  );
  if (!t) return res.status(404).json({ error: 'Torneo no encontrado' });

  const base = {
    id: t.id, name: t.name, status: t.status,
    buyIn: Number(t.buy_in) || 0, fee: Number(t.fee) || 0,
    prizePool: Number(t.prize_pool) || 0, maxPlayers: t.max_players,
    bounty: Number(t.bounty) || 0, startsAt: t.starts_at,
  };

  if (t.status === 'running') {
    const s = getStandings(tid);
    return res.json({ ...base, ...(s || {}) });
  }

  if (t.status === 'registering') {
    const [regs] = await pool.query(
      `SELECT p.nickname, p.is_bot FROM tournament_registrations r JOIN players p ON p.id = r.player_id
       WHERE r.tournament_id = ? ORDER BY r.registered_at`, [tid]
    );
    return res.json({ ...base, inscritos: regs.map(r => ({ nickname: r.nickname, isBot: !!r.is_bot })) });
  }

  // finished / cancelled → ranking final desde la BD
  const [fin] = await pool.query(
    `SELECT p.nickname, r.final_position, r.prize_won
     FROM tournament_registrations r JOIN players p ON p.id = r.player_id
     WHERE r.tournament_id = ? AND r.final_position IS NOT NULL
     ORDER BY r.final_position`, [tid]
  );
  return res.json({ ...base, resultado: fin.map(f => ({ nickname: f.nickname, position: f.final_position, prize: Number(f.prize_won) || 0 })) });
}

// Núcleo de cancelación: cancela un torneo EN INSCRIPCIÓN y reembolsa
// buy-in+fee a todos los inscritos, revierte el fee de la caja del club y
// libera los buy-ins bloqueados. `expectClubId` (opcional) exige que el torneo
// sea de ese club (para el dueño). Devuelve {ok} o lanza {http,msg}.
async function doCancelTournament(tid, { expectClubId } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[t]] = await conn.query('SELECT * FROM tournaments WHERE id = ? FOR UPDATE', [tid]);
    if (!t) { await conn.rollback(); throw { http: 404, msg: 'Torneo no encontrado' }; }
    if (expectClubId && t.club_id !== expectClubId) { await conn.rollback(); throw { http: 404, msg: 'Ese torneo no es de este club' }; }
    if (t.status !== 'registering') { await conn.rollback(); throw { http: 400, msg: 'Solo se pueden cancelar torneos en inscripción' }; }
    const [regs] = await conn.query('SELECT player_id FROM tournament_registrations WHERE tournament_id = ?', [tid]);
    const buyIn = parseFloat(t.buy_in) || 0, fee = parseFloat(t.fee) || 0, total = buyIn + fee;
    const chipCol = t.chip_mode === 'real' ? 'real_chips' : 'play_chips';
    for (const r of regs) {
      if (total > 0) {
        await conn.query(`UPDATE players SET ${chipCol} = ${chipCol} + ? WHERE id = ?`, [total, r.player_id]);
        await conn.query(
          `INSERT INTO chip_transactions (player_id, chip_mode, delta, reason, reference_id) VALUES (?, ?, ?, 'tournament_buyin', ?)`,
          [r.player_id, t.chip_mode, total, tid]
        );
      }
    }
    // Revertir los fees que se acumularon en la caja del club al inscribirse.
    if (t.club_id && fee > 0 && regs.length) {
      await conn.query('UPDATE clubs SET treasury = GREATEST(0, treasury - ?) WHERE id = ?', [fee * regs.length, t.club_id]);
    }
    await conn.query('DELETE FROM tournament_registrations WHERE tournament_id = ?', [tid]);
    await conn.query("UPDATE tournaments SET status = 'cancelled' WHERE id = ?", [tid]);
    await conn.commit();
    const timer = startSchedules.get(tid);
    if (timer) { clearTimeout(timer); startSchedules.delete(tid); }
    return { ok: true, refunded: regs.length, totalPorJugador: total };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// POST /tournaments/:id/cancel (admin)
async function cancelTournament(req, res) {
  try {
    res.json(await doCancelTournament(req.params.id));
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[cancelTournament]', e.message); res.status(500).json({ error: 'No se pudo cancelar el torneo' });
  }
}

// POST /clubs/:id/tournaments/:tid/cancel (dueño del club)
async function cancelClubTournament(req, res) {
  try {
    const { isClubOwner } = require('./clubsController');
    if (!(await isClubOwner(req.params.id, req.player.id))) {
      return res.status(403).json({ error: 'Solo el dueño del club puede cancelar torneos' });
    }
    res.json(await doCancelTournament(req.params.tid, { expectClubId: req.params.id }));
  } catch (e) {
    if (e.http) return res.status(e.http).json({ error: e.msg });
    console.error('[cancelClubTournament]', e.message); res.status(500).json({ error: 'No se pudo cancelar el torneo' });
  }
}

module.exports = { listTournaments, getTournament, createTournament, createClubTournament, register, unregister, fillBots, fillClubBots, start, quickFill, quickFillClub, inviteToClubTournament, cancelTournament, cancelClubTournament, myTable, standings, publicStandings, initScheduler };
