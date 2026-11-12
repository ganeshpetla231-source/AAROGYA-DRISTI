const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const analytics = require('../services/analyticsService');
module.exports = asyncHandler(async (req, res) => apiResponse(res, { message: 'Aggregated analytics retrieved', data: await analytics.getAnalytics(req.user, req.query) }));
