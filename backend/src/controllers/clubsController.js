'use strict';

// MODO CLUBES (estilo PPPoker): cualquier jugador crea su club con ID corto,
// los amigos entran directo con ese ID, y el dueño crea las partidas del club
// (mesas cash con rake y torneos con fee) cuya comisión va a la caja del club.

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const pool = require('../config/db');
const tm = require('../engine/tableManager');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

function genClubCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return c;
}

// ¿Es el dueño del club? (para permisos de crear partidas / expulsar)
async function isClubOwner(clubId, playerId) {
  const [[row]] = await pool.query('SELECT 1 x FROM clubs WHERE id = ? AND owner_id = ?', [clubId, playerId]);
  return !!row;
}

// ¿Es miembro ACTIVO? (para ver el club; las solicitudes pendientes no cuentan)
async function isClubMember(clubId, playerId) {
  const [[row]] = await pool.query(
    "SELECT 1 x FROM club_members WHERE club_id = ? AND player_id = ? AND status = 'active'",
    [clubId, playerId]
  );
  return !!row;
}

// ¿Puede jugar las partidas del club? Miembro activo del club, o miembro
// activo de un club ALIADO de la misma unión (Fase 5D).
async function canPlayClub(clubId, playerId) {
  const [[row]] = await pool.query(
    `SELECT 1 x FROM club_members m JOIN clubs c ON c.id = m.club_id
     WHERE m.player_id = ? AND m.status = 'active'
       AND (m.club_id = ?
            OR (c.union_id IS NOT NULL
                AND c.union_id = (SELECT union_id FROM clubs WHERE id = ?)))
     LIMIT 1`,
    [playerId, clubId, clubId]
  );
  return !!row;
}

// POST /clubs  { name, emblem? } — crear club (1 como dueño por jugador)
async function createClub(req, res) {
  const name = String(req.body.name || '').trim().slice(0, 40);
  const emblem = String(req.body.emblem || '♣').slice(0, 8);
  if (name.length < 3) return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
  const [[mine]] = await pool.query('SELECT COUNT(*) n FROM clubs WHERE owner_id = ?', [req.player.id]);
  if (mine.n >= 1) return res.status(400).json({ error: 'Ya eres dueño de un club' });

  const id = uuidv4();
  // Reintentar si el código choca (unique)
  for (let i = 0; i < 5; i++) {
    try {
      const code = genClubCode();
      await pool.query(
        'INSERT INTO clubs (id, club_code, name, emblem, owner_id) VALUES (?, ?, ?, ?, ?)',
        [id, code, name, emblem, req.player.id]
      );
      await pool.query(
        "INSERT INTO club_members (club_id, player_id, role) VALUES (?, ?, 'owner')",
        [id, req.player.id]
      );
      return res.status(201).json({ id, clubCode: code, name, emblem });
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e;
    }
  }
  res.status(500).json({ error: 'No se pudo generar el código del club' });
}

// POST /clubs/join  { code } — ingreso con el ID del club.
// join_mode 'open' → entra directo; 'approval' → queda como solicitud pendiente.
async function joinClub(req, res) {
  const code = String(req.body.code || '').trim().toUpperCase();
  const [[club]] = await pool.query('SELECT id, name, emblem, join_mode FROM clubs WHERE club_code = ?', [code]);
  if (!club) return res.status(404).json({ error: 'ID de club no válido' });
  const [[mem]] = await pool.query(
    'SELECT status FROM club_members WHERE club_id = ? AND player_id = ?',
    [club.id, req.player.id]
  );
  if (mem) {
    return res.json({ ok: true, clubId: club.id, name: club.name, emblem: club.emblem, pending: mem.status === 'pending' });
  }
  const status = club.join_mode === 'approval' ? 'pending' : 'active';
  await pool.query(
    "INSERT INTO club_members (club_id, player_id, role, status) VALUES (?, ?, 'member', ?)",
    [club.id, req.player.id, status]
  );
  res.json({ ok: true, clubId: club.id, name: club.name, emblem: club.emblem, pending: status === 'pending' });
}

