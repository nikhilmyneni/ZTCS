const mongoose = require('mongoose');
const Redis = require('ioredis');

// ─── MongoDB Connection ───
const connectMongoDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Mongoose 8 defaults are good, but explicit for clarity
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

// ─── Redis Connection (Upstash) ───
let redis = null;

const connectRedis = () => {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
    });

    redis.on('connect', () => {
      console.log('✅ Redis connected');
    });

    redis.on('error', (err) => {
      console.error(`❌ Redis error: ${err.message}`);
    });

    return redis;
  } catch (error) {
    console.error(`❌ Redis connection error: ${error.message}`);
    // Redis is non-critical — app can run without it (degraded)
    return null;
  }
};

const getRedis = () => redis;

module.exports = { connectMongoDB, connectRedis, getRedis };
