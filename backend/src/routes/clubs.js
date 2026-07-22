const router = require('express').Router();
const {
  createClub, joinClub, myClubs, getClub, kickMember, leaveClub,
  approveMember, updateClub, createUnion, joinUnion, leaveUnion,
} = require('../controllers/clubsController');
const { createClubTable, deleteClubTable } = require('../controllers/tablesController');
const { createClubTournament, fillClubBots, cancelClubTournament, quickFillClub, inviteToClubTournament } = require('../controllers/tournamentsController');
const { seatClubBots } = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Uniones (Fase 5D) — rutas fijas antes de '/:id'
router.post('/unions', createUnion);
router.post('/unions/join', joinUnion);
router.post('/unions/leave', leaveUnion);

// Clubes
router.post('/', createClub);
router.post('/join', joinClub);
router.get('/mine', myClubs);
router.get('/:id', getClub);
router.patch('/:id', updateClub);
router.delete('/:id/members/:pid', kickMember);
router.post('/:id/members/:pid/approve', approveMember);
router.post('/:id/leave', leaveClub);

// Partidas del club (permisos de dueño se validan en cada handler)
router.post('/:id/tables', createClubTable);
router.delete('/:id/tables/:tableId', deleteClubTable);
router.post('/:id/tournaments', createClubTournament);
router.post('/:id/tournaments/:tid/bots', fillClubBots);
router.post('/:id/tournaments/:tid/quickfill', quickFillClub);
router.post('/:id/tournaments/:tid/invite', inviteToClubTournament);
router.delete('/:id/tournaments/:tid', cancelClubTournament);
router.post('/:id/tables/:tableId/bots', seatClubBots);

module.exports = router;
