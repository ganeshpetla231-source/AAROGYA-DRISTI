const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { Hospital, User, HealthcareWorker, Appointment } = require('../models');

function pagination(query = {}) {
  for (const key of ['page', 'limit']) {
    if (query[key] !== undefined && (typeof query[key] !== 'string' || !/^\d{1,7}$/.test(query[key]))) {
      throw new ApiError(400, `${key} must be a positive integer`);
    }
  }
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 100));
  return { page, limit, skip: (page - 1) * limit };
}

function safeFacility(item) {
  return {
    _id: item._id,
    facilityId: item.hospitalId || item.directoryKey || String(item._id),
    hospitalId: item.hospitalId,
    registrationNumber: item.registrationNumber,
    name: item.name,
    facilityType: item.facilityType,
    village: item.village,
    mandal: item.mandal,
    district: item.district,
    address: item.address,
    phone: item.phone,
    postalCode: item.postalCode,
    coordinates: item.coordinates,
    workingHours: item.workingHours,
    beds: item.beds,
    services: item.services || [],
    isActive: item.isActive,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

async function list(query = {}) {
  const { page, limit, skip } = pagination(query);
  const filter = {};
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.length > 100) throw new ApiError(400, 'Search query must be at most 100 characters');
    const term = query.q.trim();
    if (term) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['name', 'hospitalId', 'facilityType', 'village', 'mandal', 'district', 'postalCode', 'phone']
        .map(field => ({ [field]: new RegExp(escaped, 'i') }));
    }
  }
  if (query.facilityType !== undefined) {
    if (typeof query.facilityType !== 'string' || query.facilityType.length > 100) {
      throw new ApiError(400, 'Facility type must be at most 100 characters');
    }
    if (query.facilityType.trim()) {
      const escaped = query.facilityType.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.facilityType = new RegExp(`^${escaped}$`, 'i');
    }
  }
  if (query.isActive !== undefined) {
    if (!['true', 'false'].includes(query.isActive)) throw new ApiError(400, 'isActive must be true or false');
    filter.isActive = query.isActive === 'true';
  }
  const [rows, total] = await Promise.all([
    Hospital.find(filter).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    Hospital.countDocuments(filter)
  ]);
  return { items: rows.map(safeFacility), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function summary() {
  const [total, active, inactive, managers] = await Promise.all([
    Hospital.countDocuments(),
    Hospital.countDocuments({ isActive: true }),
    Hospital.countDocuments({ isActive: false }),
    User.countDocuments({ role: 'hospital' })
  ]);
  return { total, active, inactive, managers };
}

async function get(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid facility ID');
  const hospital = await Hospital.findById(id).lean();
  if (!hospital) throw new ApiError(404, 'Facility not found');
  const [manager, doctors, staff] = await Promise.all([
    User.findOne({ role: 'hospital', hospital: hospital._id })
      .select('name email phone staffId').lean(),
    User.find({ role: 'doctor', hospital: hospital._id })
      .select('name email phone staffId approvalStatus isActive doctorProfile.department doctorProfile.specialization doctorProfile.qualifications doctorProfile.registrationNumber doctorProfile.yearsExperience')
      .sort({ name: 1 }).limit(200).lean(),
    HealthcareWorker.find({ facility: hospital._id })
      .select('name email role designation phone staffId employmentStatus mandal village district joinedAt')
      .sort({ name: 1 }).limit(500).lean()
  ]);
  const doctorIds = doctors.map(doctor => doctor._id);
  const appointmentCounts = await Appointment.aggregate([
    { $match: { $or: [{ hospital: hospital._id }, ...(doctorIds.length ? [{ provider: { $in: doctorIds } }] : [])] } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const medicalOfficer = staff.find(person =>
    person.role === 'doctor' || /medical[\s-]+officer/i.test(person.designation || '')
  ) || null;
  return {
    ...safeFacility(hospital),
    medicalOfficer,
    manager,
    doctors,
    staff,
    equipment: null,
    appointments: { byStatus: appointmentCounts, total: appointmentCounts.reduce((sum, item) => sum + item.count, 0) }
  };
}

module.exports = { list, summary, get };
