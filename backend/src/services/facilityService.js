const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { Hospital, User, ProfessionalDocument, AuditLog } = require('../models');
const { hasValidSignature } = require('../utils/fileSignatures');
const fileStorage = require('./fileStorageService');

const managerFields = new Set(['registrationNumber', 'facilityType', 'village', 'mandal', 'district', 'address', 'phone', 'postalCode', 'coordinates', 'workingHours', 'beds', 'services']);
const profileFields = new Set(['qualifications', 'registrationNumber', 'specialization', 'yearsExperience', 'expertise', 'consultationFee', 'biography']);
const limits = { registrationNumber: 100, facilityType: 100, village: 120, mandal: 120, district: 120, address: 500, phone: 30, postalCode: 6, workingHours: 500 };

function assertManager(user) {
  if (user?.role !== 'hospital' || !user.hospital) throw new ApiError(403, 'Hospital Manager access is required');
}

function encrypt(bytes) {
  const configured = process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && (!configured || configured.length < 32)) {
    throw new Error('Set SCREENING_IMAGE_ENCRYPTION_KEY to at least 32 characters');
  }
  const key = crypto.createHash('sha256').update(configured || 'local-development-screening-image-key-only').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([Buffer.from('ADPRF1'), iv, cipher.getAuthTag(), cipher.update(bytes), cipher.final()]);
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

function cleanDoctorProfile(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Provide a doctor profile');
  const unknown = Object.keys(input).find(field => !profileFields.has(field));
  if (unknown) throw new ApiError(400, `Unsupported doctor profile field: ${unknown}`);
  const profile = {};
  for (const field of ['registrationNumber', 'specialization', 'biography']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].trim().length > (field === 'biography' ? 2000 : 120)) {
      throw new ApiError(400, `Enter a valid doctor ${field}`);
    }
    profile[field] = input[field].trim();
  }
  if (!Array.isArray(input.qualifications) || !input.qualifications.length || input.qualifications.length > 12 ||
      input.qualifications.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 120)) {
    throw new ApiError(400, 'Provide between 1 and 12 valid doctor qualifications');
  }
  profile.qualifications = [...new Set(input.qualifications.map(value => value.trim()))];
  if (input.expertise !== undefined && (!Array.isArray(input.expertise) || input.expertise.length > 20 ||
      input.expertise.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 120))) {
    throw new ApiError(400, 'Provide up to 20 valid expertise areas');
  }
  profile.expertise = [...new Set((input.expertise || []).map(value => value.trim()))];
  if (!Number.isInteger(input.yearsExperience) || input.yearsExperience < 0 || input.yearsExperience > 80) {
    throw new ApiError(400, 'Enter a valid number of years of experience');
  }
  if (!Number.isFinite(input.consultationFee) || input.consultationFee < 0 || input.consultationFee > 1000000) {
    throw new ApiError(400, 'Enter a valid consultation fee');
  }
  profile.yearsExperience = input.yearsExperience;
  profile.consultationFee = input.consultationFee;
  if (input.biography && input.biography.length > 2000) throw new ApiError(400, 'Doctor biography must be at most 2,000 characters');
  return profile;
}

async function listDoctors(user) {
  assertManager(user);
  const items = await User.find({ role: 'doctor', hospital: user.hospital })
    .select('name email phone staffId approvalStatus isActive doctorProfile createdAt')
    .sort({ createdAt: -1 }).limit(100).lean();
  const doctorIds = items.map(item => item._id);
  const docs = await ProfessionalDocument.find({ doctor: { $in: doctorIds }, hospital: user.hospital })
    .select('doctor documentType title verificationStatus verifiedAt createdAt').sort({ createdAt: -1 }).lean();
  const documentsByDoctor = new Map();
  for (const item of docs) {
    const key = String(item.doctor);
    if (!documentsByDoctor.has(key)) documentsByDoctor.set(key, []);
    documentsByDoctor.get(key).push(item);
  }
  return { items: items.map(item => ({ ...item, documents: documentsByDoctor.get(String(item._id)) || [] })), total: items.length };
}

