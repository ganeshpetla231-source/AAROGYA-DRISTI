const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('../src/services/adminService');
const { Referral } = require('../src/models');

test('administrator creation does not accept a client-selected role', async () => {
  await assert.rejects(admin.createAdminAccount({
    name: 'New Admin',
    email: 'new.admin@example.test',
    password: 'validtemporarypassword',
    role: 'patient'
  }), error => error.statusCode === 400 && /Unsupported administrator account field/.test(error.message));
});

test('admin referral listing validates pagination and status filters', async () => {
  await assert.rejects(admin.referrals({ page: '1.5' }), error => error.statusCode === 400);
  await assert.rejects(admin.referrals({ status: 'Unknown' }), error => error.statusCode === 400);
  await assert.rejects(admin.referrals({ q: 'a'.repeat(101) }), error => error.statusCode === 400);
});

test('administrator notification endpoints validate filters and recipient IDs', async () => {
  await assert.rejects(admin.adminNotificationRecipients({ role: 'admin' }), error => error.statusCode === 400);
  await assert.rejects(admin.adminNotifications({ status: 'pending' }), error => error.statusCode === 400);
  await assert.rejects(admin.createAdminNotification({ recipientId: 'invalid', title: 'Update', message: 'A message' }, { _id: 'admin-id' }), error => error.statusCode === 400);
});

test('admin referral listing returns operational fields without clinical reasons', async () => {
  const originalFind = Referral.find;
  const originalCountDocuments = Referral.countDocuments;
  const record = {
    _id: 'referral-id',
    patient: { _id: 'patient-id', name: 'Patient One', patientId: 'P-001', district: 'North' },
    hospital: { _id: 'hospital-id', name: 'District Hospital', hospitalId: 'H-001', district: 'North' },
    fromProvider: { name: 'Dr One', role: 'doctor' },
    status: 'Needs review',
    referredAt: new Date('2025-01-01T00:00:00Z'),
    reason: 'Sensitive clinical reason'
  };
  const chain = {
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    select() { return this; },
    populate() { return this; },
    async lean() { return [record]; }
  };

  Referral.find = () => chain;
  Referral.countDocuments = async () => 1;
  try {
    const result = await admin.referrals({ page: '1', limit: '20' });
    assert.equal(result.pagination.total, 1);
    assert.deepEqual(result.items[0], {
      id: 'referral-id',
      patient: { id: 'patient-id', name: 'Patient One', patientId: 'P-001' },
      hospital: { id: 'hospital-id', name: 'District Hospital', hospitalId: 'H-001' },
      provider: { name: 'Dr One', role: 'doctor' },
      status: 'Needs review',
      referredAt: record.referredAt
    });
    assert.equal(Object.hasOwn(result.items[0], 'reason'), false);
  } finally {
    Referral.find = originalFind;
    Referral.countDocuments = originalCountDocuments;
  }
});
