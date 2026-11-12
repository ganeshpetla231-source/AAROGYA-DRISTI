const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const qr = require('../services/patientQrService');
const patientOnly = req => { if (req.user.role !== 'patient') throw new ApiError(403, 'Patient access required'); };
module.exports = {
  me: asyncHandler(async (req, res) => { patientOnly(req); return apiResponse(res, { data: await qr.patientQr(req.user) }); }),
  issue: asyncHandler(async (req, res) => { patientOnly(req); const patient = await qr.patientForUser(req.user); const issued = await qr.issue(patient); return apiResponse(res, { message: 'QR token generated', data: { token: issued.token, qr: { issuedAt: issued.qr.createdAt, expiresAt: issued.qr.expiresAt, active: true } } }); }),
  revoke: asyncHandler(async (req, res) => { patientOnly(req); return apiResponse(res, { message: 'QR token revoked', data: await qr.revoke(req.user) }); }),
  scan: asyncHandler(async (req, res) => apiResponse(res, { data: await qr.scan(req.user, req.body?.token) })),
  history: asyncHandler(async (req, res) => apiResponse(res, { data: { items: await qr.history(req.user) } })),
  consent: asyncHandler(async (req, res) => { patientOnly(req); return apiResponse(res, { data: await qr.consent(req.user) }); }),
  setConsent: asyncHandler(async (req, res) => { patientOnly(req); return apiResponse(res, { message: 'Consent preference saved', data: await qr.setConsent(req.user, req.body?.granted) }); })
};
