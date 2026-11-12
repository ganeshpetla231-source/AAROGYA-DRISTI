const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../src/app');
const models = require('../src/models');
const { seedGovernmentDirectory } = require('../src/seedGovernmentDirectory');
const { phcs: seedPhcs, hospitals: seedHospitals } = require('../src/data/governmentDirectory');

const expectedMandalCounts = {
  Ananthagiri: 4, 'Araku Valley': 3, Chintapalli: 4, Dumbriguda: 2, 'G. Madugula': 2,
  'G.K. Veedhi': 7, Hukumpeta: 2, Koyyuru: 4, Munchingiputtu: 2, Paderu: 2, Pedabayalu: 3
};

test('ITDA Paderu directory seeds idempotently and serves the requested facilities and filters', async t => {
  assert.equal(seedHospitals.length, 4);
  assert.equal(seedPhcs.length, 35);
  assert.equal(new Set(seedPhcs.map(item => item.directoryKey)).size, 35);
  assert.deepEqual(Object.fromEntries(Object.entries(expectedMandalCounts).map(([name]) => [name, seedPhcs.filter(item => item.mandal === name).length])), expectedMandalCounts);
  assert.equal(seedHospitals.reduce((total, item) => total + item.beds, 0), 430);
  assert.ok(seedPhcs.every(item => typeof item.phone === 'string' && /^\d{10}$/.test(item.phone)));
  assert.ok(seedPhcs.every(item => typeof item.postalCode === 'string' && /^\d{6}$/.test(item.postalCode)));

  await seedGovernmentDirectory();
  await seedGovernmentDirectory();
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
  });

  const base = `http://127.0.0.1:${server.address().port}/api/government-directory`;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.deepEqual(data.summary, {
    hospitals: 4, phcs: 35, mandals: 11, beds: 430,
    mandalCounts: Object.keys(expectedMandalCounts).sort().map(mandal => ({ mandal, count: expectedMandalCounts[mandal] }))
  });
  assert.equal(data.hospitals.length, 4);
  assert.equal(data.phcs.length, 35);
  assert.equal(data.dmho.phone, '9959055025');
  assert.equal(data.dmho.email, 'dmhoasr@gmail.com');

  const byMandal = await fetch(`${base}/phcs/mandal/${encodeURIComponent('G.K. Veedhi')}`);
  assert.equal((await byMandal.json()).data.length, 7);
  const byPin = await fetch(`${base}/phcs/search?q=531040`);
  assert.equal((await byPin.json()).data.length, 5);
  const byPhone = await fetch(`${base}/phcs/search?q=7382798216`);
  const searched = (await byPhone.json()).data;
  assert.equal(searched.length, 1);
  assert.equal(searched[0].phone, '7382798216');
  const invalid = await fetch(`${base}/phcs?q=${'x'.repeat(121)}`);
  assert.equal(invalid.status, 400);

  const hospitalResponse = await fetch(`${base}/hospitals/${data.hospitals[0]._id}`);
  assert.equal(hospitalResponse.status, 200);
  assert.ok(hospitalResponse.headers.get('content-type').includes('application/json'));
  const storedPhones = await models.Hospital.find({ directoryKey: /^itda-paderu:phc:/ }).select('phone').lean();
  assert.equal(storedPhones.length, 35);
  assert.ok(storedPhones.every(item => typeof item.phone === 'string'));
  const storedByKey = new Map((await models.Hospital.find({ directoryKey: /^itda-paderu:phc:/ }).select('directoryKey phone postalCode').lean()).map(item => [item.directoryKey, item]));
  for (const expected of seedPhcs) {
    assert.ok(storedByKey.has(expected.directoryKey));
    assert.equal(storedByKey.get(expected.directoryKey)?.phone, expected.phone);
    assert.equal(storedByKey.get(expected.directoryKey)?.postalCode, expected.postalCode);
  }
});
