const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const models = require('../src/models');
const { createSession } = require('../src/services/authService');

test('healthcare worker API validates records and enforces administrator scopes', async t => {
  await connectDB();
  await models.HealthcareWorker.deleteMany({
    $or: [
      { name: /^Temporary API Test Worker$/i },
      { email: 'worker-test@example.test' },
      { staffId: /^TEST-[A-F0-9]{12,}$/i }
    ]
  });
  const admin = await models.User.findOne({ role: 'admin', isActive: true });
  const district = await models.User.findOne({ role: 'district', isActive: true, district: { $exists: true, $ne: '' } });
  const doctor = await models.User.findOne({ role: 'doctor', isActive: true });
  const patient = await models.User.findOne({ role: 'patient', isActive: true });
  assert.ok(admin && district && doctor && patient, 'Active seeded role accounts are required');
  const facility = await models.Hospital.findOne({ district: district.district, isActive: true });
  assert.ok(facility, 'A facility in the district administrator scope is required');

  const sessions = [];
  const tokens = {};
  for (const [role, user] of Object.entries({ admin, district, doctor, patient })) {
    const session = await createSession(user);
    sessions.push(session);
    tokens[role] = session.accessToken;
  }
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/healthcare-workers`;
  const request = (path, role, method = 'GET', body) => fetch(`${base}${path}`, {
    method,
    headers: { ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const staffId = `TEST-${crypto.randomBytes(6).toString('hex')}`.toUpperCase();
  let createdId;

  t.after(async () => {
    if (createdId) {
      await models.HealthcareWorker.deleteOne({ _id: createdId });
      await models.AuditLog.deleteMany({ resourceType: 'HealthcareWorker', resourceId: createdId });
    }
    for (const session of sessions) {
      const jti = jwt.decode(session.refreshToken)?.jti;
      if (jti) await models.RefreshSession.deleteOne({ tokenIdHash: crypto.createHash('sha256').update(jti).digest('hex') });
    }
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });

  const body = {
    staffId, name: 'Temporary API Test Worker', role: 'asha', phone: '+919876543210',
    email: 'worker-test@example.test', designation: 'ASHA Worker', facility: String(facility._id),
    mandal: facility.mandal || 'Test Mandal', village: facility.village, district: district.district,
    employmentStatus: 'active', joinedAt: '2024-01-15'
  };
  assert.equal((await request('/', null)).status, 401);
  assert.equal((await request('/', 'patient')).status, 403);
  assert.equal((await request('/', 'doctor')).status, 403);
  assert.equal((await request('/', 'district', 'POST', { ...body, password: 'should-not-be-accepted' })).status, 400);
  assert.equal((await request('/', 'district', 'POST', { ...body, staffId: `${staffId}-BAD`, phone: 'not-a-phone' })).status, 400);

  const createResponse = await request('/', 'district', 'POST', body);
  assert.equal(createResponse.status, 201, await createResponse.clone().text());
  const created = (await createResponse.json()).data;
  createdId = created._id;
  assert.equal(created.staffId, staffId);
  assert.equal(created.passwordHash, undefined);
  assert.equal((await request(`/${createdId}`, 'district')).status, 200);
  assert.equal((await request('/', 'admin', 'POST', body)).status, 409);

  const filteredResponse = await request(`/?q=${encodeURIComponent('Temporary API Test')}&status=active&page=1&limit=1`, 'district');
  const directory = (await filteredResponse.json()).data;
  assert.equal(filteredResponse.status, 200);
  assert.equal(directory.total, 1);
  assert.equal(directory.items[0]._id, createdId);
  assert.ok(directory.items[0].facility.name);
  assert.equal((await request(`/?role=asha&village=${encodeURIComponent(body.village)}&page=2&limit=1`, 'district')).status, 200);
  assert.equal((await request(`/${createdId}`, 'doctor')).status, 403);
  assert.equal((await request(`/${createdId}`, 'district', 'PATCH', { designation: 'Updated API Test Worker' })).status, 200);
  const updated = (await request(`/${createdId}`, 'district')).json();
  assert.equal((await updated).data.designation, 'Updated API Test Worker');

  const statsResponse = await request('/stats', 'district');
  const stats = (await statsResponse.json()).data;
  assert.equal(statsResponse.status, 200);
  assert.ok(Number.isInteger(stats.totalActiveWorkers));
  assert.equal(typeof stats.workersByRole.asha, 'number');

  const statusResponse = await request(`/${createdId}/status`, 'admin', 'PATCH', { employmentStatus: 'inactive' });
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).data.employmentStatus, 'inactive');
  assert.equal((await request(`/${createdId}`, 'district')).status, 200);
  assert.equal((await request(`/${createdId}`, 'patient')).status, 403);
});
