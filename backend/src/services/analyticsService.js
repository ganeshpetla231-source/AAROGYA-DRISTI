const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { Patient, OralScreening, Referral, Appointment, Hospital } = require('../models');
const { doctorPatientIds } = require('./doctorAssignmentService');

function dateRange(query) {
  const range = {};
  if (query.from) { const from = new Date(query.from); if (Number.isNaN(from.getTime())) throw new ApiError(400, 'Invalid start date'); from.setHours(0, 0, 0, 0); range.$gte = from; }
  if (query.to) { const to = new Date(query.to); if (Number.isNaN(to.getTime())) throw new ApiError(400, 'Invalid end date'); to.setHours(23, 59, 59, 999); range.$lte = to; }
  if (range.$gte && range.$lte && range.$gte > range.$lte) throw new ApiError(400, 'Start date must be on or before end date');
  return range;
}
async function allowedPatientIds(user) {
  if (user.role === 'admin' || user.role === 'district') return null;
  if (user.role === 'asha') return Patient.find({ assignedWorker: user._id }).distinct('_id');
  if (user.role === 'doctor') {
    return doctorPatientIds(user._id);
  }
  if (user.role === 'hospital') {
    if (!user.hospital) return [];
    const [appointments, referrals] = await Promise.all([Appointment.find({ hospital: user.hospital }).distinct('patient'), Referral.find({ hospital: user.hospital }).distinct('patient')]);
    return [...new Set([...appointments, ...referrals].map(String))];
  }
  if (user.role === 'specialist') {
    const referrals = user.hospital ? await Referral.find({ hospital: user.hospital }).distinct('patient') : [];
    return referrals.map(String);
  }
  throw new ApiError(403, 'Patient analytics are not available for this role');
}
function uniqueCount(values) { return new Set(values.map(String)).size; }

