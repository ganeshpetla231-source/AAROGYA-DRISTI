const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/educationController');

const router = express.Router();
const editors = ['doctor', 'specialist', 'admin'];
const reviewers = ['doctor', 'specialist'];

router.get('/', controller.publicList);
router.get('/videos', controller.videoList);
router.get('/videos/history', authenticate, controller.videoHistory);
router.post('/videos/:id/views', authenticate, controller.recordVideoView);
router.post('/videos/manage', authenticate, authorize('admin'), controller.createVideo);
router.post('/videos/manage/:id/publish', authenticate, authorize('admin'), controller.publishVideo);
router.get('/manage', authenticate, authorize(...editors), controller.editorList);
router.post('/manage', authenticate, authorize(...editors), controller.create);
router.get('/manage/:id', authenticate, authorize(...editors), controller.editorGet);
router.patch('/manage/:id', authenticate, authorize(...editors), controller.update);
router.post('/manage/:id/submit', authenticate, authorize(...editors), controller.submit);
router.post('/manage/:id/review', authenticate, authorize(...reviewers), controller.review);
router.post('/manage/:id/publish', authenticate, authorize(...reviewers), controller.publish);
router.post('/manage/:id/archive', authenticate, authorize(...editors), controller.archive);
router.get('/:slug', controller.publicGet);

module.exports = router;
