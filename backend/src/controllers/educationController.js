const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const education = require('../services/educationService');
const videos = require('../services/educationVideoService');

module.exports = {
  publicList: asyncHandler(async (req, res) => apiResponse(res, { data: await education.publishedList(req.query) })),
  publicGet: asyncHandler(async (req, res) => apiResponse(res, { data: await education.getPublished(req.params.slug) })),
  editorList: asyncHandler(async (req, res) => apiResponse(res, { data: await education.editorList(req.user, req.query) })),
  editorGet: asyncHandler(async (req, res) => apiResponse(res, { data: await education.getForEditor(req.user, req.params.id) })),
  create: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Draft article created', data: await education.create(req.user, req.body) })),
  update: asyncHandler(async (req, res) => apiResponse(res, { message: 'Article saved as an unreviewed draft', data: await education.update(req.user, req.params.id, req.body) })),
  submit: asyncHandler(async (req, res) => apiResponse(res, { message: 'Article submitted for medical review', data: await education.submitForReview(req.user, req.params.id) })),
  review: asyncHandler(async (req, res) => apiResponse(res, { message: 'Medical review recorded', data: await education.review(req.user, req.params.id, req.body) })),
  publish: asyncHandler(async (req, res) => apiResponse(res, { message: 'Medically reviewed article published', data: await education.publish(req.user, req.params.id) })),
  archive: asyncHandler(async (req, res) => apiResponse(res, { message: 'Article archived', data: await education.archive(req.user, req.params.id) })),
  videoList: asyncHandler(async (req, res) => apiResponse(res, { data: await videos.list(req.query) })),
  videoHistory: asyncHandler(async (req, res) => apiResponse(res, { data: await videos.getHistory(req.user._id, req.query) })),
  recordVideoView: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, data: await videos.recordView(req.user._id, req.params.id) })),
  createVideo: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Educational video saved as a draft', data: await videos.createDraft(req.user, req.body) })),
  publishVideo: asyncHandler(async (req, res) => apiResponse(res, { message: 'Educational video published', data: await videos.publish(req.user, req.params.id) }))
};
