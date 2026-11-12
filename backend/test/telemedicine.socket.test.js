const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const jwt = require('jsonwebtoken');
const models = require('../src/models');
const telemedicine = require('../src/services/telemedicineService');
const { accessSecret } = require('../src/services/authService');
const attachTelemedicineSocket = require('../src/services/telemedicineSocket');

class MockSocket extends EventEmitter {
  constructor(userId) {
    super();
    this.handshake = { auth: { token: jwt.sign({ sub: userId, ver: 0 }, accessSecret()) } };
    this.data = {};
    this.rooms = new Set();
    this.outgoing = [];
  }
  emit(event, ...args) {
    this.outgoing.push({ event, args });
    return true;
  }
  clientEmit(event, ...args) {
    return super.emit(event, ...args);
  }
  join(room) {
    this.rooms.add(room);
  }
  leave(room) {
    this.rooms.delete(room);
  }
  to(room) {
    return { emit: (event, payload) => this.io.sockets.filter(socket => socket !== this && socket.rooms.has(room)).forEach(socket => socket.emit(event, payload)) };
  }
}

class MockIo extends EventEmitter {
  constructor() {
    super();
    this.sockets = [];
  }
  use(middleware) {
    this.middleware = middleware;
  }
  in(room) {
    return { fetchSockets: async () => this.sockets.filter(socket => socket.rooms.has(room)) };
  }
  to(room) {
    return { emit: (event, payload) => this.sockets.filter(socket => socket.rooms.has(room)).forEach(socket => socket.emit(event, payload)) };
  }
  async connect(userId) {
    const socket = new MockSocket(userId);
    socket.io = this;
    await new Promise((resolve, reject) => this.middleware(socket, error => error ? reject(error) : resolve()));
    this.sockets.push(socket);
    this.connectionHandler(socket);
    return socket;
  }
}

test('Socket.IO enforces participant authorization, validates signaling, and guards busy doctors', async t => {
  const originals = {
    findUser: models.User.findById,
    updateConsultation: models.Consultation.updateOne,
    updateAppointment: models.Appointment.updateOne,
    assertParticipant: telemedicine.assertSocketParticipant
  };
  t.after(() => {
    models.User.findById = originals.findUser;
    models.Consultation.updateOne = originals.updateConsultation;
    models.Appointment.updateOne = originals.updateAppointment;
    telemedicine.assertSocketParticipant = originals.assertParticipant;
  });

  models.User.findById = async id => ({ _id: id, role: id === 'doctor-1' ? 'doctor' : 'patient', isActive: true, authVersion: 0 });
  models.Consultation.updateOne = async () => ({ modifiedCount: 1 });
  models.Appointment.updateOne = async () => ({ modifiedCount: 1 });
  telemedicine.assertSocketParticipant = async (appointmentId, userId) => {
    if (appointmentId === 'outside-relationship') throw Object.assign(new Error('Only the patient and assigned doctor may join this room'), { statusCode: 403 });
    const roomId = appointmentId === 'another-appointment' ? 'consultation-2' : 'consultation-1';
    return {
      appointment: { _id: appointmentId },
      consultation: { _id: roomId, chatMessages: [] },
      participantRole: userId === 'doctor-1' ? 'doctor' : 'patient'
    };
  };

  const io = new MockIo();
  attachTelemedicineSocket(io);
  io.on('connection', socket => {});
  const connectionListener = io.listeners('connection')[0];
  io.connectionHandler = connectionListener;

  const doctor = await io.connect('doctor-1');
  const patient = await io.connect('patient-1');
  const join = (socket, appointmentId) => new Promise(resolve => socket.clientEmit('room:join', { appointmentId }, resolve));
  assert.equal((await join(doctor, 'appointment-1')).ok, true);
  assert.equal((await join(patient, 'appointment-1')).ok, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(doctor.outgoing.some(event => event.event === 'peer:ready'));

  patient.clientEmit('rtc:offer', { description: { type: 'answer', sdp: 'invalid offer' } });
  assert.equal(doctor.outgoing.some(event => event.event === 'rtc:offer'), false);
  patient.clientEmit('rtc:offer', { description: { type: 'offer', sdp: 'valid test offer' } });
  assert.ok(doctor.outgoing.some(event => event.event === 'rtc:offer'));

  const outsider = await io.connect('patient-2');
  const unauthorized = await join(outsider, 'outside-relationship');
  assert.equal(unauthorized.ok, false);
  assert.match(unauthorized.message, /Only the patient and assigned doctor/);

  const busyDoctor = await io.connect('doctor-1');
  const busy = await join(busyDoctor, 'another-appointment');
  assert.equal(busy.ok, false);
  assert.match(busy.message, /busy in another consultation/);

  let endReply;
  await new Promise(resolve => {
    doctor.clientEmit('call:end', reply => { endReply = reply; resolve(); });
  });
  assert.deepEqual(endReply, { ok: true });
  assert.ok(patient.outgoing.some(event => event.event === 'call:ended'));
});

test('failed room setup cleans up the socket reservation and returns an error', async t => {
  const originals = {
    findUser: models.User.findById,
    updateConsultation: models.Consultation.updateOne,
    assertParticipant: telemedicine.assertSocketParticipant
  };
  t.after(() => {
    models.User.findById = originals.findUser;
    models.Consultation.updateOne = originals.updateConsultation;
    telemedicine.assertSocketParticipant = originals.assertParticipant;
  });
  models.User.findById = async id => ({ _id: id, role: 'doctor', isActive: true, authVersion: 0 });
  models.Consultation.updateOne = async () => { throw new Error('database unavailable'); };
  telemedicine.assertSocketParticipant = async () => ({
    appointment: { _id: 'appointment-1' },
    consultation: { _id: 'consultation-1', chatMessages: [] },
    participantRole: 'doctor'
  });
  const io = new MockIo();
  attachTelemedicineSocket(io);
  io.connectionHandler = io.listeners('connection')[0];
  const socket = await io.connect('doctor-1');
  const response = await new Promise(resolve => socket.clientEmit('room:join', { appointmentId: 'appointment-1' }, resolve));
  assert.equal(response.ok, false);
  assert.match(response.message, /database unavailable/);
  assert.equal(socket.data.room, undefined);
});
