const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const telemedicine = require('../src/services/telemedicineService');
const models = require('../src/models');
const { Appointment, Consultation } = models;

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve().then(callback).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('TURN configuration returns short-lived, per-user REST credentials', async () => {
  await withEnv({
    STUN_URL: 'stun:stun.example.test:3478',
    TURN_URLS: 'turns:turn.example.test:5349',
    TURN_SHARED_SECRET: 'test-only-turn-shared-secret',
    TURN_USERNAME: undefined,
    TURN_CREDENTIAL: undefined
  }, async () => {
    const now = Math.floor(Date.now() / 1000);
    const config = await telemedicine.config({ _id: 'patient-123' });
    const turn = config.iceServers[1];
    assert.deepEqual(turn.urls, ['turns:turn.example.test:5349']);
    assert.equal(config.turnConfigured, true);
    const [expiresAt, userId] = turn.username.split(':');
    assert.equal(userId, 'patient-123');
    assert.ok(Number(expiresAt) >= now + 3599 && Number(expiresAt) <= now + 3601);
    assert.equal(turn.credential, crypto.createHmac('sha1', 'test-only-turn-shared-secret').update(turn.username).digest('base64'));
    assert.equal(Object.hasOwn(turn, 'password'), false);
  });
});

test('TURN endpoints require server-side shared credentials', async () => {
  await withEnv({ TURN_URLS: 'turn:turn.example.test:3478', TURN_SHARED_SECRET: undefined }, async () => {
    await assert.rejects(telemedicine.config({ _id: 'patient-123' }), /TURN_SHARED_SECRET/);
  });
});

test('appointments and consultation records support declined states and Hindi chat messages', () => {
  assert.ok(Appointment.schema.path('status').enumValues.includes('Declined'));
  assert.ok(Consultation.schema.path('status').enumValues.includes('Declined'));
  assert.ok(Consultation.schema.path('chatMessages').schema.path('language').enumValues.includes('hi'));
});

test('video booking requires explicit consent and a valid consultation reason', () => {
  assert.throws(() => telemedicine.validateBookingDetails({}), /Consent is required/);
  assert.throws(() => telemedicine.validateBookingDetails({ consentGranted: true }), /consultation reason/);
  assert.throws(() => telemedicine.validateBookingDetails({ consentGranted: true, consultationReason: 'x'.repeat(1001) }), /consultation reason/);
  assert.throws(() => telemedicine.validateBookingDetails({ consentGranted: true, consultationReason: 'checkup', symptoms: 'x'.repeat(1501) }), /Symptoms/);
  assert.deepEqual(telemedicine.validateBookingDetails({
    consentGranted: true,
    consultationReason: '  Mouth pain  ',
    symptoms: '  Two days  '
  }), { consultationReason: 'Mouth pain', symptoms: 'Two days' });
});

test('clinic appointment requests require consent, a future time, and a reason', () => {
  assert.throws(() => telemedicine.validateClinicBookingDetails({}), /Consent is required/);
  assert.throws(() => telemedicine.validateClinicBookingDetails({
    consentGranted: true,
    scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    consultationReason: 'checkup'
  }), /future requested appointment time/);
  assert.throws(() => telemedicine.validateClinicBookingDetails({
    consentGranted: true,
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  }), /appointment reason/);
  assert.deepEqual(telemedicine.validateClinicBookingDetails({
    consentGranted: true,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    consultationReason: '  Dental checkup  ',
    symptoms: '  Tooth pain  '
  }).consultationReason, 'Dental checkup');
});

test('video booking and consultation schemas persist booking details and participant consent timestamps', () => {
  assert.ok(Appointment.schema.path('consultationReason'));
  assert.ok(Appointment.schema.path('symptoms'));
  assert.ok(Appointment.schema.path('consultationConsentAt'));
  assert.ok(Consultation.schema.path('patientConsentAt'));
  assert.ok(Consultation.schema.path('doctorConsentAt'));
});

test('active doctors get actionable guidance when hospital verification is still pending', async t => {
  const originalFindOne = models.User.findOne;
  t.after(() => { models.User.findOne = originalFindOne; });
  models.User.findOne = () => ({
    select() { return this; },
    async lean() {
      return {
        isActive: true,
        approvalStatus: 'approved',
        hospital: new mongoose.Types.ObjectId(),
        doctorProfile: {}
      };
    }
  });

  await assert.rejects(
    telemedicine.addAvailability({}, { _id: new mongoose.Types.ObjectId(), role: 'doctor' }),
    error => error.statusCode === 403
      && /account is active, but hospital verification is still required/.test(error.message)
      && /medical-registration documents/.test(error.message)
  );
});

