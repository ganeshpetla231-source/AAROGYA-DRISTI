const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/analyticsController');
const router = express.Router();
router.get('/', authenticate, authorize('asha', 'doctor', 'specialist', 'hospital', 'district', 'admin'), controller);
module.exports = router;