// GET /clubs/mine — mis clubes (con rol, estado y nº de miembros activos)
async function myClubs(req, res) {
  const [rows] = await pool.query(
    `SELECT c.id, c.club_code, c.name, c.emblem, m.role, m.status,
            (SELECT COUNT(*) FROM club_members m2 WHERE m2.club_id = c.id AND m2.status = 'active') AS members
     FROM club_members m JOIN clubs c ON c.id = m.club_id
     WHERE m.player_id = ? ORDER BY m.joined_at`,
    [req.player.id]
  );
  res.json(rows);
}

// GET /clubs/:id — detalle solo para miembros: club + miembros + partidas
async function getClub(req, res) {
  const clubId = req.params.id;
  if (!(await isClubMember(clubId, req.player.id))) {
    return res.status(403).json({ error: 'No eres miembro de este club' });
  }
  const [[club]] = await pool.query('SELECT * FROM clubs WHERE id = ?', [clubId]);
  if (!club) return res.status(404).json({ error: 'Club no encontrado' });

  const [members] = await pool.query(
    `SELECT m.player_id, m.role, m.joined_at, p.nickname, p.avatar_config
     FROM club_members m JOIN players p ON p.id = m.player_id
     WHERE m.club_id = ? AND m.status = 'active'
     ORDER BY m.role = 'owner' DESC, m.joined_at`,
    [clubId]
  );

  // Solicitudes de ingreso pendientes — solo las ve el dueño
  const isOwnerReq = club.owner_id === req.player.id;
  let pendingRequests = [];
  if (isOwnerReq) {
    const [pend] = await pool.query(
      `SELECT m.player_id, m.joined_at, p.nickname, p.avatar_config
       FROM club_members m JOIN players p ON p.id = m.player_id
       WHERE m.club_id = ? AND m.status = 'pending' ORDER BY m.joined_at`,
      [clubId]
    );
    pendingRequests = pend;
  }

  const [tables] = await pool.query(
    "SELECT * FROM tables_cash WHERE club_id = ? AND status != 'closed' ORDER BY created_at DESC LIMIT 30",
    [clubId]
  );
  const tablesLive = tables.map(t => {
    const live = tm.getTable(t.id);
    return { ...t, seated: live ? live.seats.filter(s => s.playerId).length : 0, maxSeats: t.max_seats };
  });

  const [tournaments] = await pool.query(
    `SELECT t.*, (SELECT COUNT(*) FROM tournament_registrations r WHERE r.tournament_id = t.id) AS registered
     FROM tournaments t WHERE t.club_id = ? AND t.status IN ('registering','running')
     ORDER BY t.created_at DESC LIMIT 20`,
    [clubId]
  );

  // ── UNIÓN (Fase 5D): clubes aliados y sus partidas compartidas ──
  let union = null;
  let unionTables = [];
  let unionTournaments = [];
  if (club.union_id) {
    const [[u]] = await pool.query('SELECT * FROM unions WHERE id = ?', [club.union_id]);
    if (u) {
      const [allied] = await pool.query(
        `SELECT id, name, emblem, club_code,
                (SELECT COUNT(*) FROM club_members m WHERE m.club_id = clubs.id AND m.status = 'active') AS members
         FROM clubs WHERE union_id = ? ORDER BY id = ? DESC, name`,
        [u.id, u.owner_club_id]
      );
      const otherIds = allied.map(c => c.id).filter(cid => cid !== clubId);
      if (otherIds.length) {
        const ph = otherIds.map(() => '?').join(',');
        const [tbls] = await pool.query(
          `SELECT t.*, c.name AS club_name, c.emblem AS club_emblem
           FROM tables_cash t JOIN clubs c ON c.id = t.club_id
           WHERE t.club_id IN (${ph}) AND t.status != 'closed'
           ORDER BY t.created_at DESC LIMIT 30`,
          otherIds
        );
        unionTables = tbls.map(t => {
          const live = tm.getTable(t.id);
          return { ...t, seated: live ? live.seats.filter(s => s.playerId).length : 0, maxSeats: t.max_seats };
        });
        const [utour] = await pool.query(
          `SELECT t.*, c.name AS club_name, c.emblem AS club_emblem,
                  (SELECT COUNT(*) FROM tournament_registrations r WHERE r.tournament_id = t.id) AS registered
           FROM tournaments t JOIN clubs c ON c.id = t.club_id
           WHERE t.club_id IN (${ph}) AND t.status IN ('registering','running')
           ORDER BY t.created_at DESC LIMIT 20`,
          otherIds
        );
        unionTournaments = utour;
      }
      union = {
        id: u.id, name: u.name, code: u.union_code,
        founderClubId: u.owner_club_id, isFounder: u.owner_club_id === clubId,
        clubs: allied,
      };
    }
  }

  // Mi estado en cada torneo (para los botones inscrito/entrar/re-entrar)
  const ids = [...tournaments.map(t => t.id), ...unionTournaments.map(t => t.id)];
  let myRegs = new Map();
  if (ids.length) {
    const [regs] = await pool.query(
      `SELECT tournament_id, final_position FROM tournament_registrations
       WHERE player_id = ? AND tournament_id IN (${ids.map(() => '?').join(',')})`,
      [req.player.id, ...ids]
    );
    myRegs = new Map(regs.map(r => [r.tournament_id, r]));
  }
  const { isLateRegOpen } = require('../engine/tournamentManager');
  const withMyState = t => {
    const reg = myRegs.get(t.id);
    return {
      ...t,
      am_registered: !!reg,
      my_final_position: reg?.final_position ?? null,
      late_reg_open: t.status === 'running' ? isLateRegOpen(t.id) : false,
    };
  };
  const tourneys = tournaments.map(withMyState);

  const isOwner = club.owner_id === req.player.id;
  res.json({
    id: club.id, clubCode: club.club_code, name: club.name, emblem: club.emblem,
    ownerId: club.owner_id, isOwner,
    joinMode: club.join_mode,
    treasury: isOwner ? Number(club.treasury) : undefined, // la caja solo la ve el dueño
    members, pendingRequests, tables: tablesLive, tournaments: tourneys,
    union,
    unionTables,
    unionTournaments: unionTournaments.map(withMyState),
  });
}

