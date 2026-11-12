const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { Hospital, User, ProfessionalDocument, AuditLog, DoctorAvailability } = require('../models');
const { hasValidSignature } = require('../utils/fileSignatures');
const fileStorage = require('./fileStorageService');

const managerFields = new Set(['registrationNumber', 'facilityType', 'village', 'mandal', 'district', 'address', 'phone', 'postalCode', 'coordinates', 'workingHours', 'beds', 'services']);
const limits = { registrationNumber: 100, facilityType: 100, village: 120, mandal: 120, district: 120, address: 500, phone: 30, postalCode: 6, workingHours: 500 };

function assertManager(user) {
  if (user?.role !== 'hospital' || !user.hospital) throw new ApiError(403, 'Hospital Manager access is required');
}

function assertAdmin(user) {
  if (user?.role !== 'admin') throw new ApiError(403, 'Administrator access is required for doctor credential management');
}

function logDocumentUploadFailure(stage, error) {
  const details = {
    stage,
    errorName: error?.name || 'Error'
  };
  if (error?.code !== undefined) details.errorCode = String(error.code).slice(0, 40);
  if (error?.http_code !== undefined) details.providerHttpCode = Number(error.http_code) || undefined;
  if (error?.name === 'ValidationError') details.validationFields = Object.keys(error.errors || {}).slice(0, 10);
  console.error('Professional document upload failed', details);
}

function encrypt(bytes) {
  const configured = process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) {
    throw new Error('Set SCREENING_IMAGE_ENCRYPTION_KEY to at least 32 characters');
  }
  const key = crypto.createHash('sha256').update(configured || 'local-development-screening-image-key-only').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from('ADPRF1'), iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(bytes) {
  if (bytes.toString('ascii', 0, 6) !== 'ADPRF1') throw new Error('Stored professional document has an invalid format');
  const configured = process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) {
    throw new Error('Set SCREENING_IMAGE_ENCRYPTION_KEY to at least 32 characters');
  }
  const key = crypto.createHash('sha256').update(configured || 'local-development-screening-image-key-only').digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(6, 18));
  decipher.setAuthTag(bytes.subarray(18, 34));
  return Buffer.concat([decipher.update(bytes.subarray(34)), decipher.final()]);
}

function safeDocument(document) {
  const item = document.toObject ? document.toObject() : { ...document };
  delete item.storageKey;
  delete item.sha256;
  return item;
}

async function getProfile(user) {
  assertManager(user);
  const hospital = await Hospital.findById(user.hospital).lean();
  if (!hospital) throw new ApiError(404, 'Your assigned hospital was not found');
  return { hospital };
}

async function updateProfile(body, user) {
  assertManager(user);
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
    throw new ApiError(400, 'Provide hospital profile fields to update');
  }
  const unknown = Object.keys(body).find(field => !managerFields.has(field));
  if (unknown) throw new ApiError(400, `Hospital Managers cannot update ${unknown}`);
  const hospital = await Hospital.findById(user.hospital);
  if (!hospital) throw new ApiError(404, 'Your assigned hospital was not found');
  for (const [field, value] of Object.entries(body)) {
    if (field === 'coordinates') {
      if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) ||
          value.latitude < -90 || value.latitude > 90 || value.longitude < -180 || value.longitude > 180) {
        throw new ApiError(400, 'Provide valid hospital latitude and longitude');
      }
      hospital.coordinates = value;
    } else if (field === 'services') {
      if (!Array.isArray(value) || value.length > 30 || value.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 100)) {
        throw new ApiError(400, 'Provide up to 30 valid hospital services');
      }
      hospital.services = [...new Set(value.map(item => item.trim()))];
    } else if (field === 'postalCode' && value === '') {
      hospital.postalCode = undefined;
    } else if (field === 'beds') {
      if (!Number.isInteger(value) || value < 0 || value > 100000) throw new ApiError(400, 'Beds must be a non-negative whole number');
      hospital.beds = value;
    } else {
      if (typeof value !== 'string' || value.trim().length > limits[field]) throw new ApiError(400, `Enter a valid ${field}`);
      if (field === 'postalCode' && value.trim() && !/^\d{6}$/.test(value.trim())) throw new ApiError(400, 'Postal code must contain six digits');
      hospital[field] = value.trim();
    }
  }
  await hospital.save();
  await AuditLog.create({ actor: user._id, action: 'hospital.profile_updated', resourceType: 'Hospital', resourceId: hospital._id });
  return { hospital: hospital.toObject() };
}

