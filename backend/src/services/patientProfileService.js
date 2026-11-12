const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { hasValidSignature } = require('../utils/fileSignatures');
const fileStorage = require('./fileStorageService');
const { Patient, AuditLog } = require('../models');

const maxPhotoBytes = 5 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function encryptionKey() {
  const configured = process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) {
    throw new Error('Set SCREENING_IMAGE_ENCRYPTION_KEY to at least 32 characters in production');
  }
  return crypto.createHash('sha256').update(configured || 'local-development-screening-image-key-only').digest();
}

function encrypt(bytes) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from('ADIMG1'), nonce, cipher.getAuthTag(), ciphertext]);
}

function decrypt(bytes) {
  if (bytes.toString('ascii', 0, 6) !== 'ADIMG1') throw new Error('Stored patient profile image has an invalid format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(6, 18));
  decipher.setAuthTag(bytes.subarray(18, 34));
  return Buffer.concat([decipher.update(bytes.subarray(34)), decipher.final()]);
}

async function patientForUser(user) {
  const patient = await Patient.findOne({ user: user._id }).select('+profilePhotoStorageKey +profilePhotoMimeType');
  if (!patient) throw new ApiError(404, 'No patient record is linked to this account');
  return patient;
}

async function removeStoredPhoto(key) {
  if (!key) return;
  try {
    await fileStorage.remove(key);
  } catch (failure) {
    console.error('Could not remove a replaced patient profile photo:', failure.message);
  }
}

async function updatePhoto(file, user) {
  if (!file) throw new ApiError(400, 'Choose a profile photo');
  if (file.size > maxPhotoBytes) throw new ApiError(413, 'Profile photo exceeds the 5 MB limit');
  if (!allowedTypes.has(file.mimetype) || !hasValidSignature(file.buffer, file.mimetype)) {
    throw new ApiError(415, 'Use a valid JPEG, PNG, or WebP profile photo');
  }

  const patient = await patientForUser(user);
  const storageKey = `${crypto.randomUUID()}.enc`;
  await fileStorage.put(storageKey, encrypt(file.buffer));
  const previousKey = patient.profilePhotoStorageKey;
  patient.profilePhotoStorageKey = storageKey;
  patient.profilePhotoMimeType = file.mimetype;
  try {
    await patient.save();
  } catch (failure) {
    await removeStoredPhoto(storageKey);
    throw failure;
  }
  await AuditLog.create({ actor: user._id, action: 'patient.profile_photo_updated', resourceType: 'Patient', resourceId: patient._id });
  if (previousKey && previousKey !== storageKey) await removeStoredPhoto(previousKey);
  return { hasProfilePhoto: true };
}

async function getPhoto(user) {
  const patient = await patientForUser(user);
  if (!patient.profilePhotoStorageKey || !patient.profilePhotoMimeType) {
    throw new ApiError(404, 'No profile photo has been uploaded');
  }
  const bytes = decrypt(await fileStorage.get(patient.profilePhotoStorageKey));
  return { bytes, mimeType: patient.profilePhotoMimeType };
}

async function deletePhoto(user) {
  const patient = await patientForUser(user);
  const previousKey = patient.profilePhotoStorageKey;
  patient.profilePhotoStorageKey = undefined;
  patient.profilePhotoMimeType = undefined;
  await patient.save();
  await AuditLog.create({ actor: user._id, action: 'patient.profile_photo_removed', resourceType: 'Patient', resourceId: patient._id });
  await removeStoredPhoto(previousKey);
  return { hasProfilePhoto: false };
}

module.exports = { updatePhoto, getPhoto, deletePhoto };