async function createDoctor(body, user) {
  assertManager(user);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Provide doctor account details');
  const allowed = new Set(['name', 'email', 'phone', 'doctorProfile']);
  const unknown = Object.keys(body).find(field => !allowed.has(field));
  if (unknown) throw new ApiError(400, `Unsupported doctor account field: ${unknown}`);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError(400, 'Enter a doctor name and valid email address');
  }
  if (body.phone !== undefined && (typeof body.phone !== 'string' || body.phone.trim().length > 30)) throw new ApiError(400, 'Enter a valid doctor phone number');
  const doctorProfile = cleanDoctorProfile(body.doctorProfile);
  const initialPassword = crypto.randomBytes(18).toString('hex').toLowerCase();
  const staffId = `AD-DOC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  try {
    const doctor = await User.create({
      name, email, phone: body.phone?.trim(), staffId, passwordHash: await bcrypt.hash(initialPassword, 12),
      role: 'doctor', hospital: user.hospital, approvalStatus: 'pending', isActive: false,
      mustChangePassword: true, createdByHospital: true, doctorProfile
    });
    await AuditLog.create({ actor: user._id, action: 'hospital.doctor_created', resourceType: 'User', resourceId: doctor._id, metadata: { hospital: user.hospital } });
    return { doctor: { id: doctor._id, name: doctor.name, email: doctor.email, staffId, approvalStatus: doctor.approvalStatus }, initialPassword };
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(409, 'An account with this email or staff ID already exists');
    throw error;
  }
}

async function updateDoctor(doctorId, body, user) {
  assertManager(user);
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(field => field !== 'doctorProfile' && field !== 'isActive')) {
    throw new ApiError(400, 'Only the professional profile or account active state can be updated');
  }
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor', hospital: user.hospital });
  if (!doctor) throw new ApiError(404, 'Doctor not found at your hospital');
  if (body.doctorProfile) doctor.doctorProfile = cleanDoctorProfile(body.doctorProfile);
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') throw new ApiError(400, 'isActive must be a boolean');
    doctor.isActive = body.isActive;
    if (!body.isActive) doctor.authVersion += 1;
  }
  await doctor.save();
  await AuditLog.create({ actor: user._id, action: 'hospital.doctor_updated', resourceType: 'User', resourceId: doctor._id });
  return { id: doctor._id, name: doctor.name, isActive: doctor.isActive, doctorProfile: doctor.doctorProfile };
}

async function uploadDocument(doctorId, file, body, user) {
  assertManager(user);
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor', hospital: user.hospital }).select('_id').lean();
  if (!doctor) throw new ApiError(404, 'Doctor not found at your hospital');
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
  await fileStorage.put(storageKey, encrypt(file.buffer));
  try {
    const item = await ProfessionalDocument.create({
      doctor: doctor._id, hospital: user.hospital, uploadedBy: user._id,
      documentType, title, storageKey, mimeType: file.mimetype,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'), byteLength: file.size
    });
    await AuditLog.create({ actor: user._id, action: 'hospital.doctor_document_uploaded', resourceType: 'ProfessionalDocument', resourceId: item._id, metadata: { doctor: doctor._id, documentType } });
    return safeDocument(item);
  } catch (error) {
    await fileStorage.remove(storageKey).catch(() => {});
    throw error;
  }
}

async function listDocuments(doctorId, user) {
  assertManager(user);
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  if (!await User.exists({ _id: doctorId, role: 'doctor', hospital: user.hospital })) throw new ApiError(404, 'Doctor not found at your hospital');
  const items = await ProfessionalDocument.find({ doctor: doctorId, hospital: user.hospital })
    .select('-storageKey -sha256').sort({ createdAt: -1 }).lean();
  return { items };
}

async function setDocumentVerification(documentId, status, user) {
  assertManager(user);
  if (!mongoose.isValidObjectId(documentId)) throw new ApiError(400, 'Invalid document ID');
  if (!['verified', 'rejected'].includes(status)) throw new ApiError(400, 'Choose verified or rejected');
  const item = await ProfessionalDocument.findOne({ _id: documentId, hospital: user.hospital });
  if (!item) throw new ApiError(404, 'Professional document not found at your hospital');
  item.verificationStatus = status;
  item.verifiedBy = user._id;
  item.verifiedAt = new Date();
  await item.save();
  await AuditLog.create({ actor: user._id, action: `hospital.doctor_document_${status}`, resourceType: 'ProfessionalDocument', resourceId: item._id, metadata: { doctor: item.doctor, documentType: item.documentType } });
  return safeDocument(item);
}

async function verifyDoctor(doctorId, user) {
  assertManager(user);
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  const doctor = await User.findOne({ _id: doctorId, role: 'doctor', hospital: user.hospital });
  if (!doctor) throw new ApiError(404, 'Doctor not found at your hospital');
  const docs = await ProfessionalDocument.find({ doctor: doctor._id, hospital: user.hospital, verificationStatus: 'verified' }).select('documentType').lean();
  if (!docs.some(item => item.documentType === 'qualification') || !docs.some(item => item.documentType === 'medical-registration')) {
    throw new ApiError(409, 'Verify at least one qualification and one medical-registration document before activating the doctor');
  }
  if (!doctor.doctorProfile?.registrationNumber || !doctor.doctorProfile?.qualifications?.length) throw new ApiError(409, 'Complete the doctor professional profile before activation');
  doctor.doctorProfile.profileVerifiedAt = new Date();
  doctor.approvalStatus = 'approved';
  doctor.isActive = true;
  doctor.authVersion += 1;
  await doctor.save();
  await AuditLog.create({ actor: user._id, action: 'hospital.doctor_verified', resourceType: 'User', resourceId: doctor._id });
  return { id: doctor._id, name: doctor.name, approvalStatus: doctor.approvalStatus, isActive: doctor.isActive };
}

async function downloadDocument(documentId, user) {
  if (!['hospital', 'admin'].includes(user.role)) throw new ApiError(403, 'Professional document access denied');
  if (!mongoose.isValidObjectId(documentId)) throw new ApiError(400, 'Invalid document ID');
  const filter = { _id: documentId };
  if (user.role === 'hospital') filter.hospital = user.hospital;
  const item = await ProfessionalDocument.findOne(filter).select('+storageKey +sha256');
  if (!item) throw new ApiError(404, 'Professional document not found');
  const encryptedBytes = await fileStorage.get(item.storageKey);
  const bytes = decrypt(encryptedBytes);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new ApiError(500, 'Professional document integrity check failed');
  await AuditLog.create({ actor: user._id, action: 'professional_document.downloaded', resourceType: 'ProfessionalDocument', resourceId: item._id });
  return { bytes, mimeType: item.mimeType, title: item.title };
}

module.exports = {
  getProfile, updateProfile, listDoctors, createDoctor, updateDoctor,
  uploadDocument, listDocuments, setDocumentVerification, verifyDoctor, downloadDocument
};
