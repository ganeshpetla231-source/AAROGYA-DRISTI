const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const admin = require('../services/adminService');

module.exports = {
  dashboard: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.dashboard() })),
  hospitals: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.hospitals(req.query) })),
  hospitalManagers: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.hospitalManagers(req.query) })),
  accounts: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.adminAccounts(req.query) })),
  createAccount: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Administrator account created; password change is required at first sign-in', data: await admin.createAdminAccount(req.body, req.user) })),
  notificationRecipients: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.adminNotificationRecipients(req.query) })),
  notifications: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.adminNotifications(req.query) })),
  createNotification: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Notification sent', data: await admin.createAdminNotification(req.body, req.user) })),
  referrals: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.referrals(req.query) })),
  activity: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.activity(req.query) })),
  createHospital: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Hospital and manager account created', data: await admin.createHospital(req.body, req.user) })),
  doctors: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.doctors(req.query) })),
  createDoctor: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Doctor account created and is awaiting approval', data: await admin.createDoctor(req.body, req.user) })),
  createStaff: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Staff account created', data: await admin.createStaff(req.body, req.user) })),
  approveDoctor: asyncHandler(async (req, res) => apiResponse(res, { message: 'Doctor account approved', data: await admin.setDoctorDecision(req.params.doctorId, 'approve', req.user) })),
  rejectDoctor: asyncHandler(async (req, res) => apiResponse(res, { message: 'Doctor account rejected', data: await admin.setDoctorDecision(req.params.doctorId, 'reject', req.user) })),
  assignDoctorHospital: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Doctor assigned to hospital; professional verification is still required',
    data: await admin.assignDoctorHospital(req.params.doctorId, req.body?.hospitalId, req.user)
  })),
  patients: asyncHandler(async (req, res) => apiResponse(res, { data: await admin.patients(req.query) })),
  assignDoctor: asyncHandler(async (req, res) => apiResponse(res, { message: 'Patient doctor assignment updated', data: await admin.assignPatient(req.params.patientId, req.body?.doctorId ?? null, req.user) }))
};
