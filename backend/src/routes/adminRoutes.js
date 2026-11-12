const express = require('express');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const controller = require('../controllers/adminController');

const router = express.Router();
router.use(authenticate, authorize('admin'));
router.get('/dashboard', controller.dashboard);
router.get('/reports', controller.dashboard);
router.get('/activity', controller.activity);
router.get('/hospitals', controller.hospitals);
router.post('/hospitals', controller.createHospital);
router.get('/hospital-managers', controller.hospitalManagers);
router.get('/accounts', controller.accounts);
router.post('/accounts', controller.createAccount);
router.get('/notification-recipients', controller.notificationRecipients);
router.get('/notifications', controller.notifications);
router.post('/notifications', controller.createNotification);
router.get('/referrals', controller.referrals);
router.get('/doctors', controller.doctors);
router.post('/doctors', controller.createDoctor);
router.post('/staff', controller.createStaff);
router.put('/doctors/:doctorId/approve', controller.approveDoctor);
router.put('/doctors/:doctorId/reject', controller.rejectDoctor);
router.get('/patients', controller.patients);
router.put('/patients/:patientId/assign-doctor', controller.assignDoctor);

module.exports = router;
