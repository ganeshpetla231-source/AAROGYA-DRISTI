const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

function currentDateInIndia() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}`;
}

function aadhaarEncryptionKey() {
  const configured = process.env.PATIENT_AADHAAR_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) {
    throw new Error('Set PATIENT_AADHAAR_ENCRYPTION_KEY to at least 32 characters in production');
  }
  return crypto.createHash('sha256').update(configured || 'local-development-patient-aadhaar-key-only').digest();
}

function encryptAadhaar(value) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return undefined;
  if (typeof value !== 'string') throw new ApiError(400, 'Enter a valid 12-digit Aadhaar number');
  const normalized = value.replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(normalized)) throw new ApiError(400, 'Enter a valid 12-digit Aadhaar number');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aadhaarEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function normalizeDateOfBirth(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'Enter a valid date of birth');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > currentDateInIndia()) {
    throw new ApiError(400, 'Enter a valid date of birth');
  }
  return date;
}

function normalizeAge(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const age = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(age) || age < 0 || age > 120) throw new ApiError(400, 'Enter an age from 0 to 120');
  return age;
}

function normalizePatientRegistration(input = {}) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const address = typeof input.address === 'string' ? input.address.trim() : '';
  const village = typeof input.village === 'string' ? input.village.trim() : '';
  const mandal = typeof input.mandal === 'string' ? input.mandal.trim() : '';
  const dateOfBirth = normalizeDateOfBirth(input.dateOfBirth);
  const age = dateOfBirth ? undefined : normalizeAge(input.age);
  const language = input.language || 'en';

  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError(400, 'Enter your name and a valid email address');
  }
  if (!address || address.length > 500) throw new ApiError(400, 'Enter an address of at most 500 characters');
  if (!village || village.length > 120) throw new ApiError(400, 'Enter a village or town of at most 120 characters');
  if (!mandal || mandal.length > 120) throw new ApiError(400, 'Choose a mandal');

  return {
    name,
    email,
    address,
    village,
    mandal,
    district: 'Alluri Sitharama Raju',
    dateOfBirth,
    age,
    aadhaarEncrypted: encryptAadhaar(input.aadhaar),
    language
  };
}

module.exports = { encryptAadhaar, normalizePatientRegistration };
