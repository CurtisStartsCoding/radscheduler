const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool;

async function connectDB() {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    logger.info('Database connected successfully');
    
    // Handle errors
    pool.on('error', (err) => {
      logger.error('Unexpected database error', err);
    });
    
    return pool;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call connectDB first.');
  }
  return pool;
}

module.exports = {
  connectDB,
  getPool
};