const router = require('express').Router();
const { getMe, getHistory, refill, updateAvatar } = require('../controllers/playersController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.get('/me', getMe);
router.get('/me/history', getHistory);
router.post('/me/refill', refill);
router.patch('/me/avatar', updateAvatar);

module.exports = router;
