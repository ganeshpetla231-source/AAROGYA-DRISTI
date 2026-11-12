const { rateLimit } = require('express-rate-limit');

const authWindowMs = 15 * 60 * 1000;
const reply = (req, res) => {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds = resetTime instanceof Date
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : 60;
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({
    status: 'error',
    message: `Too many requests. Please retry in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`
  });
};
const createLimiter = (windowMs, limit) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: reply
});

const apiLimiter = createLimiter(authWindowMs, 600);
const authLimiter = createLimiter(authWindowMs, 15);
const loginLimiter = createLimiter(authWindowMs, 30);
const patientOtpRequestLimiter = createLimiter(authWindowMs, 5);
const patientOtpVerifyLimiter = createLimiter(authWindowMs, 10);
const expensiveLimiter = createLimiter(60 * 1000, 12);

module.exports = {
  apiLimiter,
  authLimiter,
  loginLimiter,
  patientOtpRequestLimiter,
  patientOtpVerifyLimiter,
  expensiveLimiter
};
