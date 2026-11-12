const mongoose = require('mongoose');
const models = require('../models');
const ApiError = require('../utils/ApiError');

const roles = ['asha', 'anm', 'cho', 'doctor', 'specialist', 'district'];
const fields = ['staffId', 'name', 'role', 'phone', 'email', 'designation', 'facility', 'mandal', 'village', 'district', 'employmentStatus', 'joinedAt', 'photoUrl'];
const statuses = ['active', 'inactive'];
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function actorDistrict(actor) {
  return actor.role === 'district' ? actor.district : undefined;
}

function districtFilter(actor) {
  const district = actorDistrict(actor);
  if (actor.role === 'district' && !district) throw new ApiError(403, 'A district assignment is required to access worker records');
  return district ? { district } : {};
}

function validateInput(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Request body must be an object');
  const unsupported = Object.keys(input).find(key => !fields.includes(key));
  if (unsupported) throw new ApiError(400, `Unsupported or protected field: ${unsupported}`);
  const value = { ...input };
  if (value.staffId !== undefined) value.staffId = String(value.staffId).trim().toUpperCase();
  for (const key of ['name', 'designation', 'mandal', 'village', 'district']) if (value[key] !== undefined) value[key] = String(value[key]).trim();
  if (value.phone !== undefined) value.phone = String(value.phone).trim();
  if (value.email !== undefined) value.email = String(value.email).trim().toLowerCase();
  if (!partial) {
    for (const key of ['staffId', 'name', 'role', 'phone', 'designation', 'facility', 'mandal', 'village', 'district', 'joinedAt']) {
      if (value[key] === undefined || value[key] === '') throw new ApiError(400, `${key} is required`);
    }
  }
  if (value.staffId !== undefined && !/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(value.staffId)) throw new ApiError(400, 'Staff ID must be 2–40 letters, numbers, or . _ / - characters');
  if (value.role !== undefined && !roles.includes(value.role)) throw new ApiError(400, 'Select a supported healthcare worker role');
  if (value.phone !== undefined && !/^\+?[0-9 ()-]{7,20}$/.test(value.phone)) throw new ApiError(400, 'Enter a valid phone number');
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) throw new ApiError(400, 'Enter a valid email address');
  if (value.employmentStatus !== undefined && !statuses.includes(value.employmentStatus)) throw new ApiError(400, 'Employment status must be active or inactive');
  if (value.joinedAt !== undefined && Number.isNaN(Date.parse(value.joinedAt))) throw new ApiError(400, 'Enter a valid joining date');
  if (value.facility !== undefined && !mongoose.isValidObjectId(value.facility)) throw new ApiError(400, 'Select a valid healthcare facility');
  if (value.photoUrl !== undefined && value.photoUrl !== '' && !/^https:\/\/[^ ]+$/i.test(value.photoUrl)) throw new ApiError(400, 'Profile photo URL must use HTTPS');
  if (value.photoUrl === '') value.photoUrl = undefined;
  for (const key of ['name', 'designation', 'mandal', 'village', 'district']) {
    if (value[key] !== undefined && (!value[key] || value[key].length > 120)) throw new ApiError(400, `${key} must contain 1–120 characters`);
  }
  return value;
}

function mapDuplicate(error) {
  if (error?.code === 11000) throw new ApiError(409, 'A worker with this staff ID already exists');
  throw error;
}

async function validateFacility(data, actor) {
  if (!data.facility) return;
  const facility = await models.Hospital.findById(data.facility).select('district mandal village').lean();
  if (!facility) throw new ApiError(400, 'The selected healthcare facility was not found');
  if (!facility.district || facility.district.toLowerCase() !== data.district.toLowerCase()) throw new ApiError(400, 'The selected facility must have a matching district assignment');
  if (actor.role === 'district' && actor.district?.toLowerCase() !== data.district.toLowerCase()) throw new ApiError(403, 'You can only manage workers in your assigned district');
}

function safeWorker(worker) {
  if (!worker) return worker;
  const result = worker.toObject ? worker.toObject() : worker;
  delete result.__v;
  return result;
}

