const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const clinical = require('../services/clinicalService');

module.exports = {
  queue: asyncHandler(async (req, res) => apiResponse(res, { data: await clinical.queue(req.user, req.query) })),
  detail: asyncHandler(async (req, res) => apiResponse(res, { data: await clinical.detail(req.params.patientKey, req.user) })),
  note: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Clinical note saved', data: await clinical.createNote(req.params.patientKey, req.body, req.user) })),
  prescribe: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Prescription saved', data: await clinical.prescribe(req.params.patientKey, req.body, req.user) })),
  updatePrescription: asyncHandler(async (req, res) => apiResponse(res, { message: 'Prescription updated', data: await clinical.updatePrescription(req.params.id, req.body, req.user) })),
  followup: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Follow-up scheduled', data: await clinical.schedule(req.params.patientKey, req.body, req.user) })),
  referral: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Referral recommendation saved', data: await clinical.refer(req.params.patientKey, req.body, req.user) })),
  uploadDocument: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Lab report uploaded securely', data: await clinical.uploadDocument(req.params.patientKey, req.file, req.body, req.user) })),
  downloadDocument: asyncHandler(async (req, res) => {
    const document = await clinical.getDocument(req.params.id, req.user);
    const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[document.mimeType] || '';
    const baseName = document.title.replace(/[^a-zA-Z0-9 ._-]/g, '_').slice(0, 150);
    const filename = `${baseName}${require('path').extname(baseName) ? '' : extension}`;
    res.set({ 'Content-Type': document.mimeType, 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.send(document.bytes);
  })
};
