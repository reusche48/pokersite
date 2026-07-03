const router = require('express').Router();
const { guestLogin, register, login, refreshToken } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

router.post('/guest', guestLogin);
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', authMiddleware, refreshToken);

module.exports = router;
