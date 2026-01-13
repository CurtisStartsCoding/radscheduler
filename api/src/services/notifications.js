/**
 * Notification Service
 *
 * Provides SMS notification capabilities using the multi-provider SMS service.
 * Maintains backward compatibility with existing code while enabling
 * per-organization configuration and automatic failover.
 */

const { SMSService, getSMSService, sendSMS: smsSend } = require('./sms');
const logger = require('../utils/logger');
const { hashPhoneNumber, getPhoneLast4 } = require('../utils/phone-hash');

// Database connection (injected or null for legacy mode)
let dbConnection = null;

/**
 * Set the database connection for the notification service
 * @param {Object} db - Database connection pool
 */
function setDatabase(db) {
  dbConnection = db;
}

/**
 * Send SMS message
 *
 * @param {string} to - Recipient phone number
 * @param {string} message - Message content
 * @param {Object} [options] - Additional options
 * @param {string} [options.organizationId] - Organization UUID for multi-tenant config
 * @param {string} [options.from] - Override sender number
 * @returns {Promise<Object>}
 */
async function sendSMS(to, message, options = {}) {
  try {
    // Validation
    if (!to) {
      logger.error('SMS send failed: No recipient phone number provided');
      throw new Error('No recipient phone number provided');
    }

    if (typeof to !== 'string' || to.trim() === '') {
      logger.error('SMS send failed: Invalid recipient phone number format', {
        type: typeof to,
        isEmpty: to === '' || (typeof to === 'string' && to.trim() === '')
      });
      throw new Error('Invalid recipient phone number format');
    }

    // Log attempt (HIPAA compliant)
    logger.info('Attempting to send SMS', {
      phoneHash: hashPhoneNumber(to),
      phoneLast4: getPhoneLast4(to),
      messageLength: message ? message.length : 0,
      organizationId: options.organizationId || 'default'
    });

    // Use new SMS service
    const result = await smsSend(to, message, {
      db: dbConnection,
      organizationId: options.organizationId,
      from: options.from
    });

    if (result.status === 'failed') {
      logger.error('SMS send failed', {
        phoneHash: hashPhoneNumber(to),
        phoneLast4: getPhoneLast4(to),
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        provider: result.provider
      });
      throw new Error(result.errorMessage || 'SMS send failed');
    }

    logger.info('SMS sent successfully', {
      sid: result.sid,
      phoneHash: hashPhoneNumber(to),
      phoneLast4: getPhoneLast4(to),
      provider: result.provider,
      fromNumber: result.fromNumber,
      failedOver: result.failedOver || false
    });

    return {
      sid: result.sid,
      status: result.status,
      provider: result.provider,
      fromNumber: result.fromNumber
    };
  } catch (error) {
    logger.error('SMS send failed', {
      error: error.message,
      phoneHash: hashPhoneNumber(to),
      phoneLast4: getPhoneLast4(to)
    });
    throw error;
  }
}

/**
 * Send bulk SMS messages
 *
 * @param {string[]} recipients - Array of phone numbers
 * @param {string} message - Message content
 * @param {Object} [options] - Additional options
 * @param {string} [options.organizationId] - Organization UUID
 * @returns {Promise<Array<{recipient: string, success: boolean, result?: Object, error?: string}>>}
 */
async function sendBulkSMS(recipients, message, options = {}) {
  const results = [];

  for (const recipient of recipients) {
    try {
      const result = await sendSMS(recipient, message, options);
      results.push({ recipient, success: true, result });
    } catch (error) {
      results.push({ recipient, success: false, error: error.message });
    }

    // Rate limiting - 100ms between messages
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Get SMS service instance
 * @returns {SMSService}
 */
function getService() {
  return getSMSService(dbConnection);
}

module.exports = {
  sendSMS,
  sendBulkSMS,
  setDatabase,
  getService
};