test('consultation room responses keep doctor notes private from the patient', async t => {
  const originals = {
    findAppointment: models.Appointment.findById,
    findPatient: models.Patient.findOne,
    findDoctor: models.User.exists,
    findConsultation: models.Consultation.findOne
  };
  t.after(() => {
    models.Appointment.findById = originals.findAppointment;
    models.Patient.findOne = originals.findPatient;
    models.User.exists = originals.findDoctor;
    models.Consultation.findOne = originals.findConsultation;
  });

  const appointmentId = '111111111111111111111111';
  const patientRecordId = '222222222222222222222222';
  const patientUserId = '333333333333333333333333';
  const doctorUserId = '444444444444444444444444';
  const consultation = {
    _id: '555555555555555555555555',
    roomId: 'private-test-room',
    status: 'Scheduled',
    notes: 'Private clinical note',
    chatMessages: [{ text: 'Shared consultation message' }]
  };
  models.Appointment.findById = async () => ({
    _id: appointmentId,
    patient: patientRecordId,
    provider: doctorUserId,
    status: 'Confirmed',
    visitMode: 'Video',
    scheduledAt: new Date()
  });
  models.Patient.findOne = () => ({
    select() {
      return { lean: async () => ({ _id: patientRecordId }) };
    }
  });
  models.User.exists = async () => true;
  models.Consultation.findOne = () => ({
    select() { return Promise.resolve(consultation); }
  });

  const patientRoom = await telemedicine.getRoom(appointmentId, { _id: patientUserId, role: 'patient' });
  const doctorRoom = await telemedicine.getRoom(appointmentId, { _id: doctorUserId, role: 'doctor' });

  assert.equal(patientRoom.consultation.notes, '');
  assert.deepEqual(patientRoom.consultation.chatMessages, consultation.chatMessages);
  assert.equal(doctorRoom.consultation.notes, consultation.notes);
});

test('only the appointment patient and assigned verified doctor can join a consultation', async t => {
  const originals = {
    findAppointment: models.Appointment.findById,
    findPatient: models.Patient.findById,
    findDoctor: models.User.exists,
    findConsultation: models.Consultation.findOne
  };
  t.after(() => {
    models.Appointment.findById = originals.findAppointment;
    models.Patient.findById = originals.findPatient;
    models.User.exists = originals.findDoctor;
    models.Consultation.findOne = originals.findConsultation;
  });

  const appointmentId = '111111111111111111111111';
  const patientRecordId = '222222222222222222222222';
  const patientUserId = '333333333333333333333333';
  const doctorUserId = '444444444444444444444444';
  models.Appointment.findById = () => ({
    lean: async () => ({
      _id: appointmentId,
      patient: patientRecordId,
      provider: doctorUserId,
      status: 'Confirmed',
      visitMode: 'Video'
    })
  });
  models.Patient.findById = () => ({
    select() {
      return { lean: async () => ({ user: patientUserId }) };
    }
  });
  models.User.exists = async () => true;
  models.Consultation.findOne = () => ({
    select() {
      return Promise.resolve({
        _id: '555555555555555555555555',
        patientConsentAt: new Date(),
        doctorConsentAt: new Date()
      });
    }
  });

  const patient = await telemedicine.assertSocketParticipant(appointmentId, patientUserId);
  const doctor = await telemedicine.assertSocketParticipant(appointmentId, doctorUserId);
  assert.equal(patient.participantRole, 'patient');
  assert.equal(doctor.participantRole, 'doctor');
  await assert.rejects(
    telemedicine.assertSocketParticipant(appointmentId, '666666666666666666666666'),
    { statusCode: 403 }
  );
});

test('doctor telemedicine notes are persisted on the consultation record', async t => {
  const originals = {
    findAppointment: models.Appointment.findById,
    findDoctor: models.User.exists,
    findConsultation: models.Consultation.findOne,
    createAudit: models.AuditLog.create
  };
  const consultation = {
    _id: '111111111111111111111111',
    roomId: 'private-test-room',
    status: 'Scheduled',
    chatMessages: [],
    notes: '',
    async save() { this.persistedNotes = this.notes; }
  };
  t.after(() => {
    models.Appointment.findById = originals.findAppointment;
    models.User.exists = originals.findDoctor;
    models.Consultation.findOne = originals.findConsultation;
    models.AuditLog.create = originals.createAudit;
  });
  models.Appointment.findById = async () => ({
    _id: '222222222222222222222222',
    provider: '333333333333333333333333',
    patient: '444444444444444444444444',
    visitMode: 'Video',
    status: 'Confirmed'
  });
  models.User.exists = async () => true;
  models.Consultation.findOne = () => ({
    select() { return this; },
    then(resolve) { return Promise.resolve(consultation).then(resolve); }
  });
  models.AuditLog.create = async () => ({});

  await telemedicine.saveNotes('222222222222222222222222', { notes: 'Clinical follow-up required.' }, {
    _id: '333333333333333333333333',
    role: 'doctor'
  });

  assert.equal(consultation.persistedNotes, 'Clinical follow-up required.');
});
