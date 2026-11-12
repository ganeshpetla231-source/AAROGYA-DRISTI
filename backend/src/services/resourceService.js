const mongoose = require('mongoose');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const models = require('../models');
const { AuditLog } = models;
const notifications = require('./notificationService');
const { doctorPatientIds: assignedDoctorPatientIds } = require('./doctorAssignmentService');

const searchFields = {
  users: ['name', 'email', 'phone', 'staffId'], patients: ['name', 'patientId', 'village', 'district', 'phone'],
  medicalHistory: ['title', 'notes', 'recordType'], screenings: ['category', 'notes'], appointments: ['type', 'status'],
  hospitals: ['name', 'village', 'district', 'facilityType'], referrals: ['reason', 'status'], notifications: ['title', 'message', 'type']
};
const filterFields = {
  users: ['role', 'isActive'], patients: ['status', 'district', 'village', 'gender'], medicalHistory: ['patient', 'recordType'],
  screenings: ['patient', 'status', 'category'], appointments: ['patient', 'provider', 'status'], hospitals: ['district', 'facilityType', 'isActive'],
  referrals: ['patient', 'hospital', 'status'], notifications: ['user', 'patient', 'type']
};
const references = {
  patients: { user: 'User', assignedWorker: 'User' }, medicalHistory: { patient: 'Patient', author: 'User' },
  screenings: { patient: 'Patient', screenedBy: 'User' }, appointments: { patient: 'Patient', provider: 'User', hospital: 'Hospital' },
  referrals: { patient: 'Patient', hospital: 'Hospital', fromProvider: 'User' }, notifications: { user: 'User', patient: 'Patient' }
};
const writableFields = {
  users: ['name', 'email', 'phone', 'staffId', 'hospital', 'district', 'language', 'isActive'],
  patients: ['patientId', 'name', 'email', 'phone', 'village', 'district', 'mandal', 'primaryHospital', 'dateOfBirth', 'gender', 'status', 'assignedWorker', 'consentGiven', 'user', 'referralHospital', 'referralStatus', 'referralUpdatedAt', 'clientRequestId'],
  medicalHistory: ['patient', 'author', 'recordType', 'title', 'notes', 'recordedAt'],
  appointments: ['patient', 'provider', 'hospital', 'availability', 'scheduledAt', 'type', 'visitMode', 'status', 'notes', 'rescheduledFrom'],
  hospitals: ['registrationNumber', 'facilityType', 'village', 'mandal', 'district', 'address', 'phone', 'postalCode', 'coordinates', 'workingHours', 'beds', 'services', 'isActive'],
  referrals: ['patient', 'fromProvider', 'hospital', 'reason', 'status', 'referredAt'],
  notifications: ['user', 'patient', 'title', 'message', 'type', 'metadata', 'readAt']
};
const staffPatientFields = ['patientId', 'name', 'email', 'phone', 'village', 'district', 'mandal', 'status', 'consentGiven', 'clientRequestId'];
function assertFields(data, allowed) {
  const unknown = Object.keys(data).filter(key => !allowed.includes(key));
  if (unknown.length) throw new ApiError(400, `Unsupported or protected field: ${unknown[0]}`);
}
function safeResult(resource, value, user) {
  const result = value?.toObject ? value.toObject() : { ...value };
  if (resource === 'users') for (const field of ['passwordHash', 'passwordResetHash', 'passwordResetExpires', 'authVersion', '__v']) delete result[field];
  if (resource === 'patients') for (const field of ['clientRequestId', 'clientRequestActor', 'clientRequestHash']) delete result[field];
  if (user?.role === 'hospital' && resource === 'patients') {
    for (const field of ['email', 'phone', 'dateOfBirth', 'gender', 'consentGiven', 'user', 'assignedWorker']) delete result[field];
  }
  if (user?.role === 'hospital' && resource === 'appointments') delete result.notes;
  if (user?.role === 'hospital' && resource === 'referrals') delete result.reason;
  return result;
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function normalizeStaffId(value) {
  if (typeof value !== 'string' || !/^[A-Z0-9][A-Z0-9._/-]{1,39}$/i.test(value.trim())) throw new ApiError(400, 'Staff ID must be 2–40 letters, numbers, or . _ / - characters');
  return value.trim().toUpperCase();
}

async function validateReferences(resource, data) {
  for (const [field, modelName] of Object.entries(references[resource] || {})) {
    const id = data[field];
    if (!id) continue;
    if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${field} ID`);
    if (!await models[modelName].exists({ _id: id })) throw new ApiError(400, `Referenced ${field} record was not found`);
  }
}

function createResourceService({ model, resource, audit = true }) {
  async function ownerPatient(user) { return models.Patient.findOne({ user: user._id }).select('_id assignedWorker user').lean(); }
  async function doctorPatientIds(user) {
    return assignedDoctorPatientIds(user._id);
  }
  async function specialistPatientIds(user) {
    if (!user.hospital) return [];
    return (await models.Referral.find({ hospital: user.hospital }).distinct('patient')).map(String);
  }
  async function applyScope(filter, user) {
    if (!user) return filter;
    if (resource === 'notifications') filter.user = user._id;
    if (user.role === 'admin') return filter;
    if (resource === 'patients' && user.role === 'patient') filter.user = user._id;
    if (resource === 'patients' && user.role === 'asha') filter.assignedWorker = user._id;
    if (user.role === 'doctor') {
      if (resource === 'patients') filter._id = { $in: await doctorPatientIds(user) };
      if (['medicalHistory', 'screenings'].includes(resource)) filter.patient = { $in: await doctorPatientIds(user) };
      if (['appointments', 'referrals'].includes(resource)) {
        const patientIds = await doctorPatientIds(user);
        const ownership = resource === 'appointments'
          ? [{ provider: user._id }, { patient: { $in: patientIds } }]
          : [{ fromProvider: user._id }, { patient: { $in: patientIds } }];
        filter.$and = [...(filter.$and || []), { $or: ownership }];
      }
    }
    if (user.role === 'specialist') {
      if (resource === 'patients') filter._id = { $in: await specialistPatientIds(user) };
      if (['medicalHistory', 'screenings', 'referrals'].includes(resource)) filter.patient = { $in: await specialistPatientIds(user) };
      if (resource === 'hospitals') filter._id = user.hospital || new mongoose.Types.ObjectId('000000000000000000000000');
    }
    if (user.role === 'patient' && ['medicalHistory', 'screenings', 'appointments', 'referrals'].includes(resource)) {
      const patient = await ownerPatient(user);
      filter.patient = patient?._id || new mongoose.Types.ObjectId('000000000000000000000000');
    }
    if (user.role === 'asha' && ['screenings', 'medicalHistory', 'referrals'].includes(resource)) {
      const patientIds = await models.Patient.find({ assignedWorker: user._id }).distinct('_id');
      filter.patient = { $in: patientIds };
    }
    if (user.role === 'district' && user.district) {
      if (resource === 'patients' || resource === 'hospitals') filter.district = user.district;
      if (['medicalHistory', 'screenings', 'appointments', 'referrals'].includes(resource)) {
        const patientIds = await models.Patient.find({ district: user.district }).distinct('_id');
        filter.patient = { $in: patientIds };
      }
    }
    if (user.role === 'hospital') {
      if (resource === 'hospitals') filter._id = user.hospital || new mongoose.Types.ObjectId('000000000000000000000000');
      if (['appointments', 'referrals'].includes(resource)) filter.hospital = user.hospital || new mongoose.Types.ObjectId('000000000000000000000000');
      if (['patients', 'screenings'].includes(resource)) {
        const linked = await Promise.all([
          models.Appointment.find({ hospital: user.hospital }).distinct('patient'),
          models.Referral.find({ hospital: user.hospital }).distinct('patient')
        ]);
        const patientIds = [...new Set(linked.flat().map(String))];
        filter[resource === 'patients' ? '_id' : 'patient'] = { $in: patientIds };
      }
    }
    return filter;
  }
  async function assertOwnership(item, user) {
    if (!user) return;
    if (resource === 'notifications' && String(item.user) !== String(user._id)) throw new ApiError(403, 'You can only access your own notifications');
    if (user.role === 'admin') return;
    if (user.role === 'asha' && item.patient) {
      const patient = await models.Patient.findById(item.patient).select('assignedWorker').lean();
      if (!patient || String(patient.assignedWorker || '') !== String(user._id)) throw new ApiError(403, 'This record is outside your assigned community');
    }
    if (resource === 'patients' && user.role === 'patient' && String(item.user) !== String(user._id)) throw new ApiError(403, 'You can only access your own patient record');
    if (resource === 'patients' && user.role === 'asha' && String(item.assignedWorker) !== String(user._id)) throw new ApiError(403, 'This patient is outside your assigned community');
    if (user.role === 'doctor') {
      const patientId = resource === 'patients' ? item._id : item.patient;
      if (patientId && !(await doctorPatientIds(user)).includes(String(patientId))) throw new ApiError(403, 'This patient is outside your care relationship');
    }
    if (user.role === 'specialist') {
      const patientId = resource === 'patients' ? item._id : item.patient;
      if (patientId && !(await specialistPatientIds(user)).includes(String(patientId))) throw new ApiError(403, 'This patient has not been referred to your facility');
      if (resource === 'hospitals' && String(item._id) !== String(user.hospital || '')) throw new ApiError(403, 'This facility is outside your assignment');
    }
    if (user.role === 'hospital') {
      if (resource === 'hospitals' && String(item._id) !== String(user.hospital)) throw new ApiError(403, 'This facility is outside your assigned hospital');
      if (['appointments', 'referrals'].includes(resource) && String(item.hospital) !== String(user.hospital)) throw new ApiError(403, 'This record is outside your assigned hospital');
      if (resource === 'patients' || item.patient) {
        const patientId = resource === 'patients' ? item._id : item.patient;
        const linked = await Promise.all([models.Appointment.exists({ patient: patientId, hospital: user.hospital }), models.Referral.exists({ patient: patientId, hospital: user.hospital })]);
        if (!linked.some(Boolean)) throw new ApiError(403, 'This patient is outside your assigned hospital');
      }
    }
    if (user.role === 'district') {
      if (['patients', 'hospitals'].includes(resource) && item.district !== user.district) throw new ApiError(403, 'This record is outside your assigned district');
      if (item.patient) {
        const patient = await models.Patient.findById(item.patient).select('district').lean();
        if (!patient || patient.district !== user.district) throw new ApiError(403, 'This record is outside your assigned district');
      }
    }
    if (user.role === 'patient' && item.patient) {
      const patient = await models.Patient.findById(item.patient).select('user').lean();
      if (!patient || String(patient.user) !== String(user._id)) throw new ApiError(403, 'You can only access records linked to your patient account');
    }
  }
  return {
    async list(query = {}, user) {
      for (const key of ['page', 'limit']) if (query[key] !== undefined && (typeof query[key] !== 'string' || !/^\d{1,7}$/.test(query[key]))) throw new ApiError(400, `${key} must be a positive integer`);
      const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
      const filter = {};
      for (const key of filterFields[resource] || []) {
        if (query[key] !== undefined) {
          if (typeof query[key] !== 'string' || query[key].length > 160) throw new ApiError(400, `Invalid ${key} filter`);
          if (['isActive', 'granted'].includes(key) && !['true', 'false'].includes(query[key])) throw new ApiError(400, `${key} must be true or false`);
          const allowedValues = model.schema.path(key)?.enumValues;
          if (allowedValues?.length && !allowedValues.includes(query[key])) throw new ApiError(400, `Invalid ${key} filter`);
          filter[key] = ['isActive', 'granted'].includes(key) ? query[key] === 'true' : query[key];
        }
      }
      if (query.q !== undefined && typeof query.q !== 'string') throw new ApiError(400, 'Search query must be text');
      if (query.q !== undefined && query.q.length > 100) throw new ApiError(400, 'Search query must be at most 100 characters');
      if (query.q && searchFields[resource]?.length) {
        const expression = new RegExp(escapeRegex(String(query.q).trim().slice(0, 100)), 'i');
        filter.$or = searchFields[resource].map((field) => ({ [field]: expression }));
      }
      await applyScope(filter, user);
      let itemsQuery = model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
      if (resource === 'patients' && user?.role === 'hospital') {
        itemsQuery = itemsQuery.select('patientId name village district status updatedAt assignedDoctor');
      }
      const [items, total] = await Promise.all([
        itemsQuery.lean(),
        model.countDocuments(filter)
      ]);
      return { items: items.map(item => safeResult(resource, item, user)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
    },
    async get(id, user) {
      if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid record ID');
      let itemQuery = model.findById(id);
      if (resource === 'patients' && user?.role === 'hospital') {
        itemQuery = itemQuery.select('patientId name village district status updatedAt assignedDoctor');
      }
      const item = await itemQuery.lean();
      if (!item) throw new ApiError(404, `${resource} record not found`);
      await assertOwnership(item, user);
      return safeResult(resource, item, user);
    },
    async create(data, actor) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError(400, 'Request body must be an object');
      data = { ...data };
      assertFields(data, writableFields[resource] || []);
      if (resource === 'hospitals') throw new ApiError(403, 'Create a hospital and its manager through the administrator provisioning workflow');
      if (resource === 'screenings') throw new ApiError(400, 'Create screenings through the image analysis workflow');
      if (resource === 'appointments' && actor?.role !== 'admin') throw new ApiError(403, 'Book appointments through the availability workflow');
      if (resource === 'patients' && actor?.role === 'admin') assertFields(data, staffPatientFields);
      if (resource === 'patients' && actor?.role !== 'admin') {
        assertFields(data, staffPatientFields);
        if (actor?.role === 'asha') data.assignedWorker = actor._id;
      }
      if (resource === 'medicalHistory') {
        if (actor?.role !== 'admin') { assertFields(data, ['patient', 'recordType', 'title', 'notes']); data.author = actor?._id; data.recordedAt = new Date(); }
      }
      if (resource === 'referrals' && actor?.role !== 'admin') { assertFields(data, ['patient', 'hospital', 'reason']); data.fromProvider = actor?._id; }
      if (resource === 'notifications' && actor?.role !== 'admin') throw new ApiError(403, 'Notifications are created by the application workflows');
      if (resource === 'users') {
        throw new ApiError(403, 'Create accounts through the administrator provisioning workflows');
      }
      if (actor?.role === 'doctor' && data.patient !== undefined && ['medicalHistory', 'screenings', 'appointments', 'referrals'].includes(resource) && !(await doctorPatientIds(actor)).includes(String(data.patient))) {
        throw new ApiError(403, 'This patient is outside your care relationship');
      }
      if (actor?.role === 'specialist' && data.patient !== undefined && ['medicalHistory', 'referrals'].includes(resource) && !(await specialistPatientIds(actor)).includes(String(data.patient))) throw new ApiError(403, 'This patient has not been referred to your facility');
      if (resource === 'patients' && actor?.role === 'patient') throw new ApiError(403, 'Use patient registration to create a patient account');
      if (actor?.role === 'patient' && data.patient) {
        const patient = await ownerPatient(actor);
        if (!patient || String(patient._id) !== String(data.patient)) throw new ApiError(403, 'You can only create records for your own patient account');
      }
      if (actor?.role === 'doctor' && resource === 'medicalHistory' && data.patient && !(await doctorPatientIds(actor)).includes(String(data.patient))) throw new ApiError(403, 'This patient is outside your care relationship');
      let patientIdempotency;
      if (resource === 'patients' && data.consentGiven === true && data.clientRequestId === undefined) throw new ApiError(400, 'Patient consent must be recorded with a client request ID');
      if (resource === 'patients' && data.clientRequestId !== undefined) {
        if (typeof data.clientRequestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.clientRequestId)) throw new ApiError(400, 'A valid client request ID is required');
        if (data.consentGiven !== true) throw new ApiError(400, 'Patient consent is required before synchronizing an offline registration');
        const requestData = { ...data };
        delete requestData.clientRequestId;
        const requestHash = crypto.createHash('sha256').update(JSON.stringify(requestData)).digest('hex');
        const existing = await model.findOne({ clientRequestActor: actor._id, clientRequestId: data.clientRequestId }).select('+clientRequestHash').lean();
        if (existing) {
          if (existing.clientRequestHash !== requestHash) throw new ApiError(409, 'This request ID was already used with different registration details');
          return safeResult(resource, existing, actor);
        }
        patientIdempotency = { clientRequestId: data.clientRequestId, clientRequestActor: actor._id, clientRequestHash: requestHash };
        delete data.clientRequestId;
      }
      await validateReferences(resource, data);
      let item;
      try { item = await model.create({ ...data, ...patientIdempotency }); }
      catch (error) {
        if (error?.code === 11000) throw new ApiError(409, resource === 'patients' ? 'A patient with this ID or request ID already exists' : 'A record with this unique value already exists');
        throw error;
      }
      if (audit) await AuditLog.create({ actor: actor?._id, action: 'created', resourceType: resource, resourceId: item._id });
      if (resource === 'appointments') await notifications.notifyAppointment(item.toObject(), { title: 'Appointment created', message: 'An appointment was added to your care schedule.', type: 'appointment', metadata: { appointmentId: String(item._id) } });
      return safeResult(resource, item, actor);
    },
    async update(id, data, actor) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError(400, 'Request body must be an object');
      if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid record ID');
      if (!Object.keys(data).length) throw new ApiError(400, 'Provide at least one field to update');
      if (resource === 'screenings' && ['patient', 'screenedBy', 'category', 'status', 'aiResult', 'doctorAssessment', 'imageStorageKey', 'imageMimeType', 'imageSha256', 'demonstration'].some(field => data[field] !== undefined)) throw new ApiError(400, 'Screening results can only be changed through the image analysis and doctor review workflows');
      const existing = await model.findById(id).lean();
      if (!existing) throw new ApiError(404, `${resource} record not found`);
      await assertOwnership(existing, actor);
      data = { ...data };
      if (resource === 'users' && data.role !== undefined) throw new ApiError(403, 'Account roles cannot be changed through the generic user API');
      assertFields(data, writableFields[resource] || []);
      if (resource === 'patients' && actor?.role === 'admin') assertFields(data, ['name', 'email', 'phone', 'village', 'district', 'mandal', 'status']);
      if (resource === 'patients' && actor?.role !== 'admin') {
        const allowed = actor?.role === 'patient' ? ['phone', 'village', 'district'] : actor?.role === 'asha' ? ['name', 'email', 'phone', 'village', 'district', 'mandal', 'status'] : ['name', 'phone', 'status'];
        assertFields(data, allowed);
      }
      if (resource === 'medicalHistory' && actor?.role !== 'admin') assertFields(data, ['recordType', 'title', 'notes', 'recordedAt']);
      if (resource === 'referrals' && actor?.role !== 'admin') {
        const allowed = actor?.role === 'hospital' ? ['status'] : ['status', 'reason', 'hospital'];
        assertFields(data, allowed);
      }
      if (resource === 'appointments' && actor?.role !== 'admin') throw new ApiError(403, 'Update appointments through the appointment workflow');
      if (resource === 'notifications' && actor?.role !== 'admin') throw new ApiError(403, 'Use the notification read endpoints');
      if (resource === 'patients' && actor?.role === 'patient') {
        const allowed = new Set(['phone', 'village', 'district']);
        if (Object.keys(data).some(key => !allowed.has(key))) throw new ApiError(403, 'Patients can only update their contact and community fields');
      }
      if (resource === 'users') {
        if (data.staffId !== undefined) data.staffId = normalizeStaffId(data.staffId);
        for (const field of ['passwordHash', 'passwordResetHash', 'passwordResetExpires', 'authVersion']) if (data[field] !== undefined) throw new ApiError(400, `Update ${field} through the authentication API`);
        if (data.isActive !== undefined) data.authVersion = (existing.authVersion || 0) + 1;
      }
      await validateReferences(resource, data);
      const item = await model.findByIdAndUpdate(id, data, { new: true, runValidators: true });
      if (!item) throw new ApiError(404, `${resource} record not found`);
      if (resource === 'referrals' && (data.status !== undefined || data.hospital !== undefined)) {
        const latest = await models.Referral.findOne({ patient: item.patient }).sort({ referredAt: -1, createdAt: -1 }).lean();
        if (latest) await models.Patient.updateOne({ _id: item.patient }, { $set: { status: latest.status === 'Needs review' ? 'Referred' : latest.status === 'In progress' ? 'Follow-up' : latest.status === 'Completed' ? 'Reviewed' : 'Screened', referralHospital: latest.hospital, referralStatus: latest.status, referralUpdatedAt: latest.referredAt } });
        else await models.Patient.updateOne({ _id: item.patient }, { $unset: { referralHospital: 1, referralStatus: 1, referralUpdatedAt: 1 } });
        await notifications.notifyPatient(item.patient, { title: 'Referral status updated', message: `Your referral status is now ${item.status}.`, type: 'referral', metadata: { referralId: String(item._id), status: item.status } }, [item.fromProvider]);
      }
      if (resource === 'appointments' && data.status !== undefined) await notifications.notifyAppointment(item.toObject(), { title: 'Appointment status updated', message: `Your appointment status is now ${item.status}.`, type: 'appointment', metadata: { appointmentId: String(item._id), status: item.status } });
      if (audit) await AuditLog.create({ actor: actor?._id, action: 'updated', resourceType: resource, resourceId: item._id });
      return safeResult(resource, item, actor);
    },
    async remove(id, actor) {
      if (resource === 'hospitals') throw new ApiError(403, 'Hospitals cannot be deleted; deactivate them through the administrator workflow');
      if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid record ID');
      const existing = await model.findById(id).lean();
      if (!existing) throw new ApiError(404, `${resource} record not found`);
      await assertOwnership(existing, actor);
      const item = await model.findByIdAndDelete(id);
      if (!item) throw new ApiError(404, `${resource} record not found`);
      if (audit) await AuditLog.create({ actor: actor?._id, action: 'deleted', resourceType: resource, resourceId: item._id });
      return { id: item._id };
    }
  };
}

module.exports = { createResourceService };
