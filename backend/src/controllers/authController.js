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

async function guestLogin(req, res) {
  const { nickname } = req.body;
  if (!nickname || nickname.trim().length < 2 || nickname.trim().length > 32) {
    return res.status(400).json({ error: 'Nickname must be 2-32 characters' });
  }
  const id = uuidv4();
  const nick = nickname.trim();
  await pool.query(
    `INSERT INTO players (id, nickname, play_chips) VALUES (?, ?, 1000)`,
    [id, nick]
  );
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
  if (player.is_banned) return res.status(403).json({ error: 'Account banned' });
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

module.exports = { guestLogin, register, login, refreshToken };
