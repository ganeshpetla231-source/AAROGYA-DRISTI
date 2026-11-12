import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendDoctors } from '../src/utils/doctorRecommendations.js';

test('screening category prefers verified doctors in related departments', () => {
  const doctors = [
    { id: 'general', name: 'General Dentist', profile: { specialization: 'General Dentistry' } },
    { id: 'oral-medicine', name: 'Oral Medicine Doctor', profile: { specialization: 'Oral Medicine' } }
  ];

  const result = recommendDoctors('possible-white-patch', doctors);

  assert.equal(result.matched, true);
  assert.equal(result.doctors[0].id, 'oral-medicine');
});

test('department alone can match a screening recommendation', () => {
  const doctors = [
    { id: 'specialist', name: 'Oral Medicine Doctor', profile: { department: 'Oral Medicine and Radiology' } }
  ];

  const result = recommendDoctors('possible-white-patch', doctors);

  assert.equal(result.matched, true);
  assert.equal(result.doctors[0].id, 'specialist');
});

test('recommendations fall back to listed verified doctors when no department matches', () => {
  const doctors = [
    { id: 'b', name: 'Doctor B', profile: { specialization: 'Other specialty' } },
    { id: 'a', name: 'Doctor A', profile: { specialization: 'Other specialty' } }
  ];

  const result = recommendDoctors('possible-red-lesion', doctors);

  assert.equal(result.matched, false);
  assert.deepEqual(result.doctors.map(doctor => doctor.id), ['a', 'b']);
});

test('insufficient image quality does not produce a doctor recommendation', () => {
  assert.deepEqual(recommendDoctors('insufficient-quality', [
    { id: 'doctor', name: 'Doctor', profile: { specialization: 'General Dentistry' } }
  ]), { matched: false, doctors: [] });
});
