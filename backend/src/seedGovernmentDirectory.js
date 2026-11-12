const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const connectDB = require('./config/db');
const mongoose = require('mongoose');
const { Hospital } = require('./models');
const { hospitals, phcs } = require('./data/governmentDirectory');

async function seedGovernmentDirectory() {
  await connectDB();
  for (const facility of [...hospitals, ...phcs]) {
    await Hospital.updateOne(
      { directoryKey: facility.directoryKey },
      { $set: { ...facility, isActive: true } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`ITDA Paderu directory seeded: ${hospitals.length} hospitals and ${phcs.length} PHCs.`);
}

if (require.main === module) {
  seedGovernmentDirectory().catch(error => {
    console.error(`Government directory seed failed: ${error.name || 'DatabaseError'}`);
    process.exitCode = 1;
  }).finally(async () => mongoose.disconnect());
}

module.exports = { seedGovernmentDirectory };
