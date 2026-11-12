const express = require('express');
const { createResourceService } = require('../services/resourceService');
const resourceController = require('../controllers/resourceController');
const models = require('../models');
const { authenticate } = require('../middleware/authMiddleware');
const { authorizeResource } = require('../middleware/authorizeResource');
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const screeningController = require('../controllers/screeningController');
const patientController = require('../controllers/patientController');
const { authorize } = require('../middleware/authMiddleware');
const { expensiveLimiter } = require('../middleware/rateLimits');

const resources = {
  users: [models.User, 'users'], patients: [models.Patient, 'patients'], 'medical-history': [models.MedicalRecord, 'medicalHistory'],
  screenings: [models.OralScreening, 'screenings'], appointments: [models.Appointment, 'appointments'], hospitals: [models.Hospital, 'hospitals'],
  referrals: [models.Referral, 'referrals'], notifications: [models.Notification, 'notifications']
};
const router = express.Router();
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 }, fileFilter: (req, file, done) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return done(new ApiError(415, 'Use a JPEG, PNG, or WebP image'));
  done(null, true);
} });
const uploadProfilePhoto = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (req, file, done) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return done(new ApiError(415, 'Use a JPEG, PNG, or WebP profile photo'));
  done(null, true);
} });
const screeningRoutes = express.Router();
screeningRoutes.use(authenticate, authorizeResource('screenings'));
screeningRoutes.get('/capabilities', screeningController.capabilities);
screeningRoutes.post('/upload', expensiveLimiter, uploadImage.single('image'), screeningController.upload);
screeningRoutes.post('/offline-metadata', expensiveLimiter, screeningController.syncOfflineMetadata);
screeningRoutes.get('/review-queue', screeningController.queue);
screeningRoutes.patch('/:id/review', screeningController.review);
screeningRoutes.get('/:id/image', screeningController.image);
router.use('/screenings', screeningRoutes);
router.get('/patients/me', authenticate, authorize('patient'), patientController.me);
router.put('/patients/me', authenticate, authorize('patient'), patientController.updateMe);
router.get('/patients/me/photo', authenticate, authorize('patient'), patientController.profilePhoto);
router.post('/patients/me/photo', authenticate, authorize('patient'), uploadProfilePhoto.single('photo'), patientController.updateProfilePhoto);
router.delete('/patients/me/photo', authenticate, authorize('patient'), patientController.deleteProfilePhoto);
router.post('/patients/me/screenings/analyze', authenticate, authorize('patient'), expensiveLimiter, uploadImage.single('image'), screeningController.analyzePatient);
router.post('/patients/me/screenings', authenticate, authorize('patient'), expensiveLimiter, uploadImage.single('image'), screeningController.uploadPatient);
router.get('/patients/my-screenings', authenticate, authorize('patient'), patientController.screenings);
router.get('/patients/my-appointments', authenticate, authorize('patient'), patientController.appointments);
for (const [path, [model, resource]] of Object.entries(resources)) {
  const controller = resourceController(createResourceService({ model, resource }), resource);
  const route = express.Router();
  route.use(authenticate, authorizeResource(resource));
  route.get('/', controller.list);
  route.post('/', controller.create);
  route.get('/:id', controller.get);
  route.patch('/:id', controller.update);
  route.put('/:id', controller.update);
  route.delete('/:id', controller.remove);
  router.use(`/${path}`, route);
}

const medicalHistory = resourceController(createResourceService({ model: models.MedicalRecord, resource: 'medicalHistory' }), 'Medical history');
router.get('/patients/:id/medical-history', authenticate, authorizeResource('medicalHistory'), (req, res, next) => {
  req.query.patient = req.params.id;
  next();
}, medicalHistory.list);
router.post('/patients/:id/medical-history', authenticate, authorizeResource('medicalHistory'), (req, res, next) => {
  req.body = { ...(req.body || {}), patient: req.params.id };
  next();
}, medicalHistory.create);

module.exports = router;
