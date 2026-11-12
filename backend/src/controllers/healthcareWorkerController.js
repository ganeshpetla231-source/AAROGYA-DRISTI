const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const service = require('../services/healthcareWorkerService');

module.exports = {
  list: asyncHandler(async (req, res) => apiResponse(res, { message: 'Healthcare workers retrieved', data: await service.list(req.query, req.user) })),
  stats: asyncHandler(async (req, res) => apiResponse(res, { message: 'Healthcare worker statistics retrieved', data: await service.stats(req.user) })),
  get: asyncHandler(async (req, res) => apiResponse(res, { data: await service.get(req.params.id, req.user) })),
  create: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: 'Healthcare worker created', data: await service.create(req.body, req.user) })),
  update: asyncHandler(async (req, res) => apiResponse(res, { message: 'Healthcare worker updated', data: await service.update(req.params.id, req.body, req.user) })),
  status: asyncHandler(async (req, res) => apiResponse(res, { message: 'Healthcare worker status updated', data: await service.setStatus(req.params.id, req.body?.employmentStatus, req.user) }))
};
