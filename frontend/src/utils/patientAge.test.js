import test from 'node:test';
import assert from 'node:assert/strict';
import { patientAgeFromDateOfBirth } from './patientAge.js';

test('patient age changes on the birth date, not just after a rounded year duration', () => {
  assert.equal(patientAgeFromDateOfBirth('2000-06-15', new Date('2025-06-14T12:00:00Z')), 24);
  assert.equal(patientAgeFromDateOfBirth('2000-06-15', new Date('2025-06-15T12:00:00Z')), 25);
});

test('invalid and future dates do not produce a derived age', () => {
  assert.equal(patientAgeFromDateOfBirth('2025-02-30', new Date('2025-06-15T12:00:00Z')), null);
  assert.equal(patientAgeFromDateOfBirth('2025-06-16', new Date('2025-06-15T12:00:00Z')), null);
});
