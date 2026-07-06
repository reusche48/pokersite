const router = require('express').Router();
const { getMe, getHistory, refill, updateAvatar, saveLabel, getLabels, getStats } = require('../controllers/playersController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.get('/me', getMe);
router.get('/me/history', getHistory);
router.get('/me/stats', getStats);
router.post('/me/refill', refill);
router.patch('/me/avatar', updateAvatar);
router.get('/labels', getLabels);
router.post('/labels', saveLabel);

module.exports = router;
