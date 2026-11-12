const express = require('express');
const controller = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimits');

const router = express.Router();
router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/patient-otp/request', authLimiter, controller.requestPatientOtp);
router.post('/patient-otp/verify', authLimiter, controller.verifyPatientOtp);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);
router.get('/language', authenticate, controller.getLanguage);
router.put('/language', authenticate, controller.updateLanguage);
router.patch('/profile', authenticate, controller.updateProfile);
router.post('/change-password', authenticate, controller.changePassword);
router.post('/forgot-password', authLimiter, controller.forgotPassword);
router.post('/reset-password', authLimiter, controller.resetPassword);

module.exports = router;
