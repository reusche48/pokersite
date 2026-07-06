const router = require('express').Router();
const { seatBots, unseatBots, listActiveBots, labelAccuracy } = require('../controllers/adminController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

// Todo el router es solo-admin
router.use(authMiddleware, requireAdmin);

router.post('/bots/seat', seatBots);
router.post('/bots/unseat', unseatBots);
router.get('/bots', listActiveBots);
router.get('/labels/accuracy', labelAccuracy);

module.exports = router;
