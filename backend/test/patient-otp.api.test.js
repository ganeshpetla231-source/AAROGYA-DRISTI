const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const models = require('../src/models');
const msg91 = require('../src/services/msg91Service');

test('patient OTP registration and sign-in use verified phone ownership and one-time challenges', async t => {
  await connectDB();
  const previousSend = msg91.sendPatientOtp;
  const delivered = new Map();
  msg91.sendPatientOtp = async (phone, code) => { delivered.set(phone, code); return null; };
  const phones = [];
  const emails = [];
  const users = [];
  let server;

  t.after(async () => {
    msg91.sendPatientOtp = previousSend;
    if (phones.length) await models.PatientOtpChallenge.deleteMany({ phone: { $in: phones } });
    if (emails.length) {
      const created = await models.User.find({ email: { $in: emails } }).select('_id').lean();
      users.push(...created.map(user => user._id));
    }
    if (users.length) {
      const patientIds = await models.Patient.find({ user: { $in: users } }).distinct('_id');
      if (patientIds.length) {
        await models.PatientQR.deleteMany({ patient: { $in: patientIds } });
        await models.Patient.deleteMany({ _id: { $in: patientIds } });
      }
      await models.RefreshSession.deleteMany({ user: { $in: users } });
      await models.User.deleteMany({ _id: { $in: users } });
    }
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });

  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/auth/patient-otp`;
  const phone = `+919${String(crypto.randomInt(100000000, 999999999))}`;
  const email = `patient-otp-${crypto.randomUUID()}@test.invalid`;
  phones.push(phone);
  emails.push(email);
  const post = (route, body) => fetch(`${base}/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const requested = await post('request', {
    purpose: 'register', phone, name: 'OTP Test Patient', email,
    address: '12 Main Street', village: 'Test Village', mandal: 'Paderu',
    aadhaar: '1234 5678 9012', dateOfBirth: '2000-02-29', age: 99,
    language: 'en', role: 'admin'
  });
  assert.equal(requested.status, 202);
  assert.match((await requested.json()).data.message, /verification code has been sent/i);
  const pendingChallenge = await models.PatientOtpChallenge.findOne({ phone, purpose: 'register' }).lean();
  assert.equal(pendingChallenge.registration.address, '12 Main Street');
  assert.match(pendingChallenge.registration.aadhaarEncrypted, /^v1:/);
  assert.equal(pendingChallenge.registration.aadhaarEncrypted.includes('123456789012'), false);
  assert.equal(pendingChallenge.registration.aadhaar, undefined);
  const code = delivered.get(phone);
  assert.match(code, /^\d{6}$/);

  const verified = await post('verify', { purpose: 'register', phone, code });
  assert.equal(verified.status, 200);
  const session = await verified.json();
  assert.equal(session.data.user.role, 'patient');
  assert.ok(session.data.qrToken);
  assert.ok(verified.headers.get('set-cookie')?.includes('refreshToken='));
  const user = await models.User.findOne({ email }).lean();
  assert.equal(user.phone, phone);
  assert.equal(user.role, 'patient');
  assert.equal(user.passwordHash, undefined);
  users.push(user._id);
  const patient = await models.Patient.findOne({ user: user._id }).lean();
  assert.equal(patient.phone, phone);
  assert.equal(patient.email, email);
  assert.equal(patient.address, '12 Main Street');
  assert.equal(patient.village, 'Test Village');
  assert.equal(patient.mandal, 'Paderu');
  assert.equal(patient.district, 'Alluri Sitharama Raju');
  assert.equal(patient.age, undefined);
  assert.equal(patient.dateOfBirth.toISOString(), '2000-02-29T00:00:00.000Z');
  assert.equal(patient.aadhaarEncrypted, undefined);
  const storedPatient = await models.Patient.findById(patient._id).select('+aadhaarEncrypted').lean();
  assert.match(storedPatient.aadhaarEncrypted, /^v1:/);
  assert.equal(storedPatient.aadhaarEncrypted.includes('123456789012'), false);
  assert.equal(storedPatient.aadhaarEncrypted, pendingChallenge.registration.aadhaarEncrypted);
  await assert.rejects(
    models.User.create({ name: 'Duplicate Phone Patient', email: `duplicate-${crypto.randomUUID()}@test.invalid`, phone, role: 'patient' }),
    error => error.code === 11000
  );

  const replay = await post('verify', { purpose: 'register', phone, code });
  assert.equal(replay.status, 400);

  const loginRequested = await post('request', { purpose: 'login', phone });
  assert.equal(loginRequested.status, 202);
  const loginCode = delivered.get(phone);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invalid = await post('verify', { purpose: 'login', phone, code: '000000' });
    assert.equal(invalid.status, 400);
  }
  const locked = await post('verify', { purpose: 'login', phone, code: loginCode });
  assert.equal(locked.status, 400);
  await models.PatientOtpChallenge.updateOne(
    { phone, purpose: 'login' },
    { $set: { sentAt: new Date(Date.now() - 61000) } }
  );
  const resent = await post('request', { purpose: 'login', phone });
  assert.equal(resent.status, 202);
  const newCode = delivered.get(phone);
  const login = await post('verify', { purpose: 'login', phone, code: newCode });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).data.user.id, String(user._id));

  const replayedLogin = await post('verify', { purpose: 'login', phone, code: newCode });
  assert.equal(replayedLogin.status, 400);

  const rawPatientRegistration = await fetch(`${base.replace('/patient-otp', '')}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Unverified Patient', email: `unverified-${crypto.randomUUID()}@test.invalid`, phone, password: 'somepassword', role: 'patient' })
  });
  assert.equal(rawPatientRegistration.status, 403);
});
