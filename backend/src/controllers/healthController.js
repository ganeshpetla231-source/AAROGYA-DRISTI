const mongoose = require('mongoose');
const apiResponse = require('../utils/apiResponse');

function getHealth(req, res) {
  const database = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  return apiResponse(res, {
    statusCode: database === 'connected' ? 200 : 503,
    message: database === 'connected' ? 'API is healthy' : 'Database is not ready',
    data: {
      service: 'aarogya-drishti-api',
      database,
      timestamp: new Date().toISOString()
    }
  });
}

module.exports = { getHealth };
