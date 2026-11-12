const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');

function resourceController(service, resource) {
  return {
    list: asyncHandler(async (req, res) => apiResponse(res, { message: `${resource} retrieved`, data: await service.list(req.query, req.user) })),
    get: asyncHandler(async (req, res) => apiResponse(res, { data: await service.get(req.params.id, req.user) })),
    create: asyncHandler(async (req, res) => apiResponse(res, { statusCode: 201, message: `${resource} created`, data: await service.create(req.body, req.user) })),
    update: asyncHandler(async (req, res) => apiResponse(res, { message: `${resource} updated`, data: await service.update(req.params.id, req.body, req.user) })),
    remove: asyncHandler(async (req, res) => apiResponse(res, { message: `${resource} deleted`, data: await service.remove(req.params.id, req.user) }))
  };
}

module.exports = resourceController;
