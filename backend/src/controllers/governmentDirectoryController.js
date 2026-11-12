const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const service = require('../services/governmentDirectoryService');

module.exports = {
  directory: asyncHandler(async (req, res) => apiResponse(res, { message: 'Government health directory retrieved', data: await service.directory() })),
  hospitals: asyncHandler(async (req, res) => apiResponse(res, { message: 'Directory hospitals retrieved', data: await service.hospitals() })),
  providers: asyncHandler(async (req, res) => apiResponse(res, { message: 'Verified providers retrieved', data: await service.providers(req.query) })),
  hospital: asyncHandler(async (req, res) => apiResponse(res, { data: await service.hospital(req.params.id) })),
  phcs: asyncHandler(async (req, res) => apiResponse(res, { message: 'Primary health centres retrieved', data: await service.phcs({ mandal: req.query.mandal, q: req.query.q }) })),
  mandalPhcs: asyncHandler(async (req, res) => apiResponse(res, { message: 'Mandal PHCs retrieved', data: await service.phcs({ mandal: req.params.mandalName }) })),
  searchPhcs: asyncHandler(async (req, res) => apiResponse(res, { message: 'PHC search completed', data: await service.phcs({ q: req.query.q }) })),
  phc: asyncHandler(async (req, res) => apiResponse(res, { data: await service.phc(req.params.id) })),
  summary: asyncHandler(async (req, res) => apiResponse(res, { data: await service.summary() })),
  dmho: asyncHandler(async (req, res) => apiResponse(res, { data: service.dmho }))
};
