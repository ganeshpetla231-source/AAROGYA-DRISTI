const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = relativePath => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
const frontendApi = readSource('../../frontend/src/services/api.js');

test('consultation notes use the registered telemedicine appointment route', () => {
  const telemedicineRoutes = readSource('../src/routes/telemedicineRoutes.js');
  const app = readSource('../src/app.js');

  assert.match(frontendApi, /saveConsultationNotes\(id, notes\).*api\.patch\(`\/telemedicine\/appointments\/\$\{id\}\/notes`/);
  assert.match(telemedicineRoutes, /router\.patch\('\/appointments\/:id\/notes'/);
  assert.match(app, /app\.use\('\/api\/telemedicine', telemedicineRoutes\)/);
});

test('offline screening sync uses the body request ID without a CORS-blocked header', () => {
  const syncFunction = frontendApi.match(/export async function syncOfflineScreeningMetadata[^\n]*/)?.[0];

  assert.ok(syncFunction, 'offline screening sync API helper should exist');
  assert.match(syncFunction, /api\.post\('\/screenings\/offline-metadata', data\)/);
  assert.doesNotMatch(syncFunction, /Idempotency-Key/);
});
