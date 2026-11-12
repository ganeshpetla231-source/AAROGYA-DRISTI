const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const auth = require('../services/authService');
const jwt = require('jsonwebtoken');

const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax'), path: '/api/auth' });
function setRefreshCookie(res, session) { res.cookie('refreshToken', session.refreshToken, { ...cookieOptions(), expires: session.refreshExpiresAt }); }
function clearRefreshCookie(res) { res.clearCookie('refreshToken', cookieOptions()); }
function refreshFromRequest(req) {
  if (req.cookies?.refreshToken) return req.cookies.refreshToken;
  const raw = req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith('refreshToken='));
  return raw ? decodeURIComponent(raw.slice('refreshToken='.length)) : null;
}
function sessionResponse(res, session, message, includeQr = false) {
  setRefreshCookie(res, session);
  return apiResponse(res, { message, data: { accessToken: session.accessToken, user: session.user, ...(includeQr && session.qrToken ? { qrToken: session.qrToken } : {}) } });
}

module.exports = {
  register: asyncHandler(async (req, res) => sessionResponse(res, await auth.register(req.body || {}), 'Account registered', true)),
  login: asyncHandler(async (req, res) => sessionResponse(res, await auth.login(req.body || {}), 'Signed in')),
  requestPatientOtp: asyncHandler(async (req, res) => apiResponse(res, {
    statusCode: 202,
    message: 'Verification code request processed',
    data: await auth.requestPatientOtp(req.body || {})
  })),
  verifyPatientOtp: asyncHandler(async (req, res) => {
    const session = await auth.verifyPatientOtp(req.body || {});
    return sessionResponse(res, session, 'Patient phone verified', req.body?.purpose === 'register');
  }),
  refresh: asyncHandler(async (req, res) => sessionResponse(res, await auth.refresh(refreshFromRequest(req)), 'Session refreshed')),
  logout: asyncHandler(async (req, res) => {
    let userId;
    const accessToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (accessToken) { try { userId = jwt.verify(accessToken, auth.accessSecret()).sub; } catch { /* A valid refresh cookie can still revoke an expired access session. */ } }
    await auth.logout(userId, refreshFromRequest(req)); clearRefreshCookie(res);
    return apiResponse(res, { message: 'Signed out', data: null });
  }),
  me: asyncHandler(async (req, res) => apiResponse(res, { data: { user: auth.safeUser(req.user) } })),
  getLanguage: asyncHandler(async (req, res) => apiResponse(res, { data: { language: req.user.language || 'en' } })),
  updateLanguage: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Language preference updated',
    data: { user: await auth.updateLanguage(req.user._id, req.body?.language) }
  })),
  updateProfile: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Doctor profile updated',
    data: { user: await auth.updateDoctorProfile(req.user, req.body || {}) }
  })),
  changePassword: asyncHandler(async (req, res) => sessionResponse(res, await auth.changePassword(req.user._id, req.body || {}), 'Password changed')),
  forgotPassword: asyncHandler(async (req, res) => {
    const reset = await auth.forgotPassword(req.body?.email);
    return apiResponse(res, { message: 'If an account exists for that email, password reset instructions have been prepared', data: reset });
  }),
  resetPassword: asyncHandler(async (req, res) => {
    await auth.resetPassword(req.body || {}); clearRefreshCookie(res);
    return apiResponse(res, { message: 'Password reset. Sign in with your new password.', data: null });
  })
};
