const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const { createResourceService } = require('../services/resourceService');
const facilities = require('../services/adminFacilityService');
const { Hospital } = require('../models');

const hospitalResources = createResourceService({ model: Hospital, resource: 'hospitals' });

module.exports = {
  list: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Facilities retrieved',
    data: await facilities.list(req.query)
  })),
  summary: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Facility summary retrieved',
    data: await facilities.summary()
  })),
  get: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Facility retrieved',
    data: await facilities.get(req.params.id)
  })),
  update: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Facility updated',
    data: await hospitalResources.update(req.params.id, req.body, req.user)
  }))
};
