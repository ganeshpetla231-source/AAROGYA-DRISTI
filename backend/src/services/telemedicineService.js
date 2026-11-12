const mongoose = require('mongoose');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const { User, Patient, DoctorAvailability, Appointment, Consultation, AuditLog, Referral } = require('../models');
const { schedule } = require('./clinicalService');
const notifications = require('./notificationService');

function validDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
async function patientForUser(user) {
  const patient = await Patient.findOne({ user: user._id });
  if (!patient) throw new ApiError(404, 'No patient record is linked to this account');
  return patient;
}
async function authorizedAppointment(id, user) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid appointment ID');
  const appointment = await Appointment.findById(id);
  if (!appointment) throw new ApiError(404, 'Appointment not found');
  let allowed = user.role === 'admin';
  if (user.role === 'doctor') {
    allowed = String(appointment.provider || '') === String(user._id);
    if (allowed) {
      allowed = Boolean(await User.exists({
        _id: user._id, role: 'doctor', isActive: true, approvalStatus: 'approved',
        'doctorProfile.profileVerifiedAt': { $exists: true }
      }));
    }
  }
  if (user.role === 'patient') {
    const patient = await Patient.findOne({ user: user._id }).select('_id').lean();
    allowed ||= !!patient && String(patient._id) === String(appointment.patient);
  }
  if (!allowed) throw new ApiError(403, 'This appointment is outside your care relationship');
  return appointment;
}
function populatedAppointments(query) {
  return query.sort({ scheduledAt: -1 }).populate('patient', 'patientId name user').populate('provider', 'name role doctorProfile.specialization doctorProfile.qualifications doctorProfile.yearsExperience doctorProfile.profileVerifiedAt').populate('hospital', 'name village').lean();
}
async function verifiedDoctorIds() {
  return User.find({
    role: 'doctor', isActive: true, approvalStatus: 'approved',
    'doctorProfile.profileVerifiedAt': { $exists: true }
  }).distinct('_id');
}
function validateBookingDetails(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Provide consultation details');
  if (body.consentGranted !== true) throw new ApiError(400, 'Consent is required before booking a video consultation');
  const consultationReason = typeof body.consultationReason === 'string' ? body.consultationReason.trim() : '';
  const symptoms = typeof body.symptoms === 'string' ? body.symptoms.trim() : '';
  if (!consultationReason || consultationReason.length > 1000) throw new ApiError(400, 'Enter a consultation reason up to 1,000 characters');
  if (symptoms.length > 1500) throw new ApiError(400, 'Symptoms must be 1,500 characters or fewer');
  return { consultationReason, symptoms };
}
function validateClinicBookingDetails(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Provide appointment details');
  if (body.consentGranted !== true) throw new ApiError(400, 'Consent is required before requesting a clinic appointment');
  const scheduledAt = validDate(body.scheduledAt);
  if (!scheduledAt || scheduledAt <= new Date() || scheduledAt > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)) {
    throw new ApiError(400, 'Choose a future requested appointment time within the next 90 days');
  }
  const consultationReason = typeof body.consultationReason === 'string' ? body.consultationReason.trim() : '';
  const symptoms = typeof body.symptoms === 'string' ? body.symptoms.trim() : '';
  if (!consultationReason || consultationReason.length > 1000) throw new ApiError(400, 'Enter an appointment reason up to 1,000 characters');
  if (symptoms.length > 1500) throw new ApiError(400, 'Symptoms must be 1,500 characters or fewer');
  return { scheduledAt, consultationReason, symptoms };
}

