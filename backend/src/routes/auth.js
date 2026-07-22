const router = require('express').Router();
const { guestLogin, spectatorGuest, register, login, refreshToken, appeal, changePassword, forgotPassword, resetPassword, selfExclude } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

router.post('/guest', guestLogin);
router.post('/spectator', spectatorGuest);
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', authMiddleware, refreshToken);
router.post('/appeal', appeal);
router.post('/change-password', authMiddleware, changePassword);
router.post('/forgot', forgotPassword);
router.post('/reset', resetPassword);
router.post('/self-exclude', authMiddleware, selfExclude);

module.exports = router;
