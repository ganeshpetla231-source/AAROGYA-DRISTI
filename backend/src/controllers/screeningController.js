const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const screening = require('../services/screeningService');
const ApiError = require('../utils/ApiError');

module.exports = {
  upload: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'AI screening saved for review', data: await screening.upload(req.file, req.body.patientId, req.body.consentGranted, req.user) })),
  uploadPatient: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Screening saved for clinician review. No AI prediction was generated.', data: await screening.uploadPatientScreening(req.file, req.body, req.user) })),
  analyzePatient: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'AI-assisted visual screening completed. This is not a diagnosis.', data: await screening.analyzePatientScreening(req.file, req.body, req.user) })),
  capabilities: asyncHandler(async (req, res) => apiResponse(res, { data: screening.capabilities() })),
  syncOfflineMetadata: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Offline screening metadata synchronized', data: await screening.syncOfflineMetadata(req.body, req.user) })),
  queue: asyncHandler(async (req, res) => {
    if (req.user.role !== 'doctor') throw new ApiError(403, 'Doctor review access required');
    return apiResponse(res, { data: await screening.queue(req.user, req.query) });
  }),
  review: asyncHandler(async (req, res) => apiResponse(res, { message: 'Doctor assessment saved separately from the AI result', data: await screening.review(req.params.id, req.body, req.user) })),
  image: asyncHandler(async (req, res) => {
    const image = await screening.getImage(req.params.id, req.user);
    res.set({ 'Content-Type': image.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.send(image.bytes);
  })
};
