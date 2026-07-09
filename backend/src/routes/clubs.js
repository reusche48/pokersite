const router = require('express').Router();
const { createClub, joinClub, myClubs, getClub, kickMember, leaveClub } = require('../controllers/clubsController');
const { createClubTable } = require('../controllers/tablesController');
const { createClubTournament, fillClubBots } = require('../controllers/tournamentsController');
const { seatClubBots } = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Clubes
router.post('/', createClub);
router.post('/join', joinClub);
router.get('/mine', myClubs);
router.get('/:id', getClub);
router.delete('/:id/members/:pid', kickMember);
router.post('/:id/leave', leaveClub);

// Partidas del club (permisos de dueño se validan en cada handler)
router.post('/:id/tables', createClubTable);
router.post('/:id/tournaments', createClubTournament);
router.post('/:id/tournaments/:tid/bots', fillClubBots);
router.post('/:id/tables/:tableId/bots', seatClubBots);

module.exports = router;
