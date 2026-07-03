const router = require('express').Router();
const crypto = require('crypto');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ── PUBLIC: shared replay by token (no auth — that's the point of sharing) ──
router.get('/shared/:token', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM hand_history WHERE share_token = ?', [req.params.token]);
  if (!rows.length) return res.status(404).json({ error: 'Replay no encontrado' });
  res.json(rows[0]);
});

// ── Authenticated routes ──
router.use(authMiddleware);

function participates(hand, playerId) {
  const players = typeof hand.players_json === 'string'
    ? JSON.parse(hand.players_json || '[]')
    : (hand.players_json || []);
  return players.some(p => p.playerId === playerId);
}

router.get('/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM hand_history WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Mano no encontrada' });
  const hand = rows[0];
  if (!participates(hand, req.player.id)) {
    return res.status(403).json({ error: 'Solo los participantes pueden ver esta mano' });
  }
  res.json(hand);
});

// Generate (or reuse) a share link for a hand I played
router.post('/:id/share', async (req, res) => {
  const [rows] = await pool.query('SELECT id, players_json, share_token FROM hand_history WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Mano no encontrada' });
  const hand = rows[0];
  if (!participates(hand, req.player.id)) {
    return res.status(403).json({ error: 'Solo los participantes pueden compartir esta mano' });
  }
  let token = hand.share_token;
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    await pool.query('UPDATE hand_history SET share_token = ? WHERE id = ?', [token, req.params.id]);
  }
  res.json({ token });
});

module.exports = router;
