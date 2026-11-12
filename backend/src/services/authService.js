const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const ApiError = require('../utils/ApiError');
const msg91 = require('./msg91Service');
const { normalizePatientRegistration } = require('./patientRegistrationService');
const { User, Patient, PatientQR, RefreshSession, PatientOtpChallenge, AuditLog } = require('../models');

const loginCategories = {
  doctor: ['doctor'],
  admin: ['admin'],
  staff: ['asha', 'specialist', 'hospital', 'district']
};
const tokenHash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const accessSecret = () => process.env.JWT_ACCESS_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-access-secret-for-dev-2026');
const refreshSecret = () => process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-development-refresh-secret-for-dev-2026');
const refreshDays = () => Math.max(1, Number(process.env.REFRESH_TOKEN_DAYS) || 7);
const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  staffId: user.staffId,
  hospital: user.hospital,
  district: user.district,
  language: user.language,
  mustChangePassword: user.mustChangePassword === true,
  ...(user.role === 'doctor' ? { doctorProfile: user.doctorProfile } : {})
});
const supportedLanguages = ['en', 'te', 'hi'];

function assertSupportedLanguage(language) {
  if (!supportedLanguages.includes(language)) throw new ApiError(400, 'Choose English, Telugu, or Hindi');
}

function assertSecrets() {
  const access = accessSecret(), refresh = refreshSecret();
  if (!access || !refresh || access.length < 32 || refresh.length < 32 || access === refresh || /replace-with|change-me/i.test(access + refresh)) {
    throw new Error('Set unique JWT_ACCESS_SECRET and JWT_REFRESH_SECRET values of at least 32 characters');
  }
}

function validatePassword(password) {
  if (typeof password !== 'string' || !/^[a-z]{10,128}$/.test(password)) {
    throw new ApiError(400, 'Password must be 10–128 lowercase English letters');
  }
}

