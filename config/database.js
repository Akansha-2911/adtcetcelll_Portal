// config/database.js — MongoDB via Mongoose
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/svpn_test';
const FALLBACK_URI = process.env.MONGO_FALLBACK_URI || 'mongodb://127.0.0.1:27017/spvn_test';
const allowLocalFallback = process.env.NODE_ENV !== 'production' && process.env.DB_ALLOW_LOCAL_FALLBACK !== 'false';

let connectionPromise = null;

const connect = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;
  connectionPromise = (async () => {
    try {
      const options = {
        maxPoolSize: parseInt(process.env.DB_POOL_MAX) || 15,
        serverSelectionTimeoutMS: parseInt(process.env.DB_SELECTION_TIMEOUT_MS, 10) || 10000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 20000,
        minPoolSize: parseInt(process.env.DB_POOL_MIN, 10) || 0,
        maxIdleTimeMS: parseInt(process.env.DB_MAX_IDLE_MS, 10) || 30000,
        autoIndex: process.env.DB_AUTO_INDEX ? process.env.DB_AUTO_INDEX === 'true' : process.env.NODE_ENV !== 'production',
        family: 4,
      };

      try {
        await mongoose.connect(MONGO_URI, options);
      } catch (primaryError) {
        const dnsLike = ['ENOTFOUND','ETIMEOUT','querySrv','ECONNREFUSED'].some(token => String(primaryError.message || primaryError.code || '').includes(token));
        if (!allowLocalFallback || MONGO_URI === FALLBACK_URI || !dnsLike) throw primaryError;
        console.warn('⚠️ Atlas/DNS connection unavailable. Retrying local MongoDB:', FALLBACK_URI);
        await mongoose.disconnect().catch(() => {});
        await mongoose.connect(FALLBACK_URI, { ...options, serverSelectionTimeoutMS: 5000 });
      }

      console.log('✅ MongoDB connected:', mongoose.connection.host, '/', mongoose.connection.name);
      return mongoose.connection;
    } catch (err) {
      console.error('❌ MongoDB connection failed:', err.message);
      if (String(err.message || '').includes('ENOTFOUND')) {
        console.error('   DNS could not resolve MongoDB Atlas. Check internet/DNS, Atlas cluster status, and MONGO_URI.');
      }
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
