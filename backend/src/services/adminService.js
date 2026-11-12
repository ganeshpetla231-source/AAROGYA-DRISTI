const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const models = require('../models');
const { User, HealthcareWorker, Patient, Hospital, OralScreening, Appointment, Consultation, Referral, AuditLog } = models;
const { validatePassword, safeUser } = require('./authService');
const notificationService = require('./notificationService');
const supportedLanguages = ['en', 'te', 'hi'];
const provisionableStaffRoles = ['asha', 'specialist', 'district'];

function pageOptions(query = {}) {
  for (const key of ['page', 'limit']) {
    if (query[key] !== undefined && (typeof query[key] !== 'string' || !/^\d{1,7}$/.test(query[key]))) {
      throw new ApiError(400, `${key} must be a positive integer`);
    }
  }
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

async function dashboard() {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const [totalPatients, totalHospitals, activeHospitals, totalHospitalAdmins, totalHealthWorkers, totalDoctors, totalScreenings, pendingCases, completedCases, totalAppointments, todayAppointments, pendingAppointments, completedConsultations, pendingDoctorApprovals, activeUsers, totalReferrals, referralsByStatus, appointmentsByStatus, casesByStatus, monthlyRegistrations, patientsByHospital, screeningsByDistrict] = await Promise.all([
    Patient.countDocuments(),
    Hospital.countDocuments(),
    Hospital.countDocuments({ isActive: true }),
    User.countDocuments({ role: 'hospital' }),
    HealthcareWorker.countDocuments({ employmentStatus: 'active' }),
    User.countDocuments({ role: 'doctor' }),
    OralScreening.countDocuments(),
    OralScreening.countDocuments({ status: { $in: ['Needs review', 'Awaiting clinician review'] } }),
    OralScreening.countDocuments({ status: 'Reviewed' }),
    Appointment.countDocuments(),
    Appointment.countDocuments({ scheduledAt: { $gte: todayStart, $lt: tomorrowStart } }),
    Appointment.countDocuments({ status: 'Upcoming' }),
    Consultation.countDocuments({ status: 'Completed' }),
    User.countDocuments({ role: 'doctor', approvalStatus: 'pending' }),
    User.countDocuments({ isActive: true }),
    Referral.countDocuments(),
    Referral.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    OralScreening.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Patient.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]),
    Patient.aggregate([
      { $match: { primaryHospital: { $exists: true, $ne: null } } },
      { $group: { _id: '$primaryHospital', patients: { $sum: 1 } } },
      { $lookup: { from: Hospital.collection.name, localField: '_id', foreignField: '_id', as: 'hospital' } },
      { $unwind: '$hospital' },
      { $project: { _id: 0, hospitalId: '$hospital.hospitalId', hospitalName: '$hospital.name', patients: 1 } },
      { $sort: { patients: -1, hospitalName: 1 } },
      { $limit: 20 }
    ]),
    OralScreening.aggregate([
      { $lookup: { from: Patient.collection.name, localField: 'patient', foreignField: '_id', as: 'patientRecord' } },
      { $unwind: '$patientRecord' },
      { $group: { _id: { $ifNull: ['$patientRecord.district', 'Not provided'] }, screenings: { $sum: 1 } } },
      { $sort: { screenings: -1, _id: 1 } }
    ])
  ]);
  return {
    summary: { totalPatients, totalHospitals, activeHospitals, totalHospitalAdmins, totalHealthWorkers, totalDoctors, totalScreenings, pendingCases, completedCases, totalAppointments, todayAppointments, pendingAppointments, completedConsultations, pendingDoctorApprovals, activeUsers, totalReferrals },
    referralsByStatus,
    appointmentsByStatus,
    casesByStatus,
    monthlyRegistrations,
    patientsByHospital,
    districtStatistics: screeningsByDistrict
  };
}

