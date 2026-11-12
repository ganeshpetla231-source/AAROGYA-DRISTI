const { rateLimit } = require('express-rate-limit');

const reply = (req, res) => res.status(429).json({ status: 'error', message: 'Too many requests. Wait a few minutes and retry.' });
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false, handler: reply });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false, handler: reply });
const expensiveLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false, handler: reply });

module.exports = { apiLimiter, authLimiter, expensiveLimiter };
