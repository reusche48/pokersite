const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

function signToken(player) {
  return jwt.sign(
    { id: player.id, nickname: player.nickname, is_admin: player.is_admin },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// IP real del cliente (detrás de proxy usa X-Forwarded-For; en LAN, req.ip)
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.ip || req.socket?.remoteAddress || '?';
}

// Cuántas cuentas de invitado puede crear una misma IP antes de exigir registro.
// Frena granjas de cuentas/bots sin molestar a una familia (1 cuenta c/u).
const GUEST_MAX_PER_IP = 6;
const GUEST_WINDOW_HOURS = 24;

async function guestLogin(req, res) {
  const { nickname } = req.body;
  if (!nickname || nickname.trim().length < 2 || nickname.trim().length > 32) {
    return res.status(400).json({ error: 'Nickname must be 2-32 characters' });
  }
  const ip = clientIp(req);
  // Fricción anti-multicuenta: límite de invitados por IP en la ventana.
  // Cuenta cuántas cuentas distintas se crearon desde esta IP recientemente.
  try {
    const [[c]] = await pool.query(
      `SELECT COUNT(DISTINCT le.player_id) n
       FROM login_events le JOIN players p ON p.id = le.player_id
       WHERE le.ip = ? AND p.is_bot = 0 AND p.email IS NULL
         AND le.at >= NOW() - INTERVAL ? HOUR`,
      [ip, GUEST_WINDOW_HOURS]
    );
    if (c.n >= GUEST_MAX_PER_IP) {
      return res.status(429).json({
        error: 'Demasiadas cuentas de invitado desde esta red. Crea una cuenta con correo para seguir jugando.',
        needsRegister: true,
      });
    }
  } catch (e) { console.error('[guestLogin] límite IP:', e.message); }

  const id = uuidv4();
  const nick = nickname.trim();
  await pool.query(
    `INSERT INTO players (id, nickname, play_chips) VALUES (?, ?, 1000)`,
    [id, nick]
  );
  // Rastro de la creación (habilita detección de multicuenta en el reporte)
  const ua = (req.headers['user-agent'] || '').slice(0, 255);
  const fp = (req.headers['x-fingerprint'] || req.body.fingerprint || '').toString().slice(0, 64) || null;
  pool.query('INSERT INTO login_events (player_id, ip, user_agent, fingerprint) VALUES (?, ?, ?, ?)', [id, ip, ua, fp])
    .catch(e => console.error('[guestLogin] login_events:', e.message));

  const player = { id, nickname: nick, is_admin: 0 };
  res.json({ token: signToken(player), player: { id, nickname: nick, play_chips: 1000, real_chips: 0 } });
}

async function register(req, res) {
  const { nickname, email, password } = req.body;
  if (!nickname || !email || !password) {
    return res.status(400).json({ error: 'nickname, email and password required' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password too short' });
  const [existing] = await pool.query('SELECT id FROM players WHERE email = ?', [email]);
  if (existing.length) return res.status(409).json({ error: 'Email already registered' });
  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO players (id, email, nickname, password_hash, play_chips) VALUES (?, ?, ?, ?, 1000)`,
    [id, email.toLowerCase(), nickname.trim(), hash]
  );
  const player = { id, nickname: nickname.trim(), is_admin: 0 };
  res.status(201).json({ token: signToken(player), player: { id, nickname: nickname.trim(), play_chips: 1000, real_chips: 0 } });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const [rows] = await pool.query('SELECT * FROM players WHERE email = ?', [email.toLowerCase()]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
  const player = rows[0];
  if (player.is_banned) return res.status(403).json({
    error: 'Account banned',
    reason: player.ban_reason || null,
    canAppeal: !player.appealed_at,
  });
  const ok = await bcrypt.compare(password, player.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  await pool.query('UPDATE players SET last_seen = NOW() WHERE id = ?', [player.id]);
  const tokenPayload = { id: player.id, nickname: player.nickname, is_admin: player.is_admin };
  res.json({
    token: signToken(tokenPayload),
    player: { id: player.id, nickname: player.nickname, play_chips: player.play_chips, real_chips: player.real_chips },
  });
}

async function refreshToken(req, res) {
  // Token is already verified by authMiddleware
  const { id, nickname, is_admin } = req.player;
  const [rows] = await pool.query('SELECT is_banned FROM players WHERE id = ?', [id]);
  if (!rows.length || rows[0].is_banned) return res.status(403).json({ error: 'Account banned' });
  res.json({ token: signToken({ id, nickname, is_admin }) });
}

// POST /auth/appeal  { email, password, text }
// Un baneado puede pedir revisión. No re-verifica sesión (está baneado): se
// identifica con sus credenciales para dejar constancia de la apelación.
async function appeal(req, res) {
  const { email, password, text } = req.body;
  if (!email || !password || !text) return res.status(400).json({ error: 'Faltan datos' });
  const [rows] = await pool.query('SELECT * FROM players WHERE email = ?', [email.toLowerCase()]);
  if (!rows.length) return res.status(401).json({ error: 'Credenciales inválidas' });
  const player = rows[0];
  const ok = await bcrypt.compare(password, player.password_hash || '');
  if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
  if (!player.is_banned) return res.status(400).json({ error: 'Tu cuenta no está baneada' });
  await pool.query(
    'UPDATE players SET appeal_text = ?, appealed_at = NOW() WHERE id = ?',
    [text.toString().slice(0, 500), player.id]
  );
  res.json({ ok: true, message: 'Apelación registrada. Un administrador la revisará.' });
}

// POST /auth/change-password  { currentPassword, newPassword }  (autenticado)
// Arregla el riesgo de contraseñas débiles por defecto (ej. admin123).
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  const [[player]] = await pool.query('SELECT id, password_hash FROM players WHERE id = ?', [req.player.id]);
  if (!player || !player.password_hash) return res.status(400).json({ error: 'Esta cuenta no tiene contraseña (invitado)' });
  const ok = await bcrypt.compare(currentPassword || '', player.password_hash);
  if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE players SET password_hash = ? WHERE id = ?', [hash, req.player.id]);
  res.json({ ok: true, message: 'Contraseña actualizada' });
}

module.exports = { guestLogin, register, login, refreshToken, appeal, changePassword };
