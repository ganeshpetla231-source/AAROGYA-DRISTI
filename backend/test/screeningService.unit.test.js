const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseVisionResult, validatePatientImageSubmission, validateReviewInput, maxBytes
} = require('../src/services/screeningService');

const validResult = {
  category: 'possible-white-patch',
  finding: 'A pale area is visible.',
  possibleCauses: ['Irritation can sometimes look similar.'],
  explanation: 'A photograph cannot determine the cause of this appearance.'
};

test('accepts a constrained visual screening result without a confidence score', () => {
  assert.deepEqual(parseVisionResult(JSON.stringify(validResult)), {
    ...validResult,
    nextSteps: 'Arrange an examination with a qualified dental or medical professional, especially if the change persists or worsens.'
  });
  const legacyResponse = { ...validResult };
  delete legacyResponse.possibleCauses;
  assert.deepEqual(parseVisionResult(JSON.stringify(legacyResponse)).possibleCauses, []);
});

test('rejects malformed, unsupported, or confidence-bearing model responses', () => {
  for (const response of [
    'not json',
    JSON.stringify({ ...validResult, category: 'cancer' }),
    JSON.stringify({ ...validResult, confidence: 0.99 }),
    JSON.stringify({ ...validResult, nextSteps: 'Take medication.' }),
    JSON.stringify({ ...validResult, possibleCauses: ['x'.repeat(181)] }),
    JSON.stringify({ ...validResult, possibleCauses: ['one', 'two', 'three', 'four'] }),
    JSON.stringify({ ...validResult, category: 'no-visible-abnormality' }),
    JSON.stringify({ ...validResult, finding: '' }),
    JSON.stringify({ ...validResult, nextSteps: 'x'.repeat(1001) })
  ]) {
    assert.throws(() => parseVisionResult(response), { statusCode: 502 });
  }
});

test('validates patient role, consent, file size, MIME type, and image signature', () => {
  const patient = { role: 'patient' };
  const consent = { consentGranted: 'true' };
  assert.throws(() => validatePatientImageSubmission(null, consent, patient), { statusCode: 400 });
  assert.throws(() => validatePatientImageSubmission({ size: 3, buffer: Buffer.from([255, 216, 255]), mimetype: 'image/jpeg' }, consent, { role: 'doctor' }), { statusCode: 403 });
  assert.throws(() => validatePatientImageSubmission({ size: 3, buffer: Buffer.from([255, 216, 255]), mimetype: 'image/jpeg' }, {}, patient), { statusCode: 400 });
  assert.throws(() => validatePatientImageSubmission({ size: maxBytes + 1, buffer: Buffer.alloc(3), mimetype: 'image/jpeg' }, consent, patient), { statusCode: 413 });
  assert.throws(() => validatePatientImageSubmission({ size: 3, buffer: Buffer.from('not image'), mimetype: 'image/jpeg' }, consent, patient), { statusCode: 415 });
  assert.throws(() => validatePatientImageSubmission({ size: 3, buffer: Buffer.from([255, 216, 255]), mimetype: 'image/webp' }, consent, patient), { statusCode: 415 });
  assert.doesNotThrow(() => validatePatientImageSubmission({ size: 3, buffer: Buffer.from([255, 216, 255]), mimetype: 'image/jpeg' }, consent, patient));
});

test('validates clinician decisions, observations, treatment, and referral details', () => {
  const referral = { hospital: '507f1f77bcf86cd799439011', reason: 'Needs specialist examination.' };
  assert.deepEqual(validateReviewInput({
    category: 'possible-white-patch',
    decision: 'needs-further-examination',
    diagnosisNotes: 'Observed pale area.',
    treatmentRecommendations: 'Arrange clinical examination.',
    referral
  }), {
    category: 'possible-white-patch',
    decision: 'needs-further-examination',
    diagnosisNotes: 'Observed pale area.',
    treatmentRecommendations: 'Arrange clinical examination.',
    notes: '',
    referralHospital: referral.hospital,
    referralReason: referral.reason
  });
  for (const payload of [
    { category: 'unsupported', decision: 'approved' },
    { category: 'possible-ulcer', decision: 'unknown' },
    { category: 'possible-ulcer', decision: 'approved', diagnosisNotes: 123 },
    { category: 'possible-ulcer', decision: 'approved', treatmentRecommendations: 'x'.repeat(3001) },
    { category: 'possible-ulcer', decision: 'approved', referral: { hospital: 'not-an-id', reason: 'Reason' } },
    { category: 'possible-ulcer', decision: 'approved', referral: { hospital: '507f1f77bcf86cd799439011', reason: ' ' } }
  ]) {
    assert.throws(() => validateReviewInput(payload), { statusCode: 400 });
  }
});
