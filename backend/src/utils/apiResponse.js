function apiResponse(res, { statusCode = 200, message = 'Success', data = null } = {}) {
  return res.status(statusCode).json({ status: 'success', message, data });
}

module.exports = apiResponse;
