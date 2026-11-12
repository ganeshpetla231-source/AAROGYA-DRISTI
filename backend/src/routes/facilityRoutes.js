const express = require('express');
const multer = require('multer');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { expensiveLimiter } = require('../middleware/rateLimits');
const ApiError = require('../utils/ApiError');
const controller = require('../controllers/facilityController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, done) => {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) {
      return done(new ApiError(415, 'Upload a PDF, JPEG, or PNG professional document'));
    }
    done(null, true);
  }
});

router.use(authenticate);
router.get('/profile', authorize('hospital'), controller.getProfile);
router.patch('/profile', authorize('hospital'), controller.updateProfile);
router.get('/doctors', authorize('hospital'), controller.doctors);
router.post('/doctors', authorize('hospital'), controller.createDoctor);
router.patch('/doctors/:doctorId', authorize('hospital'), controller.updateDoctor);
router.post('/doctors/:doctorId/documents', authorize('hospital'), expensiveLimiter, upload.single('document'), controller.uploadDocument);
router.get('/doctors/:doctorId/documents', authorize('hospital'), controller.doctorDocuments);
router.post('/doctors/:doctorId/verify', authorize('hospital'), controller.verifyDoctor);
router.patch('/documents/:documentId/verification', authorize('hospital'), controller.verifyDocument);
router.get('/documents/:documentId/download', authorize('hospital', 'admin'), controller.downloadDocument);

module.exports = router;
