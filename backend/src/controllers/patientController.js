const asyncHandler = require('../utils/asyncHandler');
const apiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/ApiError');
const { Patient, OralScreening, Appointment } = require('../models');
const patientProfile = require('../services/patientProfileService');

const profileFields = new Set(['phone', 'village', 'district', 'mandal', 'dateOfBirth', 'gender']);
const genders = ['female', 'male', 'other', 'prefer-not-to-say'];

async function patientForUser(userId, includePhoto = false) {
  let query = Patient.findOne({ user: userId });
  if (includePhoto) query = query.select('+profilePhotoStorageKey');
  const patient = await query;
  if (!patient) throw new ApiError(404, 'No patient record is linked to this account');
  return patient;
}

function publicProfile(patient, user) {
  const profile = patient.toObject();
  const hasProfilePhoto = Boolean(profile.profilePhotoStorageKey);
  for (const field of ['user', 'assignedWorker', 'assignedDoctor', 'clientRequestId', 'clientRequestActor', 'clientRequestHash', '__v']) delete profile[field];
  delete profile.profilePhotoStorageKey;
  delete profile.profilePhotoMimeType;
  return { ...profile, name: user.name, email: user.email, phone: patient.phone || user.phone || '', hasProfilePhoto };
}

function pagination(query = {}) {
  for (const key of ['page', 'limit']) {
    if (query[key] !== undefined && (typeof query[key] !== 'string' || !/^\d{1,7}$/.test(query[key]))) {
      throw new ApiError(400, `${key} must be a positive integer`);
    }
  }
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = {
  me: asyncHandler(async (req, res) => {
    const patient = await patientForUser(req.user._id, true);
    return apiResponse(res, { data: { patient: publicProfile(patient, req.user) } });
  }),
  profilePhoto: asyncHandler(async (req, res) => {
    const image = await patientProfile.getPhoto(req.user);
    res.set({ 'Content-Type': image.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.send(image.bytes);
  }),
  updateProfilePhoto: asyncHandler(async (req, res) => apiResponse(res, {
    statusCode: 201,
    message: 'Patient profile photo updated',
    data: await patientProfile.updatePhoto(req.file, req.user)
  })),
  deleteProfilePhoto: asyncHandler(async (req, res) => apiResponse(res, {
    message: 'Patient profile photo removed',
    data: await patientProfile.deletePhoto(req.user)
  })),
  updateMe: asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
      throw new ApiError(400, 'Provide patient profile fields to update');
    }
    const unsupported = Object.keys(body).find(key => !profileFields.has(key));
    if (unsupported) throw new ApiError(400, `Unsupported or protected field: ${unsupported}`);
    const patient = await patientForUser(req.user._id, true);
    for (const [field, value] of Object.entries(body)) {
      if (field === 'gender') {
        if (!genders.includes(value)) throw new ApiError(400, 'Choose a valid gender preference');
        patient.gender = value;
      } else if (field === 'dateOfBirth') {
        if (value === '' || value === null) patient.dateOfBirth = undefined;
        else {
          const date = new Date(value);
          if (typeof value !== 'string' || Number.isNaN(date.getTime()) || date > new Date()) throw new ApiError(400, 'Enter a valid date of birth');
          patient.dateOfBirth = date;
          patient.age = undefined;
        }
      } else {
        if (typeof value !== 'string' || value.trim().length > (field === 'phone' ? 30 : 120)) {
          throw new ApiError(400, `Enter a valid ${field}`);
        }
        patient[field] = value.trim();
      }
    }
    await patient.save();
    return apiResponse(res, { message: 'Patient profile updated', data: { patient: publicProfile(patient, req.user) } });
  }),
  screenings: asyncHandler(async (req, res) => {
    const patient = await patientForUser(req.user._id);
    const { page, limit, skip } = pagination(req.query);
    const filter = { patient: patient._id, demonstration: { $ne: true } };
    const [items, total] = await Promise.all([
      OralScreening.find(filter).sort({ screenedAt: -1 }).skip(skip).limit(limit).select('-__v')
        .populate('doctorAssessment.reviewedBy', 'name')
        .populate('doctorAssessment.referralHospital', 'name')
        .populate('reviews.reviewedBy', 'name')
        .populate('reviews.referralHospital', 'name')
        .lean(),
      OralScreening.countDocuments(filter)
    ]);
    return apiResponse(res, { data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  }),
  appointments: asyncHandler(async (req, res) => {
    const patient = await patientForUser(req.user._id);
    const { page, limit, skip } = pagination(req.query);
    const filter = { patient: patient._id };
    const [items, total] = await Promise.all([
      Appointment.find(filter).sort({ scheduledAt: -1 }).skip(skip).limit(limit)
        .populate('provider', 'name role')
        .populate('hospital', 'name village district')
        .select('-__v').lean(),
      Appointment.countDocuments(filter)
    ]);
    return apiResponse(res, { data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  })
};