// POST /clubs/:id/members/:pid/approve — aceptar solicitud de ingreso (solo dueño)
async function approveMember(req, res) {
  const { id: clubId, pid } = req.params;
  if (!(await isClubOwner(clubId, req.player.id))) return res.status(403).json({ error: 'Solo el dueño puede aprobar solicitudes' });
  const [r] = await pool.query(
    "UPDATE club_members SET status = 'active' WHERE club_id = ? AND player_id = ? AND status = 'pending'",
    [clubId, pid]
  );
  if (!r.affectedRows) return res.status(404).json({ error: 'No hay solicitud pendiente de ese jugador' });
  res.json({ ok: true });
}

// PATCH /clubs/:id — ajustes del club (por ahora solo el modo de ingreso)
async function updateClub(req, res) {
  const clubId = req.params.id;
  if (!(await isClubOwner(clubId, req.player.id))) return res.status(403).json({ error: 'Solo el dueño puede cambiar el club' });
  const mode = req.body.joinMode;
  if (!['open', 'approval'].includes(mode)) return res.status(400).json({ error: 'joinMode debe ser open o approval' });
  await pool.query('UPDATE clubs SET join_mode = ? WHERE id = ?', [mode, clubId]);
  res.json({ ok: true, joinMode: mode });
}

// ── UNIONES (Fase 5D): el DUEÑO une su club a una alianza de clubes ──

// POST /clubs/unions { name } — crear unión (mi club queda como fundador)
async function createUnion(req, res) {
  const name = String(req.body.name || '').trim().slice(0, 40);
  if (name.length < 3) return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
  const [[myClub]] = await pool.query('SELECT id, union_id FROM clubs WHERE owner_id = ?', [req.player.id]);
  if (!myClub) return res.status(400).json({ error: 'Necesitas ser dueño de un club para crear una unión' });
  if (myClub.union_id) return res.status(400).json({ error: 'Tu club ya pertenece a una unión' });
  const id = uuidv4();
  for (let i = 0; i < 5; i++) {
    try {
      const code = genClubCode();
      await pool.query('INSERT INTO unions (id, union_code, name, owner_club_id) VALUES (?, ?, ?, ?)', [id, code, name, myClub.id]);
      await pool.query('UPDATE clubs SET union_id = ? WHERE id = ?', [id, myClub.id]);
      return res.status(201).json({ id, unionCode: code, name });
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e;
    }
  }
  res.status(500).json({ error: 'No se pudo generar el código de la unión' });
}

// POST /clubs/unions/join { code } — unir MI club a una unión existente
async function joinUnion(req, res) {
  const code = String(req.body.code || '').trim().toUpperCase();
  const [[u]] = await pool.query('SELECT id, name FROM unions WHERE union_code = ?', [code]);
  if (!u) return res.status(404).json({ error: 'Código de unión no válido' });
  const [[myClub]] = await pool.query('SELECT id, union_id FROM clubs WHERE owner_id = ?', [req.player.id]);
  if (!myClub) return res.status(400).json({ error: 'Necesitas ser dueño de un club para unirlo a una unión' });
  if (myClub.union_id) return res.status(400).json({ error: 'Tu club ya pertenece a una unión' });
  await pool.query('UPDATE clubs SET union_id = ? WHERE id = ?', [u.id, myClub.id]);
  res.json({ ok: true, unionId: u.id, name: u.name });
}

// POST /clubs/unions/leave — sacar mi club de la unión (el fundador no puede)
async function leaveUnion(req, res) {
  const [[myClub]] = await pool.query('SELECT id, union_id FROM clubs WHERE owner_id = ?', [req.player.id]);
  if (!myClub || !myClub.union_id) return res.status(400).json({ error: 'Tu club no está en una unión' });
  const [[u]] = await pool.query('SELECT owner_club_id FROM unions WHERE id = ?', [myClub.union_id]);
  if (u && u.owner_club_id === myClub.id) return res.status(400).json({ error: 'El club fundador no puede salir de su unión' });
  await pool.query('UPDATE clubs SET union_id = NULL WHERE id = ?', [myClub.id]);
  res.json({ ok: true });
}

// DELETE /clubs/:id/members/:pid — expulsar (solo dueño; no a sí mismo)
// También sirve para RECHAZAR una solicitud pendiente (borra la fila).
async function kickMember(req, res) {
  const { id: clubId, pid } = req.params;
  if (!(await isClubOwner(clubId, req.player.id))) return res.status(403).json({ error: 'Solo el dueño puede expulsar' });
  if (pid === req.player.id) return res.status(400).json({ error: 'No puedes expulsarte a ti mismo' });
  await pool.query('DELETE FROM club_members WHERE club_id = ? AND player_id = ?', [clubId, pid]);
  res.json({ ok: true });
}

// POST /clubs/:id/leave — salir del club (el dueño no puede salir)
async function leaveClub(req, res) {
  const clubId = req.params.id;
  if (await isClubOwner(clubId, req.player.id)) return res.status(400).json({ error: 'El dueño no puede salir de su club' });
  await pool.query('DELETE FROM club_members WHERE club_id = ? AND player_id = ?', [clubId, req.player.id]);
  res.json({ ok: true });
}

module.exports = {
  createClub, joinClub, myClubs, getClub, kickMember, leaveClub,
  approveMember, updateClub, createUnion, joinUnion, leaveUnion,
  isClubOwner, isClubMember, canPlayClub,
};
