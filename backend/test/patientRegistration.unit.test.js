const test = require('node:test');
const assert = require('node:assert/strict');
const registration = require('../src/services/patientRegistrationService');

const baseInput = {
  name: 'Test Patient',
  email: 'patient@example.test',
  address: '12 Main Street',
  village: 'Test Village',
  mandal: 'Paderu'
};

test('patient registration encrypts Aadhaar and derives age from date of birth', () => {
  const previous = process.env.PATIENT_AADHAAR_ENCRYPTION_KEY;
  process.env.PATIENT_AADHAAR_ENCRYPTION_KEY = 'patient-aadhaar-test-key-long-enough-for-aes';
  try {
    const patient = registration.normalizePatientRegistration({
      ...baseInput,
      aadhaar: '1234 5678-9012',
      dateOfBirth: '2000-02-29',
      age: '99'
    });
    assert.equal(patient.aadhaarEncrypted.startsWith('v1:'), true);
    assert.equal(patient.aadhaarEncrypted.includes('123456789012'), false);
    assert.equal(patient.dateOfBirth.toISOString(), '2000-02-29T00:00:00.000Z');
    assert.equal(patient.age, undefined);
    assert.equal(patient.district, 'Alluri Sitharama Raju');
    assert.notEqual(
      registration.encryptAadhaar('123456789012'),
      registration.encryptAadhaar('123456789012')
    );
  } finally {
    if (previous === undefined) delete process.env.PATIENT_AADHAAR_ENCRYPTION_KEY;
    else process.env.PATIENT_AADHAAR_ENCRYPTION_KEY = previous;
  }
});

test('age is optional without date of birth and invalid values are rejected', () => {
  const patient = registration.normalizePatientRegistration({ ...baseInput, age: '42' });
  assert.equal(patient.age, 42);
  assert.equal(patient.dateOfBirth, undefined);
  assert.equal(patient.aadhaarEncrypted, undefined);

  for (const age of ['-1', '121', '1.5', 'not-a-number']) {
    assert.throws(() => registration.normalizePatientRegistration({ ...baseInput, age }), /age from 0 to 120/);
  }
  assert.throws(() => registration.normalizePatientRegistration({ ...baseInput, dateOfBirth: '2025-02-30' }), /valid date of birth/);
  assert.throws(() => registration.normalizePatientRegistration({ ...baseInput, aadhaar: '1234-567' }), /12-digit Aadhaar/);
});
