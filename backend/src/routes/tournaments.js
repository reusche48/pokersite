const router = require('express').Router();
const {
  listTournaments, getTournament, createTournament,
  register, unregister, fillBots, start,
} = require('../controllers/tournamentsController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// Público: listar y ver
router.get('/', listTournaments);
router.get('/:id', getTournament);

// Autenticado
router.use(authMiddleware);
router.post('/:id/register', register);
router.post('/:id/unregister', unregister);

// Solo admin
router.post('/', requireAdmin, createTournament);
router.post('/:id/bots', requireAdmin, fillBots);
router.post('/:id/start', requireAdmin, start);

module.exports = router;
