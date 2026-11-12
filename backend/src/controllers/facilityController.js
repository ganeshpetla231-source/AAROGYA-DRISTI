const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const facility = require('../services/facilityService');

module.exports = {
  getProfile: asyncHandler(async (req, res) => apiResponse(res, { data: await facility.getProfile(req.user) })),
  updateProfile: asyncHandler(async (req, res) => apiResponse(res, { message: 'Hospital profile updated', data: await facility.updateProfile(req.body, req.user) })),
  doctors: asyncHandler(async (req, res) => apiResponse(res, { data: await facility.listDoctors(req.user) })),
  updateDoctorProfessionalProfile: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Doctor professional profile saved; administrator verification is required again',
    data: await facility.updateDoctorProfessionalProfile(req.params.doctorId, req.body, req.user)
  })),
  uploadDocument: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, data: await facility.uploadDocument(req.params.doctorId, req.file, req.body, req.user) })),
  doctorDocuments: asyncHandler(async (req, res) => apiResponse(res, { data: await facility.listDocuments(req.params.doctorId, req.user) })),
  verifyDocument: asyncHandler(async (req, res) => apiResponse(res, { data: await facility.setDocumentVerification(req.params.documentId, req.body?.status, req.user) })),
  verifyDoctor: asyncHandler(async (req, res) => apiResponse(res, { message: 'Professional profile verified; account status was unchanged', data: await facility.verifyDoctor(req.params.doctorId, req.user) })),
  downloadDocument: asyncHandler(async (req, res) => {
    const document = await facility.downloadDocument(req.params.documentId, req.user);
    const filename = document.title.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 100) || 'professional-document';
    res.set({ 'Content-Type': document.mimeType, 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.send(document.bytes);
  })
};