function normalizePatientPhone(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'Enter a valid mobile number');
  const raw = value.trim().replace(/[\s()-]/g, '');
  const countryCode = String(process.env.MSG91_COUNTRY_CODE || '91').replace(/\D/g, '');
  const normalized = raw.startsWith('+') ? raw : `+${raw.length === 10 ? countryCode : ''}${raw}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new ApiError(400, 'Enter a valid mobile number with country code');
  return normalized;
}

function otpHash(phone, code) {
  return crypto.createHmac('sha256', accessSecret()).update(`${phone}:${code}`).digest('hex');
}

function matchesOtp(phone, code, savedHash) {
  const supplied = Buffer.from(otpHash(phone, code));
  const saved = Buffer.from(savedHash || '');
  return saved.length === supplied.length && crypto.timingSafeEqual(saved, supplied);
}

async function createSession(user) {
  assertSecrets();
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + refreshDays() * 86400000);
  const accessToken = jwt.sign({ sub: String(user._id), role: user.role, ver: user.authVersion || 0 }, accessSecret(), { expiresIn: process.env.ACCESS_TOKEN_TTL || '15m' });
  const refreshToken = jwt.sign({ sub: String(user._id), ver: user.authVersion || 0, jti }, refreshSecret(), { expiresIn: `${refreshDays()}d` });
  await RefreshSession.create({ user: user._id, tokenIdHash: tokenHash(jti), expiresAt });
  return { accessToken, refreshToken, user: safeUser(user), refreshExpiresAt: expiresAt };
}

async function register() {
  throw new ApiError(403, 'Register patients with mobile OTP. Staff accounts must be provisioned by an administrator.');
}

async function login({ email, identifier, staffId, password, expectedRole }) {
  assertSecrets();
  if (expectedRole !== undefined && !Object.hasOwn(loginCategories, expectedRole)) {
    throw new ApiError(400, 'Choose a supported sign-in category');
  }
  const loginId = String(identifier || staffId || email || '').trim();
  const userFilter = loginId.includes('@')
    ? { email: loginId.toLowerCase() }
    : { staffId: loginId.toUpperCase() };
  const user = await User.findOne(userFilter).select('+passwordHash');
  if (!user || !user.passwordHash || !await bcrypt.compare(String(password || ''), user.passwordHash)) throw new ApiError(401, 'Email or password is incorrect');
  if (expectedRole && !loginCategories[expectedRole].includes(user.role)) throw new ApiError(401, 'Email or password is incorrect');
  if (user.role === 'patient') throw new ApiError(401, 'Patient accounts must sign in with mobile OTP');
  if (user.role === 'doctor' && user.approvalStatus !== 'approved') throw new ApiError(403, 'Doctor account is awaiting administrator approval');
  if (user.role === 'doctor' && user.createdByHospital && !user.doctorProfile?.profileVerifiedAt) {
    throw new ApiError(403, 'Doctor account is awaiting hospital verification');
  }
  if (!user.isActive) throw new ApiError(401, 'Email or password is incorrect');
  return createSession(user);
}

async function changePassword(userId, body = {}) {
  const { currentPassword, newPassword } = body;
  validatePassword(newPassword);
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !user.passwordHash || !await bcrypt.compare(String(currentPassword || ''), user.passwordHash)) {
    throw new ApiError(401, 'Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  user.authVersion += 1;
  await user.save();
  return createSession(user);
}

async function requestPatientOtp(input = {}) {
  assertSecrets();
  const purpose = input.purpose;
  if (!['login', 'register'].includes(purpose)) throw new ApiError(400, 'Choose patient sign-in or registration');
  const phone = normalizePatientPhone(input.phone);
  let registration;
  let user;
  if (purpose === 'login') {
    user = await User.findOne({ phone, role: 'patient', isActive: true }).select('_id').lean();
    if (!user) return { message: 'If this number is eligible, a verification code has been sent.' };
  } else {
    registration = normalizePatientRegistration(input);
    assertSupportedLanguage(registration.language);
    if (await User.exists({ email: registration.email })) throw new ApiError(409, 'An account with this email already exists');
    if (await User.exists({ phone, role: 'patient' })) throw new ApiError(409, 'An account with this mobile number already exists');
  }

  const now = new Date();
  const cooldown = new Date(now.getTime() - 60000);
  const previous = await PatientOtpChallenge.findOne({ phone, purpose }).select('sentAt').lean();
  if (previous?.sentAt > cooldown) throw new ApiError(429, 'Please wait before requesting another verification code.');
  const code = String(crypto.randomInt(100000, 1000000));
  const ttlMinutes = Math.max(2, Math.min(10, Number(process.env.PATIENT_OTP_TTL_MINUTES) || 5));
  let challenge;
  let delivery;
  try {
    challenge = await PatientOtpChallenge.findOneAndUpdate(
      { phone, purpose },
      { $set: { phone, purpose, codeHash: otpHash(phone, code), expiresAt: new Date(now.getTime() + ttlMinutes * 60000), sentAt: now, attempts: 0, consumedAt: null, registration } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    delivery = await msg91.sendPatientOtp(phone, code);
  } catch (error) {
    if (challenge) await PatientOtpChallenge.deleteOne({ _id: challenge._id, consumedAt: null });
    throw error;
  }
  return {
    message: 'If this number is eligible, a verification code has been sent.',
    ...(delivery?.developmentCode ? { developmentCode: delivery.developmentCode } : {})
  };
}

async function verifyPatientOtp(input = {}) {
  assertSecrets();
  const phone = normalizePatientPhone(input.phone);
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'Enter the six-digit verification code');
  const purpose = input.purpose;
  if (!['login', 'register'].includes(purpose)) throw new ApiError(400, 'Choose patient sign-in or registration');
  const challenge = await PatientOtpChallenge.findOneAndUpdate(
    { phone, purpose, expiresAt: { $gt: new Date() }, consumedAt: null, attempts: { $lt: 5 } },
    { $inc: { attempts: 1 } },
    { new: true }
  ).select('+codeHash');
  if (!challenge || !matchesOtp(phone, code, challenge.codeHash)) throw new ApiError(400, 'Verification code is invalid or expired.');
  const claimed = await PatientOtpChallenge.updateOne(
    { _id: challenge._id, codeHash: challenge.codeHash, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } }
  );
  if (claimed.modifiedCount !== 1) throw new ApiError(400, 'Verification code is invalid or expired.');

  if (purpose === 'login') {
    const user = await User.findOne({ phone, role: 'patient', isActive: true });
    if (!user) throw new ApiError(400, 'Verification code is invalid or expired.');
    return { ...(await createSession(user)) };
  }

  const details = challenge.registration;
  if (!details?.email || await User.exists({ $or: [{ email: details.email }, { phone, role: 'patient' }] })) {
    throw new ApiError(409, 'An account with these details already exists. Sign in or contact support.');
  }
  let user;
  try {
    user = await User.create({ name: details.name, email: details.email, phone, role: 'patient', language: details.language });
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(409, 'An account with these details already exists. Sign in or contact support.');
    throw error;
  }
  let patient;
  let qrToken;
  try {
    const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    patient = await Patient.create({
      user: user._id, name: user.name, email: user.email, phone,
      address: details.address,
      village: details.village,
      mandal: details.mandal,
      district: details.district,
      dateOfBirth: details.dateOfBirth,
      age: details.age,
      aadhaarEncrypted: details.aadhaarEncrypted,
      patientId: `AD-${new Date().getFullYear()}-${suffix}`, status: 'Screened'
    });
    qrToken = crypto.randomBytes(32).toString('base64url');
    await PatientQR.create({ patient: patient._id, tokenHash: tokenHash(qrToken), expiresAt: new Date(Date.now() + 90 * 86400000) });
  } catch (error) {
    if (patient) {
      await PatientQR.deleteMany({ patient: patient._id });
      await Patient.deleteOne({ _id: patient._id });
    }
    await User.deleteOne({ _id: user._id });
    throw error;
  }
  return { ...(await createSession(user)), qrToken };
}

async function updateLanguage(userId, language) {
  assertSupportedLanguage(language);
  const user = await User.findById(userId);
  if (!user || !user.isActive) throw new ApiError(404, 'Account not found');
  user.language = language;
  await user.save();
  return safeUser(user);
}

async function updateDoctorProfile(actor, input = {}) {
  if (actor?.role !== 'doctor') throw new ApiError(403, 'Doctor access is required');
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) {
    throw new ApiError(400, 'Provide doctor profile fields to update');
  }
  const allowedFields = new Set(['name', 'doctorProfile']);
  const unknown = Object.keys(input).find(field => !allowedFields.has(field));
  if (unknown) throw new ApiError(400, `Unsupported profile field: ${unknown}`);

  const user = await User.findById(actor._id);
  if (!user || !user.isActive) throw new ApiError(404, 'Account not found');
  if (user.role !== 'doctor') throw new ApiError(403, 'Doctor access is required');
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 120) {
      throw new ApiError(400, 'Enter a valid name up to 120 characters');
    }
    user.name = input.name.trim();
  }

  if (input.doctorProfile !== undefined) {
    const profile = input.doctorProfile;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile) || !Object.keys(profile).length) {
      throw new ApiError(400, 'Provide valid professional profile fields');
    }
    const profileFields = new Set(['department', 'specialization', 'yearsExperience', 'expertise', 'consultationFee', 'biography']);
    const unknownProfileField = Object.keys(profile).find(field => !profileFields.has(field));
    if (unknownProfileField) throw new ApiError(400, `Unsupported professional profile field: ${unknownProfileField}`);

    if (profile.department !== undefined) {
      if (typeof profile.department !== 'string' || !profile.department.trim() || profile.department.trim().length > 120) {
        throw new ApiError(400, 'Enter a valid department up to 120 characters');
      }
      user.set('doctorProfile.department', profile.department.trim());
    }
    if (profile.specialization !== undefined) {
      if (typeof profile.specialization !== 'string' || !profile.specialization.trim() || profile.specialization.trim().length > 120) {
        throw new ApiError(400, 'Enter a valid specialization up to 120 characters');
      }
      user.set('doctorProfile.specialization', profile.specialization.trim());
    }
    if (profile.biography !== undefined) {
      if (typeof profile.biography !== 'string' || profile.biography.length > 2000) {
        throw new ApiError(400, 'Biography must be a string up to 2,000 characters');
      }
      user.set('doctorProfile.biography', profile.biography.trim());
    }
    if (profile.yearsExperience !== undefined) {
      if (profile.yearsExperience !== null && (!Number.isInteger(profile.yearsExperience) || profile.yearsExperience < 0 || profile.yearsExperience > 80)) {
        throw new ApiError(400, 'Enter years of experience from 0 to 80');
      }
      user.set('doctorProfile.yearsExperience', profile.yearsExperience);
    }
    if (profile.consultationFee !== undefined) {
      if (profile.consultationFee !== null && (!Number.isFinite(profile.consultationFee) || profile.consultationFee < 0 || profile.consultationFee > 1000000)) {
        throw new ApiError(400, 'Enter a consultation fee from 0 to 1,000,000');
      }
      user.set('doctorProfile.consultationFee', profile.consultationFee);
    }
    if (profile.expertise !== undefined) {
      if (!Array.isArray(profile.expertise) || profile.expertise.length > 20 ||
          profile.expertise.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 120)) {
        throw new ApiError(400, 'Provide up to 20 expertise areas, each up to 120 characters');
      }
      user.set('doctorProfile.expertise', [...new Set(profile.expertise.map(item => item.trim()))]);
    }
  }

  await user.save();
  await AuditLog.create({ actor: user._id, action: 'doctor.profile_updated', resourceType: 'User', resourceId: user._id });
  return safeUser(user);
}

async function refresh(refreshToken) {
  assertSecrets();
  if (!refreshToken) throw new ApiError(401, 'Session expired. Sign in again.');
  let claims;
  try { claims = jwt.verify(refreshToken, refreshSecret()); }
  catch { throw new ApiError(401, 'Refresh session expired or is invalid. Sign in again.'); }
  const oldHash = tokenHash(claims.jti || '');
  const session = await RefreshSession.findOne({ tokenIdHash: oldHash, user: claims.sub, revokedAt: null, expiresAt: { $gt: new Date() } });
  if (!session) throw new ApiError(401, 'Refresh session has been revoked. Sign in again.');
  const user = await User.findById(claims.sub);
  if (!user || !user.isActive || user.authVersion !== claims.ver) throw new ApiError(401, 'Account session is no longer active. Sign in again.');
  const claimedSession = await RefreshSession.findOneAndUpdate({ _id: session._id, revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { revokedAt: new Date() } }, { new: false });
  if (!claimedSession) throw new ApiError(401, 'Refresh session has already been used. Sign in again.');
  const next = await createSession(user);
  await RefreshSession.updateOne({ _id: session._id }, { $set: { replacedBy: tokenHash(jwt.decode(next.refreshToken).jti) } });
  return next;
}

async function logout(userId, refreshToken) {
  let resolvedUserId = userId;
  if (refreshToken) {
    try {
      const claims = jwt.verify(refreshToken, refreshSecret());
      resolvedUserId = resolvedUserId || claims.sub;
      await RefreshSession.updateOne({ tokenIdHash: tokenHash(claims.jti), user: claims.sub, revokedAt: null }, { $set: { revokedAt: new Date() } });
    } catch { /* Expired refresh tokens are already unusable. */ }
  }
  if (resolvedUserId) {
    await User.updateOne({ _id: resolvedUserId }, { $inc: { authVersion: 1 } });
    await RefreshSession.updateMany({ user: resolvedUserId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
}

async function forgotPassword(email) {
  const user = await User.findOne({ email: String(email || '').trim().toLowerCase() });
  if (!user || user.role === 'patient') return {};
  const token = crypto.randomBytes(32).toString('hex');
  const minutes = Math.max(5, Number(process.env.PASSWORD_RESET_MINUTES) || 15);
  user.passwordResetHash = tokenHash(token);
  user.passwordResetExpires = new Date(Date.now() + minutes * 60000);
  await user.save();
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new ApiError(503, 'Password reset email is not configured');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {})
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM, to: user.email, subject: 'Reset your Aarogya Drishti password',
      text: `Use this one-time reset token within ${minutes} minutes:\n\n${token}\n\nReset page: ${process.env.PASSWORD_RESET_URL || ''}`
    });
    return {};
  }
  return { developmentResetToken: token };
}

async function resetPassword({ email, token, password }) {
  validatePassword(password);
  const user = await User.findOne({ email: String(email || '').trim().toLowerCase() }).select('+passwordResetHash +passwordResetExpires');
  const suppliedHash = Buffer.from(tokenHash(String(token || '')));
  const savedHash = Buffer.from(user?.passwordResetHash || '');
  const matches = savedHash.length === suppliedHash.length && crypto.timingSafeEqual(savedHash, suppliedHash);
  if (!user || !user.passwordResetHash || !user.passwordResetExpires || user.passwordResetExpires <= new Date() || !matches) {
    throw new ApiError(400, 'Password reset token is invalid or has expired');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await User.updateOne(
    { _id: user._id, passwordResetHash: user.passwordResetHash, passwordResetExpires: { $gt: new Date() } },
    { $set: { passwordHash }, $unset: { passwordResetHash: 1, passwordResetExpires: 1 }, $inc: { authVersion: 1 } }
  );
  if (updated.modifiedCount !== 1) throw new ApiError(400, 'Password reset token is invalid or has expired');
  await RefreshSession.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

module.exports = { safeUser, createSession, register, login, changePassword, requestPatientOtp, verifyPatientOtp, updateLanguage, updateDoctorProfile, refresh, logout, forgotPassword, resetPassword, accessSecret, validatePassword, normalizePatientPhone };
