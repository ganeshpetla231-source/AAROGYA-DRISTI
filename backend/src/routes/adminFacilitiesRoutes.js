const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/adminFacilitiesController');

const router = express.Router();
router.use(authenticate, authorize('admin'));
router.get('/summary', controller.summary);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.put('/:id', controller.update);

module.exports = router;
