const router = require('express').Router();
const { listTables, getTable, createTable } = require('../controllers/tablesController');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

router.get('/', listTables);
router.get('/:id', getTable);
router.post('/', authMiddleware, requireAdmin, createTable);

module.exports = router;
