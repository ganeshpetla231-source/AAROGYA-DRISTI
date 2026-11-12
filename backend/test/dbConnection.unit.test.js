const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

test('connectDB overrides the URI database with MONGODB_DB_NAME', async () => {
  const previousUri = process.env.MONGODB_URI;
  const previousDatabaseName = process.env.MONGODB_DB_NAME;
  const originalConnect = mongoose.connect;
  let connection;

  process.env.MONGODB_URI = 'mongodb://localhost/test';
  process.env.MONGODB_DB_NAME = 'aarogya_drishti';
  mongoose.connect = async (uri, options) => {
    connection = { uri, options };
    return mongoose;
  };

  try {
    await connectDB();
    assert.equal(connection.uri, 'mongodb://localhost/test');
    assert.equal(connection.options.dbName, 'aarogya_drishti');
    assert.equal(connection.options.serverSelectionTimeoutMS, 5000);
  } finally {
    mongoose.connect = originalConnect;
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
    if (previousDatabaseName === undefined) delete process.env.MONGODB_DB_NAME;
    else process.env.MONGODB_DB_NAME = previousDatabaseName;
  }
});
