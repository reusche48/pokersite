const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Revalidar el ban contra la DB: el JWT vive 7 días, así que sin esto un
  // baneado seguiría usando la API REST (refill, torneos, clubes) pese al
  // ban (que hoy solo corta el socket y el login/refresh).
  try {
    const [[p]] = await pool.query('SELECT is_banned FROM players WHERE id = ?', [payload.id]);
    if (!p) return res.status(401).json({ error: 'Cuenta no encontrada' });
    if (p.is_banned) return res.status(403).json({ error: 'Cuenta suspendida' });
  } catch (e) {
    return res.status(503).json({ error: 'Servicio no disponible' });
  }
  req.player = payload;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.player?.is_admin) return res.status(403).json({ error: 'Forbidden' });
  next();
}

module.exports = { authMiddleware, requireAdmin };
