const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const log = require('../config/logger');

function signToken(player) {
  return jwt.sign(
    { id: player.id, nickname: player.nickname, is_admin: player.is_admin, tv: player.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  );
}

// IP real del cliente. Con 'trust proxy' configurado en Express, req.ip ya es
// la IP real (el X-Forwarded-For falsificable queda descartado más allá de los
// saltos de proxy confiados) — clave para que el límite anti-multicuenta por IP
// no se evada mandando cabeceras falsas.
function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || '?';
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
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
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
  // Auto-exclusión (responsible gaming): no dejar entrar mientras esté vigente
  if (player.excluded_until && new Date(player.excluded_until) > new Date()) {
    return res.status(403).json({ error: 'Tu cuenta está en autoexclusión temporal', excludedUntil: player.excluded_until });
  }
  await pool.query('UPDATE players SET last_seen = NOW() WHERE id = ?', [player.id]);
  const tokenPayload = { id: player.id, nickname: player.nickname, is_admin: player.is_admin, token_version: player.token_version };
  res.json({
    token: signToken(tokenPayload),
    player: { id: player.id, nickname: player.nickname, play_chips: player.play_chips, real_chips: player.real_chips },
  });
}

async function refreshToken(req, res) {
  // Token is already verified by authMiddleware (que además valida ban/tv)
  const { id, nickname, is_admin } = req.player;
  const [[p]] = await pool.query('SELECT is_banned, token_version FROM players WHERE id = ?', [id]);
  if (!p || p.is_banned) return res.status(403).json({ error: 'Account banned' });
  res.json({ token: signToken({ id, nickname, is_admin, token_version: p.token_version }) });
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
  // Incrementar token_version: revoca todos los JWT existentes de esta cuenta
  // (otras sesiones/dispositivos). Se devuelve un token fresco para no cerrar
  // la sesión del dispositivo que hizo el cambio.
  const [[nv]] = await pool.query('SELECT token_version + 1 AS tv FROM players WHERE id = ?', [req.player.id]);
  await pool.query('UPDATE players SET password_hash = ?, token_version = ? WHERE id = ?', [hash, nv.tv, req.player.id]);
  res.json({ ok: true, message: 'Contraseña actualizada', token: signToken({ id: req.player.id, nickname: req.player.nickname, is_admin: req.player.is_admin, token_version: nv.tv }) });
}

// ── Recuperación de contraseña ──
// POST /auth/forgot { email } — genera un token de un solo uso (expira 1h).
// El envío del correo es pluggable: si no hay proveedor configurado, el token
// se registra en el log (dev). Siempre responde 200 para no filtrar qué correos
// existen.
async function forgotPassword(req, res) {
  const email = (req.body.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'email requerido' });
  try {
    const [[p]] = await pool.query('SELECT id FROM players WHERE email = ? AND password_hash IS NOT NULL', [email]);
    if (p) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        'INSERT INTO password_resets (token, player_id, expires_at) VALUES (?, ?, NOW() + INTERVAL 1 HOUR)',
        [token, p.id]
      );
      const link = `${process.env.APP_URL || ''}/reset?token=${token}`;
      // TODO(infra): enviar por email real (SendGrid/SES). Por ahora al log.
      log.info('password reset solicitado', { email, resetLink: link });
    }
  } catch (e) { log.error('forgotPassword', { err: e.message }); }
  res.json({ ok: true, message: 'Si el correo existe, enviamos instrucciones para restablecer la contraseña.' });
}

// POST /auth/reset { token, newPassword } — consume el token y cambia la clave.
async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Token y contraseña (mín. 8) requeridos' });
  }
  const [[row]] = await pool.query(
    'SELECT player_id FROM password_resets WHERE token = ? AND used_at IS NULL AND expires_at > NOW()',
    [token]
  );
  if (!row) return res.status(400).json({ error: 'Token inválido o expirado' });
  const hash = await bcrypt.hash(newPassword, 10);
  // Cambiar clave + revocar sesiones + marcar el token usado, en transacción.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE players SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, row.player_id]);
    await conn.query('UPDATE password_resets SET used_at = NOW() WHERE token = ?', [token]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    return res.status(500).json({ error: 'No se pudo restablecer' });
  } finally {
    conn.release();
  }
  res.json({ ok: true, message: 'Contraseña restablecida. Inicia sesión.' });
}

// ── Responsible gaming: autoexclusión temporal ──
// POST /auth/self-exclude { days } (autenticado). Bloquea el acceso N días.
async function selfExclude(req, res) {
  const days = Math.min(365, Math.max(1, Math.round(Number(req.body.days) || 0)));
  if (!days) return res.status(400).json({ error: 'Indica los días (1-365)' });
  await pool.query('UPDATE players SET excluded_until = NOW() + INTERVAL ? DAY, token_version = token_version + 1 WHERE id = ?', [days, req.player.id]);
  res.json({ ok: true, message: `Autoexclusión activada por ${days} día(s). No podrás entrar hasta que termine.`, days });
}

module.exports = { guestLogin, register, login, refreshToken, appeal, changePassword, forgotPassword, resetPassword, selfExclude };