async function config(user) {
  const servers = [{ urls: (process.env.STUN_URL || 'stun:stun.l.google.com:19302').split(',').map(value => value.trim()).filter(Boolean) }];
  const turnUrls = (process.env.TURN_URLS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (turnUrls.length && process.env.TURN_SHARED_SECRET) {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const username = `${expiresAt}:${String(user?._id || '')}`;
    const credential = crypto.createHmac('sha1', process.env.TURN_SHARED_SECRET).update(username).digest('base64');
    servers.push({ urls: turnUrls, username, credential });
  }
  if (turnUrls.length && !process.env.TURN_SHARED_SECRET) throw new Error('TURN_SHARED_SECRET is required when TURN_URLS is configured');
  return { iceServers: servers, turnConfigured: servers.length > 1 };
}
async function availability(query = {}) {
  const filter = { status: 'Open', startsAt: { $gt: new Date() }, doctor: { $in: await verifiedDoctorIds() } };
  if (query.doctor !== undefined) {
    if (!mongoose.isValidObjectId(query.doctor)) throw new ApiError(400, 'Choose a valid doctor');
    filter.doctor = query.doctor;
  }
  const items = await DoctorAvailability.find(filter).sort({ startsAt: 1 }).limit(100)
    .populate('doctor', 'name role doctorProfile.specialization doctorProfile.qualifications doctorProfile.yearsExperience doctorProfile.biography doctorProfile.profileVerifiedAt hospital')
    .lean();
  return { items, total: items.length };
}
async function addAvailability(body, user) {
  if (user.role !== 'doctor') throw new ApiError(403, 'Only doctors can publish appointment availability');
  const doctor = await User.findOne({
    _id: user._id, role: 'doctor', isActive: true, approvalStatus: 'approved',
    'doctorProfile.profileVerifiedAt': { $exists: true }
  }).select('_id').lean();
  if (!doctor) throw new ApiError(403, 'An active, verified doctor account is required to publish availability');
  const startsAt = validDate(body.startsAt), endsAt = validDate(body.endsAt);
  const slotMinutes = Math.min(120, Math.max(15, Number.parseInt(body.slotMinutes, 10) || 30));
  if (!startsAt || !endsAt || startsAt <= new Date() || endsAt <= startsAt || endsAt - startsAt > 12 * 60 * 60 * 1000) throw new ApiError(400, 'Choose a valid future availability window up to 12 hours');
  const step = slotMinutes * 60000, docs = [];
  for (let time = startsAt.getTime(); time + step <= endsAt.getTime(); time += step) docs.push({ doctor: user._id, startsAt: new Date(time), endsAt: new Date(time + step), slotMinutes });
  if (!docs.length) throw new ApiError(400, 'Availability window must fit at least one full appointment slot');
  const operations = docs.map(doc => ({ updateOne: { filter: { doctor: doc.doctor, startsAt: doc.startsAt }, update: { $setOnInsert: doc }, upsert: true } }));
  await DoctorAvailability.bulkWrite(operations);
  const items = await DoctorAvailability.find({ doctor: user._id, startsAt: { $gte: startsAt, $lt: endsAt } }).sort({ startsAt: 1 }).lean();
  return { items, total: items.length };
}
async function removeAvailability(id, user) {
  if (user.role !== 'doctor') throw new ApiError(403, 'Only doctors can remove availability');
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid availability ID');
  const slot = await DoctorAvailability.findOne({ _id: id, doctor: user._id });
  if (!slot) throw new ApiError(404, 'Availability slot not found');
  if (slot.status === 'Booked') throw new ApiError(409, 'A booked slot cannot be removed. Cancel or reschedule its appointment first.');
  slot.status = 'Cancelled'; await slot.save(); return { id: slot._id };
}
async function book(availabilityId, body, user) {
  if (user.role !== 'patient') throw new ApiError(403, 'Only patient accounts can book online consultations');
  const { consultationReason, symptoms } = validateBookingDetails(body);
  const patient = await patientForUser(user);
  if (!mongoose.isValidObjectId(availabilityId)) throw new ApiError(400, 'Choose an available doctor slot');
  const eligibleDoctors = await verifiedDoctorIds();
  const slot = await DoctorAvailability.findOneAndUpdate({ _id: availabilityId, doctor: { $in: eligibleDoctors }, status: 'Open', startsAt: { $gt: new Date() } }, { $set: { status: 'Booked' } }, { new: true });
  if (!slot) throw new ApiError(409, 'This availability has already been booked or is no longer open');
  try {
    const appointment = await Appointment.create({
      patient: patient._id, provider: slot.doctor, availability: slot._id, scheduledAt: slot.startsAt,
      type: 'Telemedicine consultation', visitMode: 'Video', status: 'Upcoming',
      consultationReason, symptoms, consultationConsentAt: new Date()
    });
    slot.appointment = appointment._id; await slot.save();
    await AuditLog.create({ actor: user._id, action: 'telemedicine.appointment_booked', resourceType: 'Appointment', resourceId: appointment._id });
    await notifications.notifyAppointment(appointment, { title: 'Video appointment booked', message: 'A patient booked a video consultation. Open Appointments to review the request.', type: 'appointment', metadata: { appointmentId: String(appointment._id) } });
    return appointment.toObject();
  } catch (error) { await DoctorAvailability.updateOne({ _id: slot._id, status: 'Booked' }, { $set: { status: 'Open' }, $unset: { appointment: 1 } }); throw error; }
}
async function bookClinicAppointment(body, user) {
  if (user.role !== 'patient') throw new ApiError(403, 'Only patients can request clinic appointments');
  if (!mongoose.isValidObjectId(body?.doctorId)) throw new ApiError(400, 'Choose a verified doctor');
  const { scheduledAt, consultationReason, symptoms } = validateClinicBookingDetails(body);
  const doctor = await User.findOne({
    _id: body.doctorId, role: 'doctor', isActive: true, approvalStatus: 'approved',
    'doctorProfile.profileVerifiedAt': { $exists: true }
  }).select('hospital').populate('hospital', 'isActive').lean();
  if (!doctor || doctor.hospital?.isActive === false) throw new ApiError(404, 'Verified doctor not found');
  const patient = await patientForUser(user);
  const appointment = await Appointment.create({
    patient: patient._id,
    provider: doctor._id,
    hospital: doctor.hospital?._id,
    scheduledAt,
    type: 'In-person clinic appointment',
    visitMode: 'Clinic',
    status: 'Upcoming',
    consultationReason,
    symptoms,
    consultationConsentAt: new Date()
  });
  await AuditLog.create({ actor: user._id, action: 'clinic_appointment.requested', resourceType: 'Appointment', resourceId: appointment._id });
  await notifications.notifyAppointment(appointment.toObject(), {
    title: 'Clinic appointment request',
    message: 'A patient requested an in-person appointment. Review and confirm the requested time.',
    type: 'appointment',
    metadata: { appointmentId: String(appointment._id), scheduledAt }
  });
  return appointment.toObject();
}
async function listAppointments(user) {
  let filter = {};
  if (user.role === 'doctor') {
    filter.provider = user._id;
  }
  else if (user.role === 'patient') filter.patient = (await patientForUser(user))._id;
  else if (user.role !== 'admin') throw new ApiError(403, 'Telemedicine appointments are for patients and doctors');
  return { items: await populatedAppointments(Appointment.find(filter)), total: await Appointment.countDocuments(filter) };
}
async function updateAppointment(id, action, body, user) {
  const appointment = await authorizedAppointment(id, user);
  if (action === 'confirm') {
    if (user.role !== 'doctor') throw new ApiError(403, 'Only the assigned doctor can confirm an appointment');
    if (!['Upcoming', 'Confirmed'].includes(appointment.status)) throw new ApiError(409, 'Only upcoming appointments can be confirmed');
    appointment.status = 'Confirmed'; await appointment.save();
  } else if (action === 'decline') {
    if (user.role !== 'doctor') throw new ApiError(403, 'Only the assigned doctor can decline an appointment');
    if (appointment.status !== 'Upcoming') throw new ApiError(409, 'Only pending appointments can be declined');
    appointment.status = 'Declined'; await appointment.save();
    if (appointment.availability) await DoctorAvailability.updateOne({ _id: appointment.availability, appointment: appointment._id }, { $set: { status: 'Open' }, $unset: { appointment: 1 } });
    await Consultation.updateOne({ appointment: appointment._id, status: 'Scheduled' }, { $set: { status: 'Declined', endedAt: new Date() } });
  } else if (action === 'cancel') {
    if (!['doctor', 'patient'].includes(user.role)) throw new ApiError(403, 'Only appointment participants can cancel');
    if (['Completed', 'Cancelled', 'Declined'].includes(appointment.status)) throw new ApiError(409, 'This appointment can no longer be cancelled');
    if (await Consultation.exists({ appointment: appointment._id, status: 'In progress' })) throw new ApiError(409, 'Use End call to finish an active consultation');
    appointment.status = 'Cancelled'; await appointment.save();
    if (appointment.availability) await DoctorAvailability.updateOne({ _id: appointment.availability }, { $set: { status: 'Open' }, $unset: { appointment: 1 } });
    await Consultation.updateOne({ appointment: appointment._id, status: { $nin: ['Completed'] } }, { $set: { status: 'Cancelled', endedAt: new Date() } });
  } else if (action === 'reschedule') {
    if (!['doctor', 'patient'].includes(user.role)) throw new ApiError(403, 'Only appointment participants can reschedule');
    if (['Completed', 'Cancelled', 'Declined'].includes(appointment.status)) throw new ApiError(409, 'This appointment can no longer be rescheduled');
    if (appointment.visitMode !== 'Video') throw new ApiError(409, 'Clinic appointment time changes must be arranged with the doctor');
    if (await Consultation.exists({ appointment: appointment._id, status: { $in: ['In progress', 'Completed'] } })) throw new ApiError(409, 'An active or completed consultation cannot be rescheduled');
    if (!mongoose.isValidObjectId(body.availabilityId)) throw new ApiError(400, 'Choose a new doctor availability slot');
    const slot = await DoctorAvailability.findOneAndUpdate({ _id: body.availabilityId, doctor: appointment.provider, status: 'Open', startsAt: { $gt: new Date() } }, { $set: { status: 'Booked' } }, { new: true });
    if (!slot) throw new ApiError(409, 'The selected new slot is no longer available');
    const oldAvailability = appointment.availability;
    appointment.rescheduledFrom = appointment.scheduledAt; appointment.scheduledAt = slot.startsAt; appointment.availability = slot._id; appointment.status = 'Upcoming'; await appointment.save();
    slot.appointment = appointment._id; await slot.save();
    if (oldAvailability) await DoctorAvailability.updateOne({ _id: oldAvailability }, { $set: { status: 'Open' }, $unset: { appointment: 1 } });
    await Consultation.updateOne({ appointment: appointment._id }, { $set: { status: 'Scheduled', roomId: crypto.randomBytes(24).toString('hex') }, $unset: { startedAt: 1, endedAt: 1 } });
  } else throw new ApiError(404, 'Unknown appointment action');
  const auditAction = { confirm: 'confirmed', decline: 'declined', cancel: 'cancelled', reschedule: 'rescheduled' }[action];
  await AuditLog.create({ actor: user._id, action: `telemedicine.appointment_${auditAction}`, resourceType: 'Appointment', resourceId: appointment._id });
  const visitName = appointment.visitMode === 'Video' ? 'video consultation' : 'clinic appointment';
  const eventText = action === 'confirm' ? ['Appointment confirmed', `Your ${visitName} has been confirmed.`] : action === 'decline' ? ['Appointment request declined', `The doctor could not accept your ${visitName} request. Please choose another time or doctor.`] : action === 'cancel' ? ['Appointment cancelled', `A ${visitName} was cancelled.`] : ['Appointment rescheduled', 'A video appointment time was changed.'];
  await notifications.notifyAppointment(appointment, { title: eventText[0], message: eventText[1], type: action === 'confirm' ? 'appointment-confirmation' : 'appointment', metadata: { appointmentId: String(appointment._id), scheduledAt: appointment.scheduledAt } });
  return appointment.toObject();
}
async function recordConsultationConsent(id, body, user) {
  if (!['patient', 'doctor'].includes(user.role) || body?.granted !== true) throw new ApiError(400, 'Confirm consent to join this video consultation');
  const appointment = await authorizedAppointment(id, user);
  if (appointment.visitMode !== 'Video' || appointment.status !== 'Confirmed') throw new ApiError(409, 'Consent is available only for a confirmed video consultation');
  let consultation = await Consultation.findOne({ appointment: appointment._id });
  if (!consultation) {
    try { consultation = await Consultation.create({ appointment: appointment._id, patient: appointment.patient, provider: appointment.provider, roomId: crypto.randomBytes(24).toString('hex') }); }
    catch { consultation = await Consultation.findOne({ appointment: appointment._id }); }
  }
  if (!consultation) throw new ApiError(500, 'Could not save consultation consent');
  const field = user.role === 'patient' ? 'patientConsentAt' : 'doctorConsentAt';
  consultation[field] = new Date();
  await consultation.save();
  await AuditLog.create({ actor: user._id, action: `telemedicine.${user.role}_consented`, resourceType: 'Consultation', resourceId: consultation._id });
  return { consented: true };
}
async function getRoom(id, user) {
  const appointment = await authorizedAppointment(id, user);
  if (['Cancelled', 'Declined'].includes(appointment.status)) throw new ApiError(409, 'This appointment was cancelled or declined');
  if (appointment.status === 'Upcoming') throw new ApiError(409, 'The doctor must confirm this appointment before a video room can be opened');
  if (appointment.visitMode !== 'Video') throw new ApiError(409, 'This appointment is not booked as a video consultation');
  let consultation = await Consultation.findOne({ appointment: appointment._id }).select('+roomId');
  if (!consultation) {
    try { consultation = await Consultation.create({ appointment: appointment._id, patient: appointment.patient, provider: appointment.provider, roomId: crypto.randomBytes(24).toString('hex'), status: 'Scheduled' }); }
    catch { consultation = await Consultation.findOne({ appointment: appointment._id }).select('+roomId'); }
  }
  if (!consultation) throw new ApiError(500, 'Could not create the consultation room');
  if (!consultation.roomId) { consultation.roomId = crypto.randomBytes(24).toString('hex'); await consultation.save(); }
  return { consultation: { id: consultation._id, roomId: consultation.roomId, status: consultation.status, notes: user.role === 'doctor' ? consultation.notes || '' : '', chatMessages: consultation.chatMessages }, appointment: { id: appointment._id, patient: appointment.patient, provider: appointment.provider, status: appointment.status, scheduledAt: appointment.scheduledAt } };
}
async function saveNotes(id, body, user) {
  const appointment = await authorizedAppointment(id, user);
  if (user.role !== 'doctor') throw new ApiError(403, 'Only the assigned doctor can save consultation notes');
  const notes = String(body.notes || '').trim();
  if (notes.length > 5000) throw new ApiError(400, 'Consultation notes must be at most 5,000 characters');
  await getRoom(id, user);
  const consultation = await Consultation.findOne({ appointment: appointment._id });
  consultation.notes = notes; await consultation.save();
  await AuditLog.create({ actor: user._id, action: 'telemedicine.notes_saved', resourceType: 'Consultation', resourceId: consultation._id });
  return { id: consultation._id, notes: consultation.notes };
}
async function scheduleFollowup(id, body, user) {
  const appointment = await authorizedAppointment(id, user);
  if (user.role !== 'doctor') throw new ApiError(403, 'Only the assigned doctor can schedule a follow-up');
  const followup = await schedule(String(appointment.patient), { ...body, type: body.type || 'Telemedicine follow-up' }, user);
  await notifications.notifyAppointment(followup, { title: 'Follow-up scheduled', message: `A follow-up appointment was scheduled for ${new Date(followup.scheduledAt).toLocaleString()}.`, type: 'follow-up', metadata: { appointmentId: String(followup._id), scheduledAt: followup.scheduledAt } });
  return followup;
}
async function assertSocketParticipant(appointmentId, userId) {
  if (!mongoose.isValidObjectId(appointmentId)) throw new ApiError(400, 'Invalid appointment ID');
  const appointment = await Appointment.findById(appointmentId).lean();
  if (!appointment || appointment.status !== 'Confirmed') throw new ApiError(409, 'A confirmed appointment is required to join the video room');
  if (appointment.visitMode !== 'Video') throw new ApiError(403, 'This appointment does not have a video room');
  const patient = await Patient.findById(appointment.patient).select('user').lean();
  const isDoctor = String(appointment.provider || '') === String(userId);
  const isPatient = String(patient?.user || '') === String(userId);
  if (!isDoctor && !isPatient) throw new ApiError(403, 'Only the patient and assigned doctor may join this room');
  if (isDoctor) {
    const verifiedDoctor = await User.exists({
      _id: userId, role: 'doctor', isActive: true, approvalStatus: 'approved',
      'doctorProfile.profileVerifiedAt': { $exists: true }
    });
    if (!verifiedDoctor) throw new ApiError(403, 'An active, verified doctor account is required to join');
  }
  const consultation = await Consultation.findOne({ appointment: appointment._id }).select('+roomId');
  if (!consultation) throw new ApiError(404, 'Consultation room has not been created');
  if (consultation.status === 'Completed' || consultation.status === 'Cancelled') throw new ApiError(409, 'This consultation room is closed');
  if ((isPatient && !consultation.patientConsentAt) || (isDoctor && !consultation.doctorConsentAt)) throw new ApiError(403, 'Confirm video consultation consent before joining');
  return { appointment, consultation, participantRole: isDoctor ? 'doctor' : 'patient' };
}
async function adminOverview() {
  const [appointmentsByStatus, consultationByStatus, totalVideoAppointments, appointments, doctors, availableSlots] = await Promise.all([
    Appointment.aggregate([{ $match: { visitMode: 'Video' } }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Consultation.aggregate([
      { $lookup: { from: Appointment.collection.name, localField: 'appointment', foreignField: '_id', as: 'appointmentRecord' } },
      { $unwind: '$appointmentRecord' },
      { $match: { 'appointmentRecord.visitMode': 'Video' } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    Appointment.countDocuments({ visitMode: 'Video' }),
    Appointment.find({ visitMode: 'Video' }).sort({ scheduledAt: -1 }).limit(100)
      .select('patient provider scheduledAt status visitMode createdAt')
      .populate('patient', 'patientId name')
      .populate('provider', 'name doctorProfile.specialization')
      .lean(),
    User.find({ role: 'doctor' }).sort({ name: 1 }).limit(200)
      .select('name approvalStatus isActive doctorProfile.specialization doctorProfile.qualifications doctorProfile.registrationNumber doctorProfile.profileVerifiedAt')
      .lean(),
    DoctorAvailability.countDocuments({ status: 'Open', startsAt: { $gt: new Date() } })
  ]);
  const appointmentIds = appointments.map(item => item._id);
  const consultations = await Consultation.find({ appointment: { $in: appointmentIds } }).select('appointment status').lean();
  const statusByAppointment = new Map(consultations.map(item => [String(item.appointment), item.status]));
  return {
    summary: {
      totalVideoAppointments,
      pendingAppointments: appointmentsByStatus.find(item => item._id === 'Upcoming')?.count || 0,
      confirmedAppointments: appointmentsByStatus.find(item => item._id === 'Confirmed')?.count || 0,
      completedAppointments: appointmentsByStatus.find(item => item._id === 'Completed')?.count || 0,
      activeConsultations: consultationByStatus.find(item => item._id === 'In progress')?.count || 0,
      openSlots: availableSlots
    },
    appointments: appointments.map(item => ({
      id: item._id,
      patient: item.patient ? { id: item.patient._id, patientId: item.patient.patientId, name: item.patient.name } : null,
      doctor: item.provider ? { id: item.provider._id, name: item.provider.name, specialization: item.provider.doctorProfile?.specialization || '' } : null,
      scheduledAt: item.scheduledAt,
      status: item.status,
      consultationStatus: statusByAppointment.get(String(item._id)) || 'Not started',
      createdAt: item.createdAt
    })),
    doctors: doctors.map(item => ({
      id: item._id,
      name: item.name,
      specialization: item.doctorProfile?.specialization || '',
      qualifications: item.doctorProfile?.qualifications || [],
      registrationNumber: item.doctorProfile?.registrationNumber || '',
      approvalStatus: item.approvalStatus,
      isActive: item.isActive,
      profileVerified: Boolean(item.doctorProfile?.profileVerifiedAt)
    })),
    appointmentsByStatus,
    consultationsByStatus: consultationByStatus
  };
}
module.exports = { config, availability, addAvailability, removeAvailability, book, bookClinicAppointment, listAppointments, updateAppointment, getRoom, recordConsultationConsent, saveNotes, scheduleFollowup, assertSocketParticipant, validateBookingDetails, validateClinicBookingDetails, adminOverview };
