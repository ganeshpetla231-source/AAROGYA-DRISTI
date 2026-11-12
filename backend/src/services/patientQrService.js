const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { User, Patient, PatientQR, Consent, AuditLog, Appointment, Referral } = require('../models');
const { canDoctorAccess } = require('./doctorAssignmentService');

const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const qrConsentPurpose = 'qr-scan';

async function patientForUser(user) {
  const patient = await Patient.findOne({ user: user._id });
  if (!patient) throw new ApiError(404, 'Patient record not found');
  return patient;
}
async function issue(patient) {
  const now = new Date();
  await PatientQR.updateMany({ patient: patient._id, revokedAt: null }, { $set: { revokedAt: now } });
  const token = crypto.randomBytes(32).toString('base64url');
  const qr = await PatientQR.create({ patient: patient._id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 90 * 86400000) });
  return { token, qr };
}
function metadata(qr) { return { issuedAt: qr.createdAt, expiresAt: qr.expiresAt, active: !qr.revokedAt && (!qr.expiresAt || qr.expiresAt > new Date()) }; }
async function audit(actor, action, qr, outcome, role) {
  await AuditLog.create({ actor: actor._id, action: 'patient_qr.scan', resourceType: 'PatientQR', resourceId: qr?._id, metadata: { outcome, role }, occurredAt: new Date() });
}
async function scan(actor, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
    await audit(actor, 'scan', null, 'invalid_token', actor.role); throw new ApiError(404, 'QR token is invalid or revoked');
  }
  const qr = await PatientQR.findOne({ tokenHash: hash(token) });
  if (!qr) { await audit(actor, 'scan', null, 'invalid_token', actor.role); throw new ApiError(404, 'QR token is invalid or revoked'); }
  if (qr.revokedAt || (qr.expiresAt && qr.expiresAt <= new Date())) { await audit(actor, 'scan', qr, qr.revokedAt ? 'revoked' : 'expired', actor.role); throw new ApiError(410, 'This patient QR has expired or been revoked'); }
  if (!['asha', 'doctor'].includes(actor.role)) { await audit(actor, 'scan', qr, 'role_denied', actor.role); throw new ApiError(403, 'Your role cannot scan patient QR codes'); }
  const patient = await Patient.findById(qr.patient);
  if (!patient) { await audit(actor, 'scan', qr, 'patient_missing', actor.role); throw new ApiError(404, 'Patient record not found'); }
  let related = actor.role === 'asha'
    ? String(patient.assignedWorker || '') === String(actor._id)
    : await canDoctorAccess(patient, actor._id);
  if (!related) { await audit(actor, 'scan', qr, 'relationship_denied', actor.role); throw new ApiError(403, 'You are not assigned to this patient'); }
  const consent = await Consent.findOne({ patient: patient._id, purpose: qrConsentPurpose }).sort({ createdAt: -1, _id: -1 });
  if (!consent?.granted || consent.revokedAt) { await audit(actor, 'scan', qr, 'consent_denied', actor.role); throw new ApiError(403, 'The patient has not consented to QR lookup'); }
  await audit(actor, 'scan', qr, 'success', actor.role);
  const record = { patientId: patient.patientId, name: patient.name, village: patient.village, status: patient.status };
  if (actor.role === 'asha') return { patient: record };
  return { patient: { ...record, district: patient.district, gender: patient.gender, phone: patient.phone } };
}
async function history(user) {
  let filter = {};
  if (user.role === 'patient') {
    const patient = await patientForUser(user); const qrs = await PatientQR.find({ patient: patient._id }).select('_id'); filter.resourceId = { $in: qrs.map(q => q._id) };
  } else filter.actor = user._id;
  const logs = await AuditLog.find({ action: 'patient_qr.scan', ...filter }).sort({ occurredAt: -1 }).limit(100).populate('actor', 'name role');
  return logs.map(log => ({ id: log._id, at: log.occurredAt, outcome: log.metadata?.outcome || 'unknown', role: log.metadata?.role, scanner: log.actor?.name || 'Unknown' }));
}
async function consent(user) {
  const patient = await patientForUser(user);
  const latest = await Consent.findOne({ patient: patient._id, purpose: qrConsentPurpose }).sort({ createdAt: -1, _id: -1 });
  return { granted: Boolean(latest?.granted && !latest.revokedAt), updatedAt: latest?.updatedAt || latest?.createdAt || null };
}
async function setConsent(user, granted) {
  if (typeof granted !== 'boolean') throw new ApiError(400, 'granted must be true or false');
  const patient = await patientForUser(user);
  await Consent.create({ patient: patient._id, grantedBy: user._id, purpose: qrConsentPurpose, granted, grantedAt: granted ? new Date() : undefined, revokedAt: granted ? undefined : new Date() });
  return consent(user);
}
async function patientQr(user) {
  const patient = await patientForUser(user);
  const qr = await PatientQR.findOne({ patient: patient._id, revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).sort({ createdAt: -1 });
  return { patient: { patientId: patient.patientId, name: patient.name, village: patient.village }, qr: qr ? metadata(qr) : null };
}
async function revoke(user) { const patient = await patientForUser(user); const result = await PatientQR.updateMany({ patient: patient._id, revokedAt: null }, { $set: { revokedAt: new Date() } }); return { revoked: result.modifiedCount }; }
module.exports = { issue, patientQr, patientForUser, scan, history, consent, setConsent, revoke, qrConsentPurpose };
