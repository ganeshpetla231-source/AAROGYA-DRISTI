const test = require('node:test');
const assert = require('node:assert/strict');
const facilities = require('../src/services/adminFacilityService');

test('facility details reject malformed MongoDB IDs with a 400 response', async () => {
  await assert.rejects(facilities.get('not-an-object-id'), error => {
    assert.equal(error.statusCode, 400);
    assert.equal(error.message, 'Invalid facility ID');
    return true;
  });
});

test('facility list rejects malformed pagination and oversized search input', async () => {
  await assert.rejects(facilities.list({ page: '1.5' }), error => error.statusCode === 400);
  await assert.rejects(facilities.list({ q: 'a'.repeat(101) }), error => error.statusCode === 400);
  await assert.rejects(facilities.list({ facilityType: 'x'.repeat(101) }), error => error.statusCode === 400);
});
