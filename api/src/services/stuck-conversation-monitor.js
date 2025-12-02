const { getPool } = require('../db/connection');
const logger = require('../utils/logger');
const { decryptPhoneNumber } = require('../utils/phone-hash');
const { sendSMS } = require('./notifications');
const { sendTimeSlotOptions, STATES } = require('./sms-conversation');
const { logSMSInteraction, MESSAGE_TYPES, CONSENT_STATUS } = require('./sms-audit');

/**
 * Stuck Conversation Monitor Service
 * Monitors CHOOSING_TIME conversations for missing webhook responses
 * Implements 5-minute timeout with auto-retry and patient notification
 */

// Configuration - can be overridden via environment variables
const WEBHOOK_TIMEOUT_MS = parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = parseInt(process.env.MAX_WEBHOOK_RETRIES) || 1;
const CHECK_INTERVAL_MS = parseInt(process.env.WEBHOOK_CHECK_INTERVAL_MS) || 60 * 1000; // 1 minute

/**
 * Find conversations that are stuck waiting for webhook responses
 * A conversation is stuck if:
 * - State is CHOOSING_TIME
 * - slot_request_sent_at is more than WEBHOOK_TIMEOUT_MS ago
 * - slot_request_failed_at is NULL (not already failed)
 * - Conversation hasn't expired
 */
async function findStuckConversations() {
  const pool = getPool();
  const timeoutThreshold = new Date(Date.now() - WEBHOOK_TIMEOUT_MS);

  try {
    const result = await pool.query(
      `SELECT * FROM sms_conversations
       WHERE state = $1
         AND slot_request_sent_at IS NOT NULL
         AND slot_request_sent_at < $2
         AND slot_request_failed_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY slot_request_sent_at ASC`,
      [STATES.CHOOSING_TIME, timeoutThreshold]
    );

    return result.rows;
  } catch (error) {
    logger.error('Failed to find stuck conversations', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Retry a slot request for a timed-out conversation
 */
async function retrySlotRequest(conversation) {
  const pool = getPool();

  try {
    // Decrypt phone number
    const phoneNumber = decryptPhoneNumber(conversation.encrypted_phone);
    if (!phoneNumber) {
      logger.error('Cannot retry slot request - phone decryption failed', {
        conversationId: conversation.id
      });
      return false;
    }

    logger.info('Retrying slot request for stuck conversation', {
      conversationId: conversation.id,
      retryCount: (conversation.slot_retry_count || 0) + 1,
      previousRequestAt: conversation.slot_request_sent_at
    });

    // Update retry count and reset timestamp before retry
    await pool.query(
      `UPDATE sms_conversations
       SET slot_retry_count = COALESCE(slot_retry_count, 0) + 1,
           slot_request_sent_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [conversation.id]
    );

    // Re-send the slot request
    await sendTimeSlotOptions(phoneNumber, conversation);

    logger.info('Slot request retry sent successfully', {
      conversationId: conversation.id
    });

    return true;
  } catch (error) {
    logger.error('Failed to retry slot request', {
      conversationId: conversation.id,
      error: error.message,
      stack: error.stack
    });
    return false;
  }
}

/**
 * Notify patient of permanent failure and mark conversation as cancelled
 */
async function notifyPatientOfFailure(conversation) {
  const pool = getPool();

  try {
    const phoneNumber = decryptPhoneNumber(conversation.encrypted_phone);

    if (!phoneNumber) {
      logger.error('Cannot notify patient - phone decryption failed', {
        conversationId: conversation.id
      });

      // Still mark as failed even if we can't notify
      await pool.query(
        `UPDATE sms_conversations
         SET state = $1,
             slot_request_failed_at = CURRENT_TIMESTAMP,
             slot_request_sent_at = NULL,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [STATES.CANCELLED, conversation.id]
      );

      return false;
    }

    // Send failure notification to patient
    const message = `We're sorry, but we experienced a technical issue while finding available appointment times. Please call us to complete your scheduling. We apologize for the inconvenience.`;
    await sendSMS(phoneNumber, message);

    // Update conversation state to CANCELLED
    await pool.query(
      `UPDATE sms_conversations
       SET state = $1,
           slot_request_failed_at = CURRENT_TIMESTAMP,
           slot_request_sent_at = NULL,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [STATES.CANCELLED, conversation.id]
    );

    // Audit log
    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_ERROR,
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString(),
      success: false,
      errorMessage: 'Webhook timeout - patient notified to call'
    });

    logger.info('Patient notified of webhook timeout failure', {
      conversationId: conversation.id,
      retryCount: conversation.slot_retry_count
    });

    return true;
  } catch (error) {
    logger.error('Failed to notify patient of failure', {
      conversationId: conversation.id,
      error: error.message,
      stack: error.stack
    });
    return false;
  }
}

/**
 * Process all stuck conversations
 * Returns statistics about what was processed
 */
async function processStuckConversations() {
  const stats = {
    found: 0,
    retried: 0,
    notified: 0,
    errors: 0
  };

  try {
    const stuckConversations = await findStuckConversations();
    stats.found = stuckConversations.length;

    if (stuckConversations.length === 0) {
      return stats;
    }

    logger.info('Processing stuck conversations', {
      count: stuckConversations.length
    });

    for (const conversation of stuckConversations) {
      try {
        const retryCount = conversation.slot_retry_count || 0;

        if (retryCount < MAX_RETRY_ATTEMPTS) {
          // Still have retries available - try again
          const success = await retrySlotRequest(conversation);
          if (success) {
            stats.retried++;
          } else {
            stats.errors++;
          }
        } else {
          // Max retries exceeded - notify patient and cancel
          const success = await notifyPatientOfFailure(conversation);
          if (success) {
            stats.notified++;
          } else {
            stats.errors++;
          }
        }
      } catch (error) {
        logger.error('Error processing stuck conversation', {
          conversationId: conversation.id,
          error: error.message
        });
        stats.errors++;
      }
    }

    logger.info('Stuck conversation processing complete', {
      ...stats
    });

    return stats;
  } catch (error) {
    logger.error('Error in stuck conversation processing', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Start the stuck conversation monitoring job
 * Runs every minute to check for timed-out webhook requests
 */
function startStuckMonitorJob() {
  // Run immediately on startup
  processStuckConversations().catch(err => {
    logger.error('Initial stuck conversation check failed', { error: err.message });
  });

  // Run every minute
  const intervalId = setInterval(() => {
    processStuckConversations().catch(err => {
      logger.error('Scheduled stuck conversation check failed', { error: err.message });
    });
  }, CHECK_INTERVAL_MS);

  logger.info('Stuck conversation monitor job started', {
    timeoutMinutes: WEBHOOK_TIMEOUT_MS / 60000,
    maxRetries: MAX_RETRY_ATTEMPTS,
    checkIntervalSeconds: CHECK_INTERVAL_MS / 1000
  });

  return intervalId;
}

/**
 * Stop the stuck conversation monitoring job
 */
function stopStuckMonitorJob(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    logger.info('Stuck conversation monitor job stopped');
  }
}

module.exports = {
  findStuckConversations,
  processStuckConversations,
  retrySlotRequest,
  notifyPatientOfFailure,
  startStuckMonitorJob,
  stopStuckMonitorJob,
  // Export config for testing
  WEBHOOK_TIMEOUT_MS,
  MAX_RETRY_ATTEMPTS,
  CHECK_INTERVAL_MS
};
