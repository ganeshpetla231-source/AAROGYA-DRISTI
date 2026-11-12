const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');
const { accessSecret, safeUser } = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError(401, 'Authentication required');
  let claims;
  try { claims = jwt.verify(token, accessSecret()); }
  catch { throw new ApiError(401, 'Access token expired or invalid'); }
  const user = await User.findById(claims.sub);
  if (!user || !user.isActive || user.authVersion !== claims.ver) throw new ApiError(401, 'Session is no longer active');
  if (user.mustChangePassword && !['/change-password', '/me', '/logout'].includes(req.path)) {
    throw new ApiError(403, 'Change your temporary password before continuing');
  }
  req.user = user;
  req.auth = { role: user.role, user: safeUser(user) };
  next();
});

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Your role is not allowed to access this resource'));
    next();
  };
}

module.exports = { authenticate, authorize };