async function listDoctors(user) {
  assertAdmin(user);
  const items = await User.find({ role: 'doctor' })
    .select('name email phone staffId approvalStatus isActive hospital doctorProfile createdAt')
    .populate('hospital', 'name hospitalId isActive')
    .sort({ createdAt: -1 }).limit(200).lean();
  const doctorIds = items.map(item => item._id);
  const docs = await ProfessionalDocument.find({ doctor: { $in: doctorIds } })
    .select('doctor documentType title verificationStatus verifiedAt createdAt').sort({ createdAt: -1 }).lean();
  const documentsByDoctor = new Map();
  for (const item of docs) {
    const key = String(item.doctor);
    if (!documentsByDoctor.has(key)) documentsByDoctor.set(key, []);
    documentsByDoctor.get(key).push(item);
  }
  return { items: items.map(item => ({ ...item, documents: documentsByDoctor.get(String(item._id)) || [] })), total: items.length };
}

async function updateDoctorProfessionalProfile(doctorId, input, user) {
  assertAdmin(user);
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Provide professional profile fields');
  const allowed = new Set(['registrationNumber', 'qualifications', 'department', 'specialization', 'yearsExperience', 'expertise', 'consultationFee', 'biography']);
  const unknown = Object.keys(input).find(field => !allowed.has(field));
  if (unknown) throw new ApiError(400, `Unsupported professional profile field: ${unknown}`);

  const registrationNumber = typeof input.registrationNumber === 'string' ? input.registrationNumber.trim() : '';
  if (!registrationNumber || registrationNumber.length > 80) throw new ApiError(400, 'Enter a valid medical registration number');
  if (!Array.isArray(input.qualifications) || !input.qualifications.length || input.qualifications.length > 12 ||
      input.qualifications.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 120)) {
    throw new ApiError(400, 'Provide between 1 and 12 valid doctor qualifications');
  }
  for (const field of ['department', 'specialization']) {
    if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].trim().length > 120)) {
      throw new ApiError(400, `Enter a valid doctor ${field}`);
    }
  }
  if (!Number.isInteger(input.yearsExperience) || input.yearsExperience < 0 || input.yearsExperience > 80) {
    throw new ApiError(400, 'Enter a valid number of years of experience');
  }
  if (!Number.isFinite(input.consultationFee) || input.consultationFee < 0 || input.consultationFee > 1000000) {
    throw new ApiError(400, 'Enter a valid consultation fee');
  }
  if (typeof input.biography !== 'string' || input.biography.length > 2000) {
    throw new ApiError(400, 'Enter a doctor biography up to 2,000 characters');
  }
  if (input.expertise !== undefined && (!Array.isArray(input.expertise) || input.expertise.length > 20 ||
      input.expertise.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 120))) {
    throw new ApiError(400, 'Provide up to 20 valid expertise areas');
  }

  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });
  if (!doctor) throw new ApiError(404, 'Doctor account not found');
  doctor.set('doctorProfile.registrationNumber', registrationNumber);
  doctor.set('doctorProfile.qualifications', [...new Set(input.qualifications.map(value => value.trim()))]);
  doctor.set('doctorProfile.department', input.department?.trim() || undefined);
  doctor.set('doctorProfile.specialization', input.specialization?.trim() || undefined);
  doctor.set('doctorProfile.yearsExperience', input.yearsExperience);
  doctor.set('doctorProfile.expertise', [...new Set((input.expertise || []).map(value => value.trim()))]);
  doctor.set('doctorProfile.consultationFee', input.consultationFee);
  doctor.set('doctorProfile.biography', input.biography.trim());
  const wasVerified = Boolean(doctor.doctorProfile?.profileVerifiedAt);
  doctor.set('doctorProfile.profileVerifiedAt', undefined);
  await doctor.save();

  const openSlotsCancelled = wasVerified
    ? (await DoctorAvailability.updateMany(
      { doctor: doctor._id, status: 'Open', startsAt: { $gt: new Date() } },
      { $set: { status: 'Cancelled' } }
    )).modifiedCount
    : 0;
  await AuditLog.create({ actor: user._id, action: 'admin.doctor_profile_updated', resourceType: 'User', resourceId: doctor._id });
  return {
    id: doctor._id,
    isActive: doctor.isActive,
    approvalStatus: doctor.approvalStatus,
    doctorProfile: doctor.doctorProfile,
    profileVerified: false,
    openSlotsCancelled
  };
}