async function getAnalytics(user, query = {}) {
  if (!['admin', 'district', 'hospital', 'doctor', 'asha', 'specialist'].includes(user.role)) throw new ApiError(403, 'Analytics are not available for this role');
  for (const key of ['from', 'to', 'district', 'facility', 'mandal']) if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > 160)) throw new ApiError(400, `Invalid ${key} filter`);
  const range = dateRange(query);
  if (user.role === 'district' && query.district && query.district !== user.district) throw new ApiError(403, 'District analytics are limited to your assigned district');
  if (user.role === 'hospital' && query.facility && String(query.facility) !== String(user.hospital || '')) throw new ApiError(403, 'Facility analytics are limited to your assigned hospital');
  const hospitalId = user.role === 'hospital' ? user.hospital : query.facility || null;
  if (hospitalId && !mongoose.isValidObjectId(hospitalId)) throw new ApiError(400, 'Choose a valid facility filter');
  const basePatientFilter = {};
  if (user.role === 'district') basePatientFilter.district = user.district;
  else if (user.role === 'admin' && query.district) basePatientFilter.district = String(query.district).slice(0, 120);
  const allowed = await allowedPatientIds(user);
  if (allowed) basePatientFilter._id = { $in: allowed };
  if (query.mandal) basePatientFilter.$or = [{ mandal: String(query.mandal).slice(0, 120) }, { village: String(query.mandal).slice(0, 120) }];

  let linkedToFacility = [];
  if (hospitalId) {
    const hospital = await Hospital.findById(hospitalId).select('_id district').lean();
    if (!hospital) throw new ApiError(404, 'Facility not found');
    if (user.role === 'district' && hospital.district !== user.district) throw new ApiError(403, 'Facility is outside your assigned district');
    const [appointments, referrals] = await Promise.all([Appointment.find({ hospital: hospitalId }).distinct('patient'), Referral.find({ hospital: hospitalId }).distinct('patient')]);
    linkedToFacility = [...new Set([...appointments, ...referrals].map(String))];
    const facilityCondition = [{ primaryHospital: hospitalId }, { _id: { $in: linkedToFacility } }];
    basePatientFilter.$and = [...(basePatientFilter.$and || []), { $or: facilityCondition }];
  }
  const people = await Patient.find(basePatientFilter).select('_id district mandal village primaryHospital createdAt').lean();
  const patientIds = people.map(person => person._id);
  const screenedAt = Object.keys(range).length ? range : undefined;
  const [screenings, referrals, followups, hospitalRows, allAppointments, allReferrals, reviewedRows] = await Promise.all([
    OralScreening.find({ patient: { $in: patientIds }, ...(screenedAt ? { screenedAt } : {}) }).select('patient category status screenedAt doctorAssessment').lean(),
    Referral.find({ patient: { $in: patientIds }, ...(screenedAt ? { referredAt: range } : {}) }).select('patient hospital status referredAt').lean(),
    Appointment.find({ patient: { $in: patientIds }, type: /follow.?up/i, status: { $in: ['Upcoming', 'Confirmed'] }, scheduledAt: { $gt: new Date(), ...(screenedAt || {}) }, ...(hospitalId ? { hospital: hospitalId } : {}) }).select('patient hospital scheduledAt status').lean(),
    Hospital.find({ isActive: true, ...(hospitalId ? { _id: hospitalId } : {}), ...(user.role === 'district' ? { district: user.district } : query.district && user.role === 'admin' ? { district: String(query.district).slice(0, 120) } : {}) }).select('name facilityType village mandal district').sort({ district: 1, village: 1, name: 1 }).lean(),
    Appointment.find({ patient: { $in: patientIds }, hospital: { $ne: null } }).select('patient hospital').lean(),
    Referral.find({ patient: { $in: patientIds }, hospital: { $ne: null } }).select('patient hospital').lean(),
    OralScreening.find({ patient: { $in: patientIds }, 'doctorAssessment.reviewedAt': Object.keys(range).length ? range : { $exists: true } }).select('patient doctorAssessment.reviewedAt').lean()
  ]);
  const patientById = new Map(people.map(person => [String(person._id), person]));
  const memberFacilities = new Map();
  const addMembership = (patient, facility) => { if (!patient || !facility) return; const key = String(patient); if (!memberFacilities.has(key)) memberFacilities.set(key, new Set()); memberFacilities.get(key).add(String(facility)); };
  people.forEach(person => addMembership(person._id, person.primaryHospital));
  [...allAppointments, ...allReferrals].forEach(item => addMembership(item.patient, item.hospital));
  const createdPeople = screenedAt ? people.filter(person => { const date = new Date(person.createdAt); return (!range.$gte || date >= range.$gte) && (!range.$lte || date <= range.$lte); }) : people;
  const screenedPatientIds = [...new Set(screenings.map(item => String(item.patient)))];
  const categories = new Map(); screenings.forEach(item => categories.set(item.category, (categories.get(item.category) || 0) + 1));
  const pendingStatuses = new Set(['Needs review', 'In progress']);
  const completedReferrals = referrals.filter(item => item.status === 'Completed').length;
  const pendingReferrals = referrals.filter(item => pendingStatuses.has(item.status)).length;
  const doctorReviewedCases = reviewedRows.length;
  const screeningByPatient = new Map(); screenings.forEach(item => screeningByPatient.set(String(item.patient), (screeningByPatient.get(String(item.patient)) || 0) + 1));
  const referralsByFacility = new Map(); referrals.forEach(item => { const key = String(item.hospital); if (!referralsByFacility.has(key)) referralsByFacility.set(key, []); referralsByFacility.get(key).push(item); });
  const facilityStats = hospitalRows.map(facility => {
    const members = people.filter(person => memberFacilities.get(String(person._id))?.has(String(facility._id)));
    const memberIds = new Set(members.map(person => String(person._id)));
    const facilityReferrals = referralsByFacility.get(String(facility._id)) || [];
    return { id: facility._id, name: facility.name, facilityType: facility.facilityType, village: facility.village, mandal: facility.mandal || facility.village, district: facility.district || 'Unspecified', registeredPatients: createdPeople.filter(person => memberIds.has(String(person._id))).length, screenedPatients: uniqueCount(screenedPatientIds.filter(id => memberIds.has(id))), doctorReviewedCases: reviewedRows.filter(item => memberIds.has(String(item.patient))).length, screeningEvents: screenings.filter(item => memberIds.has(String(item.patient))).length, pendingReferrals: facilityReferrals.filter(item => pendingStatuses.has(item.status)).length, completedReferrals: facilityReferrals.filter(item => item.status === 'Completed').length, upcomingFollowups: followups.filter(item => String(item.hospital || '') === String(facility._id) || memberIds.has(String(item.patient))).length };
  });
  const groupStats = keyFor => {
    const groups = new Map();
    for (const person of people) {
      const label = keyFor(person) || 'Unspecified';
      if (!groups.has(label)) groups.set(label, { name: label, registeredPatients: 0, screenedPatients: new Set(), doctorReviewedCases: 0, pendingReferrals: 0, completedReferrals: 0, upcomingFollowups: 0, facilityCount: 0 });
      const group = groups.get(label), id = String(person._id); if (createdPeople.some(created => String(created._id) === id)) group.registeredPatients++;
      if (screenedPatientIds.includes(id)) group.screenedPatients.add(id);
      group.doctorReviewedCases += reviewedRows.filter(item => String(item.patient) === id).length;
      group.pendingReferrals += referrals.filter(item => String(item.patient) === id && pendingStatuses.has(item.status)).length;
      group.completedReferrals += referrals.filter(item => String(item.patient) === id && item.status === 'Completed').length;
      group.upcomingFollowups += followups.filter(item => String(item.patient) === id).length;
    }
    return [...groups.values()].map(({ screenedPatients, ...item }) => ({ ...item, screenedPatients: screenedPatients.size })).sort((a, b) => b.registeredPatients - a.registeredPatients);
  };
  const mandals = groupStats(person => person.mandal || person.village);
  const districts = groupStats(person => person.district);
  const districtFacilityCounts = new Map(); hospitalRows.forEach(facility => districtFacilityCounts.set(facility.district || 'Unspecified', (districtFacilityCounts.get(facility.district || 'Unspecified') || 0) + 1));
  districts.forEach(item => { item.facilityCount = districtFacilityCounts.get(item.name) || 0; });
  const districtsFilter = await Hospital.distinct('district', { isActive: true, ...(user.role === 'district' ? { district: user.district } : {}) });
  const mandalOptions = [...new Set(people.map(person => person.mandal || person.village).filter(Boolean))].sort();
  return {
    filters: { facilities: hospitalRows.map(({ _id, name, facilityType, district }) => ({ id: _id, name, facilityType, district })), districts: districtsFilter.filter(Boolean).sort(), mandals: mandalOptions },
    summary: { registeredPatients: createdPeople.length, screenedPatients: screenedPatientIds.length, doctorReviewedCases, pendingReferrals, completedReferrals, upcomingFollowups: followups.length },
    screeningCategories: [...categories].map(([category, count]) => ({ category, count })), facilities: facilityStats, mandals, districts
  };
}
module.exports = { getAnalytics };
