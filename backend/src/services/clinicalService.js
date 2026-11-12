const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const models = require('../models');

const { Patient, Appointment, Referral, OralScreening, MedicalRecord, Prescription, ClinicalDocument, Hospital, AuditLog, VoiceTranscript, User } = models;
const notifications = require('./notificationService');
const { hasValidSignature } = require('../utils/fileSignatures');
const fileStorage = require('./fileStorageService');
const { canDoctorAccess, doctorPatientIds } = require('./doctorAssignmentService');
const categories = ['possible-ulcer', 'possible-thrush', 'possible-gingivitis', 'other-abnormality', 'insufficient-quality', 'no-visible-abnormality'];
const clean = value => String(value || '').trim();
const encryptionKey = () => {
  const value = process.env.SCREENING_IMAGE_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32)) throw new Error('Set SCREENING_IMAGE_ENCRYPTION_KEY to at least 32 characters');
  return crypto.createHash('sha256').update(value || 'local-development-screening-image-key-only').digest();
};
function encrypt(bytes) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from('ADIMG1'), iv, cipher.getAuthTag(), ciphertext]);
}
function decrypt(bytes) {
  if (bytes.toString('ascii', 0, 6) !== 'ADIMG1') throw new Error('Stored report is invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(6, 18));
  decipher.setAuthTag(bytes.subarray(18, 34)); return Buffer.concat([decipher.update(bytes.subarray(34)), decipher.final()]);
}
async function resolvePatient(key) {
  const patient = mongoose.isValidObjectId(key) ? await Patient.findById(key) : await Patient.findOne({ patientId: String(key).trim() });
  if (!patient) throw new ApiError(404, 'Patient record not found');
  return patient;
}
async function assertDoctorAccess(patient, user) {
  if (user.role !== 'doctor') throw new ApiError(403, 'Doctor workspace access required');
  const related = await canDoctorAccess(patient, user._id);
  if (!related) throw new ApiError(403, 'This patient is outside your care relationship');
}
async function queue(user, query = {}) {
  if (user.role !== 'doctor') throw new ApiError(403, 'Doctor workspace access required');
  const patientIds = await doctorPatientIds(user._id);
  const filter = { _id: { $in: patientIds } };
  const q = clean(query.q).slice(0, 100);
  if (q) { const pattern = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ name: new RegExp(pattern, 'i') }, { patientId: new RegExp(pattern, 'i') }, { village: new RegExp(pattern, 'i') }]; }
  if (query.status && query.status !== 'All') filter.status = query.status;
  const items = await Patient.find(filter).sort({ updatedAt: -1 }).limit(100).select('patientId name village district phone status gender dateOfBirth updatedAt').lean();
  const ids = items.map(item => item._id);
  const [screenings, appointments, referrals] = await Promise.all([
    OralScreening.find({ patient: { $in: ids }, 'aiResult.suspicious': true, $or: [{ doctorAssessment: null }, { 'doctorAssessment.reviewedAt': { $exists: false } }] }).distinct('patient'),
    Appointment.find({ patient: { $in: ids }, status: { $in: ['Upcoming', 'Confirmed'] } }).distinct('patient'),
    Referral.find({ patient: { $in: ids }, fromProvider: user._id, status: { $nin: ['Completed', 'Cancelled'] } }).distinct('patient')
  ]);
  const needsReview = new Set([...screenings, ...appointments, ...referrals].map(String));
  return { items: items.map(item => ({ ...item, needsReview: needsReview.has(String(item._id)) })), total: items.length };
}
async function detail(key, user) {
  const patient = await resolvePatient(key); await assertDoctorAccess(patient, user);
  const [screenings, history, prescriptions, appointments, referrals, documents, transcripts, hospitals] = await Promise.all([
    OralScreening.find({ patient: patient._id }).select('+imageStorageKey +imageMimeType').sort({ screenedAt: -1 })
      .populate('screenedBy', 'name role')
      .populate('doctorAssessment.reviewedBy', 'name')
      .populate('doctorAssessment.referralHospital', 'name village district')
      .populate('reviews.reviewedBy', 'name')
      .populate('reviews.referralHospital', 'name village district')
      .populate('reviews.referral', 'hospital reason status')
      .lean(),
    MedicalRecord.find({ patient: patient._id }).sort({ recordedAt: -1 }).populate('author', 'name role').lean(),
    Prescription.find({ patient: patient._id }).sort({ createdAt: -1 }).populate('prescribedBy', 'name').lean(),
    Appointment.find({ patient: patient._id }).sort({ scheduledAt: -1 }).populate('hospital', 'name village').lean(),
    Referral.find({ patient: patient._id }).sort({ referredAt: -1 }).populate('hospital', 'name village').populate('fromProvider', 'name').populate('screening', 'category screenedAt').lean(),
    ClinicalDocument.find({ patient: patient._id }).sort({ recordedAt: -1 }).populate('uploadedBy', 'name').lean(),
    VoiceTranscript.find({ patient: patient._id }).sort({ createdAt: -1 }).limit(30).populate('createdBy', 'name').populate('review.reviewedBy', 'name').lean(),
    Hospital.find({ isActive: true }).sort({ name: 1 }).select('name village district facilityType').lean()
  ]);
  const safeScreenings = screenings.map(item => { delete item.imageStorageKey; delete item.imageMimeType; delete item.imageSha256; return item; });
  const safePatient = patient.toObject(); delete safePatient.user; delete safePatient.assignedWorker; delete safePatient.assignedDoctor; delete safePatient.consentGiven;
  return { patient: safePatient, screenings: safeScreenings, medicalHistory: history, prescriptions, appointments, referrals, documents, transcripts, hospitals };
}
async function createNote(key, body, user) {
  const patient = await resolvePatient(key); await assertDoctorAccess(patient, user);
  const allowedTypes = ['assessment', 'treatment', 'follow-up', 'note'];
  const recordType = body.recordType;
  const title = clean(body.title), notes = clean(body.notes);
  if (!allowedTypes.includes(recordType)) throw new ApiError(400, 'Choose assessment, treatment, follow-up, or note');
  if (!title || title.length > 160) throw new ApiError(400, 'Enter a title up to 160 characters');
  if (!notes || notes.length > 5000) throw new ApiError(400, 'Enter clinical notes up to 5,000 characters');
  const item = await MedicalRecord.create({ patient: patient._id, author: user._id, recordType, title, notes, recordedAt: new Date() });
  await AuditLog.create({ actor: user._id, action: 'clinical.note_created', resourceType: 'MedicalRecord', resourceId: item._id, metadata: { recordType } });
  return item.toObject();
}
async function prescribe(key, body, user) {
  const patient = await resolvePatient(key); await assertDoctorAccess(patient, user);
  const medication = clean(body.medication), instructions = clean(body.instructions);
  if (!medication || medication.length > 160) throw new ApiError(400, 'Enter a medication name up to 160 characters');
  if (!instructions || instructions.length > 1000) throw new ApiError(400, 'Enter prescription instructions up to 1,000 characters');
  const startDate = body.startDate ? new Date(body.startDate) : undefined, endDate = body.endDate ? new Date(body.endDate) : undefined;
  if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime())) || (startDate && endDate && endDate < startDate)) throw new ApiError(400, 'Enter valid prescription dates');
  const item = await Prescription.create({ patient: patient._id, prescribedBy: user._id, medication, instructions, startDate, endDate });
  await AuditLog.create({ actor: user._id, action: 'clinical.prescription_created', resourceType: 'Prescription', resourceId: item._id });
  return item.toObject();
}
async function schedule(key, body, user) {
  const patient = await resolvePatient(key); await assertDoctorAccess(patient, user);
  const scheduledAt = new Date(body.scheduledAt);
  if (!body.scheduledAt || Number.isNaN(scheduledAt.getTime())) throw new ApiError(400, 'Choose a valid follow-up date and time');
  const item = await Appointment.create({ patient: patient._id, provider: user._id, hospital: body.hospital || undefined, type: clean(body.type) || 'Follow-up', notes: clean(body.notes).slice(0, 1500), scheduledAt, status: 'Upcoming' });
  await Patient.updateOne({ _id: patient._id }, { $set: { status: 'Follow-up' } });
  await AuditLog.create({ actor: user._id, action: 'clinical.followup_scheduled', resourceType: 'Appointment', resourceId: item._id });
  await notifications.notifyAppointment(item, { title: 'Follow-up scheduled', message: `A follow-up appointment was scheduled for ${scheduledAt.toLocaleString()}.`, type: 'follow-up', metadata: { appointmentId: String(item._id), scheduledAt } });
  return item.toObject();
}
async function updatePrescription(id, body, user) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid prescription ID');
  const item = await Prescription.findById(id);
  if (!item) throw new ApiError(404, 'Prescription not found');
  const patient = await Patient.findById(item.patient); await assertDoctorAccess(patient, user);
  if (body.status !== undefined) {
    if (!['Active', 'Stopped', 'Completed'].includes(body.status)) throw new ApiError(400, 'Choose Active, Stopped, or Completed');
    item.status = body.status;
  }
  if (body.instructions !== undefined) {
    const instructions = clean(body.instructions);
    if (!instructions || instructions.length > 1000) throw new ApiError(400, 'Enter instructions up to 1,000 characters');
    item.instructions = instructions;
  }
  if (body.endDate !== undefined) {
    const endDate = body.endDate ? new Date(body.endDate) : null;
    if (endDate && Number.isNaN(endDate.getTime())) throw new ApiError(400, 'Enter a valid prescription end date');
    item.endDate = endDate;
  }
  await item.save();
  await AuditLog.create({ actor: user._id, action: 'clinical.prescription_updated', resourceType: 'Prescription', resourceId: item._id });
  return item.toObject();
}
async function refer(key, body, user) {
  const patient = await resolvePatient(key); await assertDoctorAccess(patient, user);
  if (!mongoose.isValidObjectId(body.hospital) || !await Hospital.exists({ _id: body.hospital, isActive: true })) throw new ApiError(400, 'Choose an active referral facility');
  const reason = clean(body.reason);
  if (!reason || reason.length > 1500) throw new ApiError(400, 'Enter a referral recommendation up to 1,500 characters');
  const item = await Referral.create({ patient: patient._id, fromProvider: user._id, hospital: body.hospital, reason, status: 'Needs review' });
  await Patient.updateOne({ _id: patient._id }, { $set: { status: 'Referred', referralHospital: body.hospital, referralStatus: item.status, referralUpdatedAt: item.referredAt } });
  await AuditLog.create({ actor: user._id, action: 'clinical.referral_created', resourceType: 'Referral', resourceId: item._id });
  const facilityUsers = await User.find({ role: 'hospital', hospital: body.hospital, isActive: true }).distinct('_id');
  await notifications.notifyPatient(patient._id, { title: 'Referral recommendation added', message: 'Your doctor added a referral recommendation. Contact your care team for next steps.', type: 'referral', metadata: { referralId: String(item._id) } }, [user._id, ...facilityUsers]);
  return item.toObject();
}
async function uploadDocument(key, file, body, user) {
  const patient = await resolvePatient(key); await assertDoctorAccess(patient, user);
  if (!file) throw new ApiError(400, 'Choose a lab report file');
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, 'Lab report must be no larger than 10 MB');
  const types = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!types.includes(file.mimetype)) throw new ApiError(415, 'Upload a PDF, JPEG, or PNG lab report');
  if (!hasValidSignature(file.buffer, file.mimetype)) throw new ApiError(415, 'The uploaded report contents do not match its file type');
  const title = clean(body.title) || path.basename(file.originalname || 'Lab report').slice(0, 160);
  if (!title || title.length > 160) throw new ApiError(400, 'Enter a report title up to 160 characters');
  const storageKey = `${crypto.randomUUID()}.enc`;
  await fileStorage.put(storageKey, encrypt(file.buffer));
  try {
    const item = await ClinicalDocument.create({ patient: patient._id, uploadedBy: user._id, documentType: 'lab-report', title, storageKey, mimeType: file.mimetype, sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'), byteLength: file.size });
    await AuditLog.create({ actor: user._id, action: 'clinical.lab_report_uploaded', resourceType: 'ClinicalDocument', resourceId: item._id });
    await notifications.notifyPatient(patient._id, { title: 'Report available', message: 'A new report has been added to your health record.', type: 'report', metadata: { documentId: String(item._id) } }, [user._id]);
    const safe = item.toObject(); delete safe.storageKey; delete safe.sha256; return safe;
  } catch (error) { await fileStorage.remove(storageKey).catch(() => {}); throw error; }
}
async function getDocument(id, user) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid report ID');
  const document = await ClinicalDocument.findById(id).select('+storageKey');
  if (!document) throw new ApiError(404, 'Lab report not found');
  const patient = await Patient.findById(document.patient); await assertDoctorAccess(patient, user);
  const bytes = decrypt(await fileStorage.get(document.storageKey));
  return { bytes, mimeType: document.mimeType, title: document.title };
}
module.exports = { queue, detail, createNote, prescribe, updatePrescription, schedule, refer, uploadDocument, getDocument };
