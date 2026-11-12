const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const voice = require('../services/voiceTranscriptService');

module.exports = {
  voice: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Transcript saved for review', data: await voice.transcribe(req.file, req.body?.patientId, req.body?.language, req.user) })),
  manual: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Manual transcript saved', data: await voice.manual(req.body || {}, req.user) })),
  list: asyncHandler(async (req, res) => apiResponse(res, { data: await voice.list(req.user, req.query) })),
  translate: asyncHandler(async (req, res) => apiResponse(res, { message: 'Translation saved', data: await voice.translate(req.params.id, req.body?.direction, req.user) })),
  review: asyncHandler(async (req, res) => apiResponse(res, { message: 'Doctor transcript review saved', data: await voice.review(req.params.id, req.body || {}, req.user) })),
  synthesize: asyncHandler(async (req, res) => { const audio = await voice.speak(req.body || {}, req.user); res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); return res.send(audio); })
};
