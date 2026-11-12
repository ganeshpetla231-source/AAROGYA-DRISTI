const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const models = require('../src/models');
const { createSession } = require('../src/services/authService');

test('offline screening metadata requires consent, is idempotent, and never creates an AI result', async t => {
  await connectDB();
  const asha = await models.User.findOne({ role: 'asha', isActive: true });
  const doctor = await models.User.findOne({ role: 'doctor', isActive: true });
  const patient = await models.Patient.findOne({ assignedWorker: asha?._id });
  assert.ok(asha && doctor && patient, 'Seeded ASHA, doctor, and patient records are required');
  const otherPatient = await models.Patient.create({
    patientId: `OFFLINE-SCOPE-${crypto.randomBytes(5).toString('hex')}`,
    name: 'Offline Scope Test Patient', village: 'Test Village', district: 'Krishna', consentGiven: false
  });

  const sessions = {};
  for (const [role, user] of Object.entries({ asha, doctor })) sessions[role] = await createSession(user);
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/screenings/offline-metadata`;
  const request = (role, body) => fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${sessions[role].accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const clientRequestId = crypto.randomUUID();
  const body = {
    clientRequestId, patientId: String(patient._id), consentGranted: true,
    capturedAt: new Date().toISOString(), symptoms: ['Persistent mouth change']
  };
  let createdId;
  t.after(async () => {
    await models.Patient.deleteOne({ _id: otherPatient._id });
    if (createdId) {
      await models.OfflineScreeningMetadata.deleteOne({ _id: createdId });
      await models.AuditLog.deleteMany({ resourceType: 'OfflineScreeningMetadata', resourceId: createdId });
    }
    for (const session of Object.values(sessions)) {
      const jti = jwt.decode(session.refreshToken)?.jti;
      if (jti) await models.RefreshSession.deleteOne({ tokenIdHash: crypto.createHash('sha256').update(jti).digest('hex') });
    }
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });

  assert.equal((await request('asha', { ...body, consentGranted: false })).status, 400);
  const firstResponse = await request('asha', body);
  assert.equal(firstResponse.status, 201);
  const first = (await firstResponse.json()).data;
  createdId = first.id;
  assert.equal(first.status, 'pending-clinical-assessment');
  assert.match(first.message, /Analysis Pending — Internet Required/);
  const stored = await models.OfflineScreeningMetadata.findById(createdId).lean();
  assert.equal(stored.consentGranted, true);
  assert.equal(stored.requestHash, undefined);
  assert.equal(stored.aiResult, undefined);
  assert.equal(stored.imageStorageKey, undefined);

  const repeated = await request('asha', body);
  assert.equal(repeated.status, 201);
  assert.equal((await repeated.json()).data.id, createdId);
  assert.equal(await models.OfflineScreeningMetadata.countDocuments({ createdBy: asha._id, clientRequestId }), 1);
  assert.equal((await request('asha', { ...body, symptoms: ['Changed details'] })).status, 409);
  assert.equal((await request('asha', { ...body, patientId: String(otherPatient._id), clientRequestId: crypto.randomUUID() })).status, 403);
  assert.equal((await request('doctor', { ...body, patientId: String(otherPatient._id), clientRequestId: crypto.randomUUID() })).status, 403);
});

test('offline patient-registration retries do not create duplicate patient records', async t => {
  await connectDB();
  const asha = await models.User.findOne({ role: 'asha', isActive: true });
  assert.ok(asha, 'An active seeded ASHA account is required');
  const session = await createSession(asha);
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/patients`;
  const clientRequestId = crypto.randomUUID();
  const patientId = `OFFLINE-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const body = { clientRequestId, patientId, name: 'Offline API Test Patient', village: 'Test Village', district: 'Krishna', status: 'Screened', consentGiven: true };
  const request = data => fetch(url, { method: 'POST', headers: { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(data) });
  let createdId;
  t.after(async () => {
    if (createdId) await models.Patient.deleteOne({ _id: createdId });
    const jti = jwt.decode(session.refreshToken)?.jti;
    if (jti) await models.RefreshSession.deleteOne({ tokenIdHash: crypto.createHash('sha256').update(jti).digest('hex') });
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });

  assert.equal((await request({ ...body, consentGiven: false })).status, 400);
  const firstResponse = await request(body);
  assert.equal(firstResponse.status, 201, await firstResponse.clone().text());
  const first = (await firstResponse.json()).data;
  createdId = first._id;
  assert.equal(first.clientRequestHash, undefined);
  const retryResponse = await request(body);
  assert.equal(retryResponse.status, 201);
  assert.equal((await retryResponse.json()).data._id, createdId);
  assert.equal(await models.Patient.countDocuments({ patientId }), 1);
  assert.equal((await request({ ...body, name: 'Different Person' })).status, 409);
});
