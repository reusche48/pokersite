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
  // Revalidar contra la DB: el JWT vive 7 días. Sin esto, un baneado seguiría
  // usando la API REST, y un cambio de contraseña/autoexclusión no revocaría
  // las sesiones abiertas. token_version invalida todos los JWT anteriores.
  try {
    const [[p]] = await pool.query('SELECT is_banned, token_version, excluded_until FROM players WHERE id = ?', [payload.id]);
    if (!p) return res.status(401).json({ error: 'Cuenta no encontrada' });
    if (p.is_banned) return res.status(403).json({ error: 'Cuenta suspendida' });
    if ((payload.tv || 0) !== (p.token_version || 0)) return res.status(401).json({ error: 'Sesión expirada, vuelve a entrar' });
    if (p.excluded_until && new Date(p.excluded_until) > new Date()) return res.status(403).json({ error: 'Cuenta en autoexclusión' });
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