async function activity(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  const [items, total] = await Promise.all([
    AuditLog.find().sort({ occurredAt: -1 }).skip(skip).limit(limit)
      .populate('actor', 'name role').select('actor action resourceType occurredAt').lean(),
    AuditLog.countDocuments()
  ]);
  return {
    items: items.map(({ _id, actor, action, resourceType, occurredAt }) => ({
      id: _id, actor: actor ? { name: actor.name, role: actor.role } : null,
      action, resourceType, occurredAt
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

async function hospitals(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  const filter = {};
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.length > 100) throw new ApiError(400, 'Search query must be at most 100 characters');
    if (query.q.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['name', 'hospitalId', 'district', 'village'].map(field => ({ [field]: new RegExp(escaped, 'i') }));
    }
  }
  const [items, total] = await Promise.all([
    Hospital.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Hospital.countDocuments(filter)
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function hospitalManagers(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  const filter = { role: 'hospital' };
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .select('name email phone staffId hospital isActive createdAt')
      .populate('hospital', 'name hospitalId').lean(),
    User.countDocuments(filter)
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function adminAccounts(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  const [items, total] = await Promise.all([
    User.find({ role: 'admin' }).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .select('name email phone staffId isActive createdAt').lean(),
    User.countDocuments({ role: 'admin' })
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function createAdminAccount(body, actor) {
  const allowed = new Set(['name', 'email', 'password', 'phone', 'staffId', 'language']);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Request body must be an object');
  const unsupported = Object.keys(body).find(key => !allowed.has(key));
  if (unsupported) throw new ApiError(400, `Unsupported administrator account field: ${unsupported}`);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError(400, 'Enter a name and a valid email address');
  }
  validatePassword(body.password);
  const language = body.language || 'en';
  if (!supportedLanguages.includes(language)) throw new ApiError(400, 'Choose English, Telugu, or Hindi');
  if (body.phone !== undefined && (typeof body.phone !== 'string' || body.phone.trim().length > 30)) {
    throw new ApiError(400, 'Enter a valid phone number');
  }
  const staffId = typeof body.staffId === 'string' && body.staffId.trim()
    ? body.staffId.trim().toUpperCase()
    : `AD-ADM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(staffId)) throw new ApiError(400, 'Staff ID must be 2–40 letters, numbers, or . _ / - characters');
  try {
    const user = await User.create({
      name, email, staffId, passwordHash: await bcrypt.hash(body.password, 12),
      phone: body.phone?.trim(), language, role: 'admin', approvalStatus: 'approved',
      isActive: true, mustChangePassword: true
    });
    await AuditLog.create({ actor: actor._id, action: 'admin.administrator_created', resourceType: 'User', resourceId: user._id });
    return safeUser(user);
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(409, 'An account with this email or staff ID already exists');
    throw error;
  }
}

async function referrals(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  const filter = {};
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.length > 100) throw new ApiError(400, 'Search query must be at most 100 characters');
    const term = query.q.trim();
    if (term) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const expression = new RegExp(escaped, 'i');
      const [patientIds, hospitalIds, providerIds] = await Promise.all([
        Patient.find({ $or: [{ name: expression }, { patientId: expression }] }).distinct('_id'),
        Hospital.find({ $or: [{ name: expression }, { hospitalId: expression }] }).distinct('_id'),
        User.find({ role: 'doctor', name: expression }).distinct('_id')
      ]);
      filter.$or = [
        { patient: { $in: patientIds } },
        { hospital: { $in: hospitalIds } },
        { fromProvider: { $in: providerIds } },
        { status: expression }
      ];
    }
  }
  if (query.status !== undefined) {
    const statuses = Referral.schema.path('status').enumValues;
    if (typeof query.status !== 'string' || !statuses.includes(query.status)) throw new ApiError(400, 'Invalid referral status');
    filter.status = query.status;
  }
  const [records, total] = await Promise.all([
    Referral.find(filter).sort({ referredAt: -1, createdAt: -1 }).skip(skip).limit(limit)
      .select('patient hospital fromProvider status referredAt createdAt')
      .populate('patient', 'name patientId district')
      .populate('hospital', 'name hospitalId district')
      .populate('fromProvider', 'name role')
      .lean(),
    Referral.countDocuments(filter)
  ]);
  return {
    items: records.map(item => ({
      id: item._id,
      patient: item.patient ? { id: item.patient._id, name: item.patient.name, patientId: item.patient.patientId } : null,
      hospital: item.hospital ? { id: item.hospital._id, name: item.hospital.name, hospitalId: item.hospital.hospitalId } : null,
      provider: item.fromProvider ? { name: item.fromProvider.name, role: item.fromProvider.role } : null,
      status: item.status,
      referredAt: item.referredAt || item.createdAt
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

async function adminNotificationRecipients(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  if (!['patient', 'doctor'].includes(query.role)) throw new ApiError(400, 'Choose patients or doctors as recipients');
  const filter = { role: query.role, isActive: true };
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.length > 100) throw new ApiError(400, 'Search query must be at most 100 characters');
    const term = query.q.trim();
    if (term) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['name', 'email', 'staffId'].map(field => ({ [field]: new RegExp(escaped, 'i') }));
    }
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ name: 1, _id: 1 }).skip(skip).limit(limit).select('name email role staffId').lean(),
    User.countDocuments(filter)
  ]);
  return {
    items: users.map(user => ({ id: user._id, name: user.name, email: user.email, role: user.role, staffId: user.staffId })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

async function adminNotifications(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  const filter = { 'metadata.source': 'admin-dashboard' };
  if (query.status !== undefined) {
    if (!['read', 'unread'].includes(query.status)) throw new ApiError(400, 'Status must be read or unread');
    filter.readAt = query.status === 'read' ? { $ne: null } : null;
  }
  const [items, total] = await Promise.all([
    models.Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .select('user title message type readAt createdAt')
      .populate('user', 'name role').lean(),
    models.Notification.countDocuments(filter)
  ]);
  return {
    items: items.map(item => ({
      id: item._id,
      recipient: item.user ? { name: item.user.name, role: item.user.role } : null,
      title: item.title,
      message: item.message,
      type: item.type,
      readAt: item.readAt || null,
      createdAt: item.createdAt
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

async function createAdminNotification(body, actor) {
  const allowed = new Set(['recipientId', 'title', 'message']);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Request body must be an object');
  const unsupported = Object.keys(body).find(key => !allowed.has(key));
  if (unsupported) throw new ApiError(400, `Unsupported notification field: ${unsupported}`);
  if (!mongoose.isValidObjectId(body.recipientId)) throw new ApiError(400, 'Select a valid recipient');
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!title || title.length > 180) throw new ApiError(400, 'Enter a notification title of at most 180 characters');
  if (!message || message.length > 1000) throw new ApiError(400, 'Enter a notification message of at most 1000 characters');
  const recipient = await User.findOne({ _id: body.recipientId, role: { $in: ['patient', 'doctor'] }, isActive: true }).select('_id role').lean();
  if (!recipient) throw new ApiError(404, 'Active patient or doctor recipient not found');
  const [item] = await notificationService.notifyUsers([recipient._id], {
    title,
    message,
    type: 'announcement',
    metadata: { source: 'admin-dashboard' }
  });
  await AuditLog.create({ actor: actor._id, action: 'admin.notification_sent', resourceType: 'Notification', resourceId: item._id });
  return {
    id: item._id,
    recipient: { id: recipient._id, role: recipient.role },
    title: item.title,
    message: item.message,
    type: item.type,
    readAt: item.readAt || null,
    createdAt: item.createdAt
  };
}

async function createHospital(body, actor) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Request body must be an object');
  const allowed = new Set(['name', 'registrationNumber', 'facilityType', 'village', 'mandal', 'district', 'address', 'phone', 'managerPhone', 'postalCode', 'coordinates', 'workingHours', 'beds', 'services', 'managerName', 'managerEmail']);
  const unknown = Object.keys(body).find(key => !allowed.has(key));
  if (unknown) throw new ApiError(400, `Unsupported hospital field: ${unknown}`);
  const requiredText = (key, maxLength) => {
    const value = typeof body[key] === 'string' ? body[key].trim() : '';
    if (!value || value.length > maxLength) throw new ApiError(400, `Enter a valid ${key}`);
    return value;
  };
  const name = requiredText('name', 180);
  const village = requiredText('village', 120);
  const managerName = requiredText('managerName', 120);
  const managerEmail = requiredText('managerEmail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)) throw new ApiError(400, 'Enter a valid manager email address');
  const managerPhone = requiredText('managerPhone', 30);
  if (!/^\+?[0-9\s()-]{8,20}$/.test(managerPhone)) throw new ApiError(400, 'Enter a valid manager mobile number');
  if (await User.exists({ email: managerEmail })) throw new ApiError(409, 'An account with the manager email already exists');
  const strings = ['registrationNumber', 'facilityType', 'mandal', 'district', 'address', 'phone', 'postalCode', 'workingHours'];
  const hospitalData = { name, village, hospitalId: `AD-HOSP-${crypto.randomBytes(4).toString('hex').toUpperCase()}` };
  if (body.phone === undefined) hospitalData.phone = managerPhone;
  for (const field of strings) {
    const value = body[field];
    if (value !== undefined) {
      if (typeof value !== 'string' || value.trim().length > ({ registrationNumber: 100, facilityType: 100, mandal: 120, district: 120, address: 500, phone: 30, postalCode: 6, workingHours: 500 }[field])) {
        throw new ApiError(400, `Enter a valid ${field}`);
      }
      hospitalData[field] = value.trim();
    }
  }
  if (hospitalData.postalCode && !/^\d{6}$/.test(hospitalData.postalCode)) throw new ApiError(400, 'Postal code must contain six digits');
  if (body.coordinates !== undefined) {
    const { latitude, longitude } = body.coordinates || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new ApiError(400, 'Provide valid hospital latitude and longitude');
    }
    hospitalData.coordinates = { latitude, longitude };
  }
  if (body.beds !== undefined && (!Number.isInteger(body.beds) || body.beds < 0 || body.beds > 100000)) throw new ApiError(400, 'Beds must be a non-negative whole number');
  if (body.beds !== undefined) hospitalData.beds = body.beds;
  if (body.services !== undefined && (!Array.isArray(body.services) || body.services.length > 30 || body.services.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 100))) {
    throw new ApiError(400, 'Provide up to 30 valid hospital services');
  }
  if (body.services) hospitalData.services = [...new Set(body.services.map(item => item.trim()))];

  const initialPassword = crypto.randomBytes(18).toString('hex').toLowerCase();
  const managerStaffId = `AD-HM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  let hospital;
  let manager;
  try {
    hospital = await Hospital.create(hospitalData);
    manager = await User.create({
      name: managerName, email: managerEmail, phone: managerPhone, staffId: managerStaffId,
      passwordHash: await bcrypt.hash(initialPassword, 12), role: 'hospital', hospital: hospital._id,
      approvalStatus: 'approved', isActive: true, mustChangePassword: true
    });
    await AuditLog.create({ actor: actor._id, action: 'admin.hospital_created', resourceType: 'Hospital', resourceId: hospital._id, metadata: { hospitalId: hospital.hospitalId } });
    await AuditLog.create({ actor: actor._id, action: 'admin.hospital_manager_created', resourceType: 'User', resourceId: manager._id, metadata: { hospital: hospital._id } });
  } catch (error) {
    if (manager) await User.deleteOne({ _id: manager._id });
    if (hospital) await Hospital.deleteOne({ _id: hospital._id });
    if (error?.code === 11000) throw new ApiError(409, 'A hospital ID, manager email, or staff ID already exists');
    throw error;
  }
  return { hospital: hospital.toObject(), manager: safeUser(manager), initialPassword };
}

async function doctors(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  const filter = { role: 'doctor' };
  if (query.status && query.status !== 'all') {
    if (!['pending', 'approved', 'rejected'].includes(query.status)) throw new ApiError(400, 'Invalid doctor approval status');
    filter.approvalStatus = query.status;
  }
  if (query.active !== undefined) {
    if (typeof query.active !== 'string' || !['true', 'false'].includes(query.active)) throw new ApiError(400, 'active must be true or false');
    filter.isActive = query.active === 'true';
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('name email phone staffId district role approvalStatus isActive createdAt').lean(),
    User.countDocuments(filter)
  ]);
  return { items: users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function createDoctor(body, actor) {
  const allowed = new Set(['name', 'email', 'password', 'phone', 'staffId', 'district', 'language']);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Request body must be an object');
  const unsupported = Object.keys(body).find(key => !allowed.has(key));
  if (unsupported) throw new ApiError(400, `Unsupported doctor account field: ${unsupported}`);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError(400, 'Enter a name and a valid email address');
  }
  validatePassword(body.password);
  const language = body.language || 'en';
  if (!supportedLanguages.includes(language)) throw new ApiError(400, 'Choose English, Telugu, or Hindi');
  for (const field of ['phone', 'district']) {
    if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].trim().length > (field === 'phone' ? 30 : 120))) {
      throw new ApiError(400, `Enter a valid ${field}`);
    }
  }
  const staffId = typeof body.staffId === 'string' && body.staffId.trim()
    ? body.staffId.trim().toUpperCase()
    : `AD-DOC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  if (!/^[A-Z0-9][A-Z0-9._/-]{1,39}$/.test(staffId)) throw new ApiError(400, 'Staff ID must be 2–40 letters, numbers, or . _ / - characters');
  try {
    const user = await User.create({
      name, email, staffId, passwordHash: await bcrypt.hash(body.password, 12), role: 'doctor',
      phone: body.phone?.trim(), district: body.district?.trim(), language,
      approvalStatus: 'pending', isActive: false
    });
    await AuditLog.create({ actor: actor._id, action: 'admin.doctor_created', resourceType: 'User', resourceId: user._id });
    return { ...safeUser(user), approvalStatus: user.approvalStatus, isActive: user.isActive };
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(409, 'An account with this email or staff ID already exists');
    throw error;
  }
}

async function createStaff(body, actor) {
  const allowed = new Set(['name', 'email', 'password', 'phone', 'staffId', 'role', 'district', 'hospital', 'language']);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Request body must be an object');
  const unsupported = Object.keys(body).find(key => !allowed.has(key));
  if (unsupported) throw new ApiError(400, `Unsupported staff account field: ${unsupported}`);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body.role;
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ApiError(400, 'Enter a name and a valid email address');
  }
  if (!provisionableStaffRoles.includes(role)) throw new ApiError(400, 'Choose a supported staff role');
  validatePassword(body.password);
  const language = body.language || 'en';
  if (!supportedLanguages.includes(language)) throw new ApiError(400, 'Choose English, Telugu, or Hindi');
  for (const field of ['phone', 'district']) {
    if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].trim().length > (field === 'phone' ? 30 : 120))) {
      throw new ApiError(400, `Enter a valid ${field}`);
    }
  }
  let district = body.district?.trim();
  let hospitalId;
  if (role === 'specialist') {
    if (typeof body.hospital !== 'string' || !mongoose.isValidObjectId(body.hospital)) throw new ApiError(400, 'Choose a valid assigned hospital for this specialist');
    const hospital = await Hospital.findOne({ _id: body.hospital, isActive: true }).select('_id district').lean();
    if (!hospital) throw new ApiError(400, 'Choose an active hospital');
    hospitalId = hospital._id;
    if (!district && hospital.district) district = hospital.district;
  } else if (body.hospital !== undefined && body.hospital !== '') {
    throw new ApiError(400, 'Only specialist accounts can be assigned to a hospital here');
  }
  if (role === 'district' && !district) throw new ApiError(400, 'A district assignment is required for district staff');
  if (body.staffId !== undefined && body.staffId !== '' && (typeof body.staffId !== 'string' || !/^[A-Z0-9][A-Z0-9._/-]{1,39}$/i.test(body.staffId.trim()))) {
    throw new ApiError(400, 'Staff ID must be 2–40 letters, numbers, or . _ / - characters');
  }
  const staffId = typeof body.staffId === 'string' && body.staffId.trim()
    ? body.staffId.trim().toUpperCase()
    : `AD-${role.toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  try {
    const user = await User.create({
      name, email, staffId, passwordHash: await bcrypt.hash(body.password, 12), role,
      phone: body.phone?.trim(), district, hospital: hospitalId, language,
      approvalStatus: 'approved', isActive: true
    });
    await AuditLog.create({ actor: actor._id, action: 'admin.staff_created', resourceType: 'User', resourceId: user._id });
    return { ...safeUser(user), approvalStatus: user.approvalStatus, isActive: user.isActive };
  } catch (error) {
    if (error?.code === 11000) throw new ApiError(409, 'An account with this email or staff ID already exists');
    throw error;
  }
}

async function setDoctorDecision(doctorId, decision, actor) {
  if (!mongoose.isValidObjectId(doctorId)) throw new ApiError(400, 'Invalid doctor ID');
  const approved = decision === 'approve';
  const doctor = await User.findOneAndUpdate(
    { _id: doctorId, role: 'doctor' },
    { $set: { approvalStatus: approved ? 'approved' : 'rejected', isActive: approved }, $inc: { authVersion: 1 } },
    { new: true, runValidators: true }
  );
  if (!doctor) throw new ApiError(404, 'Doctor account not found');
  await AuditLog.create({ actor: actor._id, action: `admin.doctor_${approved ? 'approved' : 'rejected'}`, resourceType: 'User', resourceId: doctor._id });
  return { ...safeUser(doctor), approvalStatus: doctor.approvalStatus, isActive: doctor.isActive };
}

async function patients(query = {}) {
  const { page, limit, skip } = pageOptions(query);
  const filter = {};
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.length > 100) throw new ApiError(400, 'Search query must be at most 100 characters');
    if (query.q.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: new RegExp(escaped, 'i') }, { patientId: new RegExp(escaped, 'i') }, { email: new RegExp(escaped, 'i') }];
    }
  }
  const [items, total] = await Promise.all([
    Patient.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit)
      .populate('assignedDoctor', 'name approvalStatus isActive')
      .select('patientId name village district status updatedAt assignedDoctor').lean(),
    Patient.countDocuments(filter)
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

async function assignPatient(patientId, doctorId, actor) {
  if (!mongoose.isValidObjectId(patientId)) throw new ApiError(400, 'Invalid patient ID');
  if (doctorId !== null && (typeof doctorId !== 'string' || !mongoose.isValidObjectId(doctorId))) {
    throw new ApiError(400, 'Choose a valid doctor or null to unassign');
  }
  const patient = await Patient.findById(patientId);
  if (!patient) throw new ApiError(404, 'Patient record not found');
  if (doctorId) {
    const doctor = await User.findOne({ _id: doctorId, role: 'doctor', approvalStatus: 'approved', isActive: true }).select('_id').lean();
    if (!doctor) throw new ApiError(400, 'Choose an active, approved doctor');
    patient.assignedDoctor = doctor._id;
  } else {
    patient.set('assignedDoctor', undefined);
  }
  await patient.save();
  await AuditLog.create({ actor: actor._id, action: 'admin.patient_doctor_assignment_updated', resourceType: 'Patient', resourceId: patient._id, metadata: { doctorId: doctorId || null } });
  return { id: patient._id, assignedDoctor: patient.assignedDoctor || null };
}

module.exports = {
  dashboard, activity, hospitals, hospitalManagers, adminAccounts, createAdminAccount, referrals,
  adminNotificationRecipients, adminNotifications, createAdminNotification,
  createHospital, doctors, createDoctor, createStaff, setDoctorDecision, patients, assignPatient
};
