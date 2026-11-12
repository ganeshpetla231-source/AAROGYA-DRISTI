const mongoose = require('mongoose');

let connectionPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!connectionPromise) {
    connectionPromise = (async () => {
      const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aarogya_drishti';
      mongoose.connection.on('connected', () => console.log('MongoDB connected'));
      mongoose.connection.on('error', (error) => console.error('MongoDB connection error:', error.name || 'Error'));
      mongoose.connection.on('disconnected', () => {
        connectionPromise = null;
      });
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      return mongoose.connection;
    })().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  return connectionPromise;
}

module.exports = connectDB;