async function list(query, actor) {
  const filter = districtFilter(actor);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  if (query.role && !roles.includes(query.role)) throw new ApiError(400, 'Invalid role filter');
  if (query.status && !statuses.includes(query.status)) throw new ApiError(400, 'Invalid employment status filter');
  if (query.role) filter.role = query.role;
  if (query.status) filter.employmentStatus = query.status;
  if (query.facility && !mongoose.isValidObjectId(query.facility)) throw new ApiError(400, 'Invalid facility filter');
  for (const key of ['mandal', 'village', 'facility']) if (query[key]) filter[key] = key === 'facility' ? query[key] : new RegExp(`^${escapeRegex(String(query[key]).slice(0, 120))}$`, 'i');
  if (query.q) {
    const term = String(query.q).trim().slice(0, 100);
    const search = new RegExp(escapeRegex(term), 'i');
    const facilityIds = await models.Hospital.find({ name: search }).distinct('_id');
    const roleMatches = {
      asha: ['asha'], 'asha worker': ['asha'], anm: ['anm'],
      cho: ['cho'], 'community health officer': ['cho'],
      doctor: ['doctor'], 'medical officer': ['doctor'],
      specialist: ['specialist'], 'specialist doctor': ['specialist'],
      district: ['district'], 'district administrator': ['district']
    }[term.toLowerCase()] || [];
    filter.$or = [...['staffId', 'name', 'role', 'phone', 'designation', 'mandal', 'village', 'district'].map(key => ({ [key]: search })), { facility: { $in: facilityIds } }, ...(roleMatches.length ? [{ role: { $in: roleMatches } }] : [])];
  }
  const sortBy = ['name', 'staffId', 'role', 'joinedAt', 'createdAt'].includes(query.sortBy) ? query.sortBy : 'name';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
  const [items, total] = await Promise.all([
    models.HealthcareWorker.find(filter).populate('facility', 'name facilityType village mandal district').sort({ [sortBy]: sortOrder, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    models.HealthcareWorker.countDocuments(filter)
  ]);
  return { items: items.map(safeWorker), page, limit, total, pages: Math.ceil(total / limit) };
}

async function get(id, actor) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid worker ID');
  const item = await models.HealthcareWorker.findOne({ _id: id, ...districtFilter(actor) }).populate('facility', 'name facilityType village mandal district').lean();
  if (!item) throw new ApiError(404, 'Healthcare worker not found');
  return safeWorker(item);
}

async function create(body, actor) {
  const data = validateInput(body);
  await validateFacility(data, actor);
  try {
    const item = await models.HealthcareWorker.create(data);
    await models.AuditLog.create({ actor: actor._id, action: 'healthcare_worker.created', resourceType: 'HealthcareWorker', resourceId: item._id });
    return get(String(item._id), actor);
  } catch (error) { mapDuplicate(error); }
}

async function update(id, body, actor) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid worker ID');
  const data = validateInput(body, true);
  if (!Object.keys(data).length) throw new ApiError(400, 'Provide at least one field to update');
  const existing = await models.HealthcareWorker.findOne({ _id: id, ...districtFilter(actor) }).lean();
  if (!existing) throw new ApiError(404, 'Healthcare worker not found');
  if (data.district && actor.role === 'district' && data.district.toLowerCase() !== actor.district.toLowerCase()) throw new ApiError(403, 'You can only manage workers in your assigned district');
  const merged = { ...existing, ...data };
  await validateFacility(merged, actor);
  try {
    const item = await models.HealthcareWorker.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    await models.AuditLog.create({ actor: actor._id, action: 'healthcare_worker.updated', resourceType: 'HealthcareWorker', resourceId: item._id });
    return get(id, actor);
  } catch (error) { mapDuplicate(error); }
}

async function setStatus(id, employmentStatus, actor) {
  if (!statuses.includes(employmentStatus)) throw new ApiError(400, 'Employment status must be active or inactive');
  const item = await update(id, { employmentStatus }, actor);
  return item;
}

async function stats(actor) {
  const scope = districtFilter(actor);
  const patientFilter = actor.role === 'district' ? { district: actor.district } : {};
  const patientIds = await models.Patient.find(patientFilter).distinct('_id');
  const [workers, patients, screenings, referrals, appointments] = await Promise.all([
    models.HealthcareWorker.find(scope).select('role employmentStatus village facility').lean(),
    models.Patient.find(patientFilter).select('_id mandal district').lean(),
    models.OralScreening.find({ patient: { $in: patientIds } }).select('patient status').lean(),
    models.Referral.find({ patient: { $in: patientIds } }).select('status').lean(),
    models.Appointment.find({ patient: { $in: patientIds } }).select('type status scheduledAt').lean()
  ]);
  const byRole = Object.fromEntries(roles.map(role => [role, workers.filter(worker => worker.role === role).length]));
  const mandalTotals = new Map();
  for (const patient of patients) if (patient.mandal) mandalTotals.set(patient.mandal, (mandalTotals.get(patient.mandal) || 0) + 1);
  const screenedPatients = new Set(screenings.map(item => String(item.patient)));
  const screenedByMandal = new Map();
  const patientMandal = new Map(patients.map(item => [String(item._id), item.mandal || 'Unassigned']));
  for (const screening of screenings) {
    const mandal = patientMandal.get(String(screening.patient));
    if (!screenedByMandal.has(mandal)) screenedByMandal.set(mandal, new Set());
    screenedByMandal.get(mandal).add(String(screening.patient));
  }
  const now = new Date();
  const followUps = appointments.filter(item => /follow.?up/i.test(item.type || ''));
  return {
    totalActiveWorkers: workers.filter(item => item.employmentStatus === 'active').length,
    workersByRole: byRole,
    assignedVillages: new Set(workers.filter(item => item.employmentStatus === 'active').map(item => item.village.toLowerCase())).size,
    activePhcs: new Set(workers.filter(item => item.employmentStatus === 'active' && item.facility).map(item => String(item.facility))).size,
    patientsScreened: screenedPatients.size,
    awaitingClinicalReview: screenings.filter(item => item.status === 'Needs review').length,
    referralsPending: referrals.filter(item => !['Completed', 'Cancelled'].includes(item.status)).length,
    referralsCompleted: referrals.filter(item => item.status === 'Completed').length,
    followUpsDue: followUps.filter(item => item.status !== 'Completed' && item.status !== 'Cancelled' && new Date(item.scheduledAt) <= now).length,
    followUpsCompleted: followUps.filter(item => item.status === 'Completed').length,
    screeningCoverageByMandal: [...mandalTotals].map(([mandal, totalPatients]) => ({ mandal, totalPatients, screenedPatients: screenedByMandal.get(mandal)?.size || 0 }))
  };
}

module.exports = { list, get, create, update, setStatus, stats };
