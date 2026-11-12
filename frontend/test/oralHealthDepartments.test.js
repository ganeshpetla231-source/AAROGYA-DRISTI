import test from 'node:test';
import assert from 'node:assert/strict';
import {
  departmentForSpecialty,
  oralHealthDepartments,
  oralHealthSpecialties,
  specialtiesForDepartment
} from '../src/data/oralHealthDepartments.js';

test('oral-health specialties belong to a department and can be found case-insensitively', () => {
  assert.equal(new Set(oralHealthSpecialties).size, oralHealthSpecialties.length);
  assert.equal(departmentForSpecialty('oral medicine'), 'Oral Medicine and Radiology');
  assert.deepEqual(specialtiesForDepartment('Periodontology'), ['Periodontology']);
  assert.equal(specialtiesForDepartment('Unknown department').length, 0);
  assert.ok(oralHealthDepartments.length >= 9);
});
