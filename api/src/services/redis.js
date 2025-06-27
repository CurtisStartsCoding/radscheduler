const { createClient } = require('redis');
const logger = require('../utils/logger');

let redisClient;
let pubClient;
let subClient;

async function connectRedis() {
  try {
    // Main client for general operations
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    // Pub/Sub clients
    pubClient = redisClient.duplicate();
    subClient = redisClient.duplicate();
    
    // Error handling
    redisClient.on('error', err => logger.error('Redis Client Error', err));
    pubClient.on('error', err => logger.error('Redis Pub Client Error', err));
    subClient.on('error', err => logger.error('Redis Sub Client Error', err));
    
    // Connect all clients
    await redisClient.connect();
    await pubClient.connect();
    await subClient.connect();
    
    logger.info('Redis connected successfully');
    
    return { redisClient, pubClient, subClient };
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
}

function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call connectRedis first.');
  }
  return redisClient;
}

function getPubClient() {
  if (!pubClient) {
    throw new Error('Redis pub client not initialized.');
  }
  return pubClient;
}

function getSubClient() {
  if (!subClient) {
    throw new Error('Redis sub client not initialized.');
  }
  return subClient;
}

module.exports = {
  connectRedis,
  getRedisClient,
  getPubClient,
  getSubClient
};