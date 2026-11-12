const mongoose = require('mongoose');
const { Hospital, User, DoctorAvailability } = require('../models');
const ApiError = require('../utils/ApiError');
const { dmho } = require('../data/governmentDirectory');

const hospitalFilter = { isActive: true, directoryKey: /^itda-paderu:hospital:/ };
const phcFilter = { isActive: true, directoryKey: /^itda-paderu:phc:/ };
const safeProjection = 'name facilityType beds village mandal district address phone postalCode services directoryKey';
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function validateQueryString(value, label) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 120) throw new ApiError(400, `${label} must be 120 characters or fewer`);
  return value.trim();
}

function distanceKm(origin, destination) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(destination.latitude - origin.latitude);
  const dLng = radians(destination.longitude - origin.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function providers(query = {}) {
  const filter = { role: 'doctor', isActive: true, approvalStatus: 'approved', 'doctorProfile.profileVerifiedAt': { $exists: true } };
  const q = validateQueryString(query.q, 'Search');
  const specialization = validateQueryString(query.specialization, 'Specialization');
  const location = validateQueryString(query.location, 'Location');
  if (query.hospital !== undefined && !mongoose.isValidObjectId(query.hospital)) throw new ApiError(400, 'Invalid hospital ID');
  if (query.hospital) filter.hospital = query.hospital;
  if (specialization) filter['doctorProfile.specialization'] = new RegExp(`^${escapeRegex(specialization)}$`, 'i');
  if (q) {
    const search = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: search }, { 'doctorProfile.department': search }, { 'doctorProfile.specialization': search }, { 'doctorProfile.expertise': search }];
  }
  if (query.minExperience !== undefined) {
    if (!/^\d{1,2}$/.test(String(query.minExperience)) || Number(query.minExperience) > 80) throw new ApiError(400, 'Minimum experience must be between 0 and 80 years');
    filter['doctorProfile.yearsExperience'] = { $gte: Number(query.minExperience) };
  }
  const doctors = await User.find(filter)
    .select('name staffId phone hospital doctorProfile')
    .populate('hospital', 'hospitalId name facilityType village mandal district address phone coordinates services isActive')
    .sort({ name: 1 }).limit(100).lean();
  const doctorIds = doctors.map(item => item._id);
  const slots = await DoctorAvailability.find({ doctor: { $in: doctorIds }, status: 'Open', startsAt: { $gt: new Date() } })
    .select('doctor startsAt endsAt slotMinutes').sort({ startsAt: 1 }).limit(500).lean();
  const slotsByDoctor = new Map();
  for (const slot of slots) {
    const key = String(slot.doctor);
    if (!slotsByDoctor.has(key)) slotsByDoctor.set(key, []);
    slotsByDoctor.get(key).push(slot);
  }
  const origin = query.latitude !== undefined || query.longitude !== undefined
    ? { latitude: Number(query.latitude), longitude: Number(query.longitude) }
    : null;
  if (origin && (!Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude) || origin.latitude < -90 || origin.latitude > 90 || origin.longitude < -180 || origin.longitude > 180)) {
    throw new ApiError(400, 'Provide valid latitude and longitude');
  }
  const items = doctors.filter(doctor => doctor.hospital?.isActive !== false &&
    (!location || `${doctor.hospital?.village || ''} ${doctor.hospital?.mandal || ''} ${doctor.hospital?.district || ''} ${doctor.hospital?.address || ''}`.toLowerCase().includes(location.toLowerCase()))
  ).map(doctor => {
    const availability = slotsByDoctor.get(String(doctor._id)) || [];
    const item = {
      id: doctor._id,
      name: doctor.name,
      staffId: doctor.staffId,
      phone: doctor.phone,
      profile: doctor.doctorProfile,
      hospital: doctor.hospital,
      videoAvailable: availability.length > 0,
      availability
    };
    const coordinates = doctor.hospital?.coordinates;
    if (origin && coordinates && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude)) {
      item.distanceKm = Number(distanceKm(origin, coordinates).toFixed(1));
    }
    return item;
  });
  if (query.videoAvailable === 'true') return { items: items.filter(item => item.videoAvailable), total: items.filter(item => item.videoAvailable).length };
  if (query.videoAvailable !== undefined && query.videoAvailable !== 'false') throw new ApiError(400, 'videoAvailable must be true or false');
  return { items, total: items.length };
}

async function hospitals() {
  return Hospital.find(hospitalFilter).select(safeProjection).sort({ facilityType: 1, name: 1 }).lean();
}

async function phcs({ mandal, q } = {}) {
  const filter = { ...phcFilter };
  const term = validateQueryString(q, 'Search');
  const selectedMandal = validateQueryString(mandal, 'Mandal');
  if (selectedMandal) filter.mandal = new RegExp(`^${escapeRegex(selectedMandal)}$`, 'i');
  if (term) {
    const search = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ name: search }, { mandal: search }, { postalCode: search }, { phone: search }];
  }
  return Hospital.find(filter).select(safeProjection).sort({ mandal: 1, name: 1 }).limit(100).lean();
}

async function hospital(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid hospital ID');
  const item = await Hospital.findOne({ ...hospitalFilter, _id: id }).select(safeProjection).lean();
  if (!item) throw new ApiError(404, 'Directory hospital not found');
  return item;
}

async function phc(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid PHC ID');
  const item = await Hospital.findOne({ ...phcFilter, _id: id }).select(safeProjection).lean();
  if (!item) throw new ApiError(404, 'Directory PHC not found');
  return item;
}

async function summary() {
  const [hospitalCount, phcCount, beds, mandalCounts] = await Promise.all([
    Hospital.countDocuments(hospitalFilter),
    Hospital.countDocuments(phcFilter),
    Hospital.aggregate([{ $match: hospitalFilter }, { $group: { _id: null, total: { $sum: '$beds' } } }]),
    Hospital.aggregate([{ $match: phcFilter }, { $group: { _id: '$mandal', count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
  ]);
  return {
    hospitals: hospitalCount,
    phcs: phcCount,
    mandals: mandalCounts.length,
    beds: beds[0]?.total || 0,
    mandalCounts: mandalCounts.map(({ _id, count }) => ({ mandal: _id, count }))
  };
}

async function directory() {
  const [hospitalRows, phcRows, totals] = await Promise.all([hospitals(), phcs(), summary()]);
  return { hospitals: hospitalRows, phcs: phcRows, summary: totals, dmho };
}

module.exports = { hospitals, providers, phcs, hospital, phc, summary, directory, dmho };