async function uploadDocument(doctorId, file, body, user) {
  assertAdmin(user);
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' }).select('_id hospital').lean();
  if (!doctor) throw new ApiError(404, 'Doctor account not found');
  if (!doctor.hospital || !await Hospital.exists({ _id: doctor.hospital, isActive: true })) {
    throw new ApiError(409, 'Assign the doctor to an active hospital before uploading credentials');
  }
  if (!file) throw new ApiError(400, 'Choose a professional document');
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, 'Professional documents must be 10 MB or smaller');
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype) || !hasValidSignature(file.buffer, file.mimetype)) {
    throw new ApiError(415, 'Upload a valid PDF, JPEG, or PNG document');
  }
  const documentType = body?.documentType;
  if (!['qualification', 'medical-registration', 'experience', 'other'].includes(documentType)) throw new ApiError(400, 'Choose a valid professional document type');
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 160) throw new ApiError(400, 'Enter a document title up to 160 characters');
  const storageKey = `${crypto.randomUUID()}.enc`;
  let stage = 'encryption';
  let storageAttempted = false;
  let item;
  try {
    const encryptedFile = encrypt(file.buffer);
    stage = 'storage';
    storageAttempted = true;
    await fileStorage.put(storageKey, encryptedFile);
    stage = 'document-record';
    item = await ProfessionalDocument.create({
      doctor: doctor._id, hospital: doctor.hospital, uploadedBy: user._id,
      documentType, title, storageKey, mimeType: file.mimetype,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'), byteLength: file.size
    });
    stage = 'audit-log';
    await AuditLog.create({ actor: user._id, action: 'admin.doctor_document_uploaded', resourceType: 'ProfessionalDocument', resourceId: item._id, metadata: { doctor: doctor._id, documentType } });
    return safeDocument(item);
  } catch (error) {
    if (item) {
      try {
        await ProfessionalDocument.deleteOne({ _id: item._id });
      } catch (cleanupError) {
        logDocumentUploadFailure('document-record-cleanup', cleanupError);
      }
    }
    if (storageAttempted) {
      try {
        await fileStorage.remove(storageKey);
      } catch (cleanupError) {
        logDocumentUploadFailure('storage-cleanup', cleanupError);
      }
    }
    logDocumentUploadFailure(stage, error);
    throw error;
  }
}

async function listDocuments(doctorId, user) {
  assertAdmin(user);
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  if (!await User.exists({ _id: doctorId, role: 'doctor' })) throw new ApiError(404, 'Doctor account not found');
  const items = await ProfessionalDocument.find({ doctor: doctorId })
    .select('-storageKey -sha256').sort({ createdAt: -1 }).lean();
  return { items };
}

async function setDocumentVerification(documentId, status, user) {
  assertAdmin(user);
  if (!mongoose.isValidObjectId(documentId)) throw new ApiError(400, 'Invalid document ID');
  if (!['verified', 'rejected'].includes(status)) throw new ApiError(400, 'Choose verified or rejected');
  const item = await ProfessionalDocument.findById(documentId);
  if (!item) throw new ApiError(404, 'Professional document not found');
  item.verificationStatus = status;
  item.verifiedBy = user._id;
  item.verifiedAt = new Date();
  await item.save();
  await AuditLog.create({ actor: user._id, action: `admin.doctor_document_${status}`, resourceType: 'ProfessionalDocument', resourceId: item._id, metadata: { doctor: item.doctor, documentType: item.documentType } });
  return safeDocument(item);
}

async function verifyDoctor(doctorId, user) {
  assertAdmin(user);
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor' });
  if (!doctor) throw new ApiError(404, 'Doctor account not found');
  const docs = await ProfessionalDocument.find({ doctor: doctor._id, verificationStatus: 'verified' }).select('documentType').lean();
  if (!docs.some(item => item.documentType === 'qualification') || !docs.some(item => item.documentType === 'medical-registration')) {
    throw new ApiError(409, 'Verify at least one qualification and one medical-registration document before verifying the doctor profile');
  }
  if (!doctor.doctorProfile?.registrationNumber || !doctor.doctorProfile?.qualifications?.length) throw new ApiError(409, 'Complete the doctor professional profile before verification');
  doctor.doctorProfile.profileVerifiedAt = new Date();
  await doctor.save();
  await AuditLog.create({ actor: user._id, action: 'admin.doctor_verified', resourceType: 'User', resourceId: doctor._id });
  return { id: doctor._id, name: doctor.name, approvalStatus: doctor.approvalStatus, isActive: doctor.isActive };
}

async function downloadDocument(documentId, user) {
  assertAdmin(user);
  if (!mongoose.isValidObjectId(documentId)) throw new ApiError(400, 'Invalid document ID');
  const item = await ProfessionalDocument.findOne({ _id: documentId }).select('+storageKey +sha256');
  if (!item) throw new ApiError(404, 'Professional document not found');
  const encryptedBytes = await fileStorage.get(item.storageKey);
  const bytes = decrypt(encryptedBytes);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new ApiError(500, 'Professional document integrity check failed');
  await AuditLog.create({ actor: user._id, action: 'professional_document.downloaded', resourceType: 'ProfessionalDocument', resourceId: item._id });
  return { bytes, mimeType: item.mimeType, title: item.title };
}

module.exports = {
  getProfile, updateProfile, listDoctors,
  updateDoctorProfessionalProfile, uploadDocument, listDocuments, setDocumentVerification, verifyDoctor, downloadDocument
};
