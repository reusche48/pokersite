const router = require('express').Router();
const { seatBots, unseatBots, listActiveBots, labelAccuracy, dashboard, banPlayer, securityReport, trainModel } = require('../controllers/adminController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// Todo el router es solo-admin
router.use(authMiddleware, requireAdmin);

router.get('/dashboard', dashboard);
router.post('/bots/seat', seatBots);
router.post('/bots/unseat', unseatBots);
router.get('/bots', listActiveBots);
router.get('/labels/accuracy', labelAccuracy);
router.post('/players/:id/ban', banPlayer);
router.get('/security', securityReport);
router.post('/ml/train', trainModel);

module.exports = router;
