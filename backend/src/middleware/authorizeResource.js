const ApiError = require('../utils/ApiError');

const permissions = {
  users: { GET: ['admin'], POST: ['admin'], PATCH: ['admin'], PUT: ['admin'], DELETE: ['admin'] },
  patients: { GET: ['patient', 'asha', 'doctor', 'specialist', 'hospital'], POST: ['asha', 'doctor', 'admin'], PATCH: ['patient', 'asha', 'doctor', 'admin'], PUT: ['asha', 'doctor', 'admin'], DELETE: [] },
  medicalHistory: { GET: ['patient', 'asha', 'doctor', 'specialist'], POST: ['doctor', 'specialist'], PATCH: ['doctor', 'specialist'], PUT: ['doctor', 'specialist'], DELETE: [] },
  screenings: { GET: ['patient', 'asha', 'doctor', 'specialist'], POST: ['asha', 'doctor'], PATCH: ['doctor', 'specialist'], PUT: ['doctor', 'specialist'], DELETE: [] },
  appointments: { GET: ['patient', 'doctor', 'hospital'], POST: [], PATCH: [], PUT: [], DELETE: [] },
  hospitals: { GET: ['patient', 'asha', 'doctor', 'specialist', 'hospital', 'district', 'admin'], POST: ['admin'], PATCH: ['hospital', 'admin'], PUT: ['hospital', 'admin'], DELETE: ['admin'] },
  referrals: { GET: ['patient', 'asha', 'doctor', 'specialist', 'hospital'], POST: ['doctor'], PATCH: ['doctor', 'hospital'], PUT: ['doctor', 'hospital'], DELETE: [] },
  notifications: { GET: ['patient', 'asha', 'doctor', 'specialist', 'hospital', 'district', 'admin'], POST: ['admin'], PATCH: ['admin'], PUT: ['admin'], DELETE: ['admin'] }
};

function authorizeResource(resource) {
  return (req, res, next) => {
    const allowed = permissions[resource]?.[req.method] || [];
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!allowed.includes(req.user.role)) return next(new ApiError(403, `The ${req.user.role} role cannot ${req.method} ${resource}`));
    next();
  };
}

module.exports = { authorizeResource, permissions };
