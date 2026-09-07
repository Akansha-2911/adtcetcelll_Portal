// config/database.js — MongoDB via Mongoose
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/svpn_test';

let connectionPromise = null;

const connect = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;
  connectionPromise = (async () => {
    try {
      await mongoose.connect(MONGO_URI, {
      maxPoolSize: parseInt(process.env.DB_POOL_MAX) || 15,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 20000,
      minPoolSize: parseInt(process.env.DB_POOL_MIN, 10) || 0,
      maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_MS, 10) || 30000,
      autoIndex: process.env.DB_AUTO_INDEX ? process.env.DB_AUTO_INDEX === 'true' : process.env.NODE_ENV !== 'production',
    });
      console.log('✅ MongoDB connected:', mongoose.connection.host, '/', mongoose.connection.name);
      return mongoose.connection;
    } catch (err) {
      console.error('❌ MongoDB connection failed:', err.message);
      throw err;
    } finally {
      connectionPromise = null;
    }
  })();
  return connectionPromise;
};

// Keep-alive on disconnect
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected — retrying...');
});

module.exports = { connect, mongoose };
