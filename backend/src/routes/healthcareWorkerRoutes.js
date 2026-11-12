const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/healthcareWorkerController');

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin', 'district'));
router.get('/stats', controller.stats);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.patch('/:id/status', controller.status);

module.exports = router;
