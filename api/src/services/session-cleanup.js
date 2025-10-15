const { getPool } = require('../db/connection');
const logger = require('../utils/logger');

/**
 * Cleanup service for expired SMS sessions
 * Runs periodically to mark sessions as EXPIRED after 24 hours
 * Per HIPAA requirements for session timeout
 */

/**
 * Run the cleanup function to expire old sessions
 * @returns {Promise<number>} - Number of sessions expired
 */
async function cleanupExpiredSessions() {
  const pool = getPool();

  try {
    const result = await pool.query('SELECT cleanup_expired_sms_sessions()');
    const expiredCount = result.rows[0].cleanup_expired_sms_sessions;

    if (expiredCount > 0) {
      logger.info('Expired SMS sessions cleaned up', {
        count: expiredCount,
        timestamp: new Date().toISOString()
      });
    }

    return expiredCount;
  } catch (error) {
    logger.error('Failed to cleanup expired SMS sessions', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Start the periodic cleanup job
 * Runs every 5 minutes to check for expired sessions
 */
function startCleanupJob() {
  // Run immediately on startup
  cleanupExpiredSessions().catch(err => {
    logger.error('Initial session cleanup failed', { error: err.message });
  });

  // Run every 5 minutes
  const intervalMs = 5 * 60 * 1000; // 5 minutes
  const intervalId = setInterval(() => {
    cleanupExpiredSessions().catch(err => {
      logger.error('Scheduled session cleanup failed', { error: err.message });
    });
  }, intervalMs);

  logger.info('SMS session cleanup job started', {
    intervalMinutes: 5,
    ttlHours: 24
  });

  return intervalId;
}

/**
 * Stop the periodic cleanup job
 */
function stopCleanupJob(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    logger.info('SMS session cleanup job stopped');
  }
}

module.exports = {
  cleanupExpiredSessions,
  startCleanupJob,
  stopCleanupJob
};
