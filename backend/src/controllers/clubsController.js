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

// ¿Es miembro? (para ver el club y sentarse en sus partidas)
async function isClubMember(clubId, playerId) {
  const [[row]] = await pool.query('SELECT 1 x FROM club_members WHERE club_id = ? AND player_id = ?', [clubId, playerId]);
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

// POST /clubs/join  { code } — ingreso directo con el ID del club
async function joinClub(req, res) {
  const code = String(req.body.code || '').trim().toUpperCase();
  const [[club]] = await pool.query('SELECT id, name, emblem FROM clubs WHERE club_code = ?', [code]);
  if (!club) return res.status(404).json({ error: 'ID de club no válido' });
  await pool.query(
    "INSERT IGNORE INTO club_members (club_id, player_id, role) VALUES (?, ?, 'member')",
    [club.id, req.player.id]
  );
  res.json({ ok: true, clubId: club.id, name: club.name, emblem: club.emblem });
}

// GET /clubs/mine — mis clubes (con rol y nº de miembros)
async function myClubs(req, res) {
  const [rows] = await pool.query(
    `SELECT c.id, c.club_code, c.name, c.emblem, m.role,
            (SELECT COUNT(*) FROM club_members m2 WHERE m2.club_id = c.id) AS members
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
     WHERE m.club_id = ? ORDER BY m.role = 'owner' DESC, m.joined_at`,
    [clubId]
  );

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
  // Mi estado en cada torneo (para los botones inscrito/entrar/re-entrar)
  const ids = tournaments.map(t => t.id);
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
  const tourneys = tournaments.map(t => {
    const reg = myRegs.get(t.id);
    return {
      ...t,
      am_registered: !!reg,
      my_final_position: reg?.final_position ?? null,
      late_reg_open: t.status === 'running' ? isLateRegOpen(t.id) : false,
    };
  });

  const isOwner = club.owner_id === req.player.id;
  res.json({
    id: club.id, clubCode: club.club_code, name: club.name, emblem: club.emblem,
    ownerId: club.owner_id, isOwner,
    treasury: isOwner ? Number(club.treasury) : undefined, // la caja solo la ve el dueño
    members, tables: tablesLive, tournaments: tourneys,
  });
}

// DELETE /clubs/:id/members/:pid — expulsar (solo dueño; no a sí mismo)
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

module.exports = { createClub, joinClub, myClubs, getClub, kickMember, leaveClub, isClubOwner, isClubMember };
