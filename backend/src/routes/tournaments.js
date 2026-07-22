const router = require('express').Router();
const {
  listTournaments, getTournament, createTournament,
  register, unregister, fillBots, start, quickFill, cancelTournament, myTable, standings, publicStandings,
} = require('../controllers/tournamentsController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// Público: listar, ver y marcador en vivo (sin login)
router.get('/', listTournaments);
router.get('/:id/public', publicStandings);
router.get('/:id', getTournament);

// Autenticado
router.use(authMiddleware);
router.get('/:id/my-table', myTable);
router.get('/:id/standings', standings);
router.post('/:id/register', register);
router.post('/:id/unregister', unregister);

// Solo admin
router.post('/', requireAdmin, createTournament);
router.post('/:id/bots', requireAdmin, fillBots);
router.post('/:id/start', requireAdmin, start);
router.post('/:id/quickfill', requireAdmin, quickFill);
router.post('/:id/cancel', requireAdmin, cancelTournament);

module.exports = router;
