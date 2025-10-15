const { pool } = require('../db/connection');
const logger = require('../utils/logger');
const { hashPhoneNumber } = require('../utils/phone-hash');

/**
 * SMS Audit Service - HIPAA Compliant
 * Logs ALL SMS interactions for 7-year retention
 * NEVER stores message content with PHI
 * All phone numbers are SHA-256 hashed
 */

/**
 * Message types for audit logging
 */
const MESSAGE_TYPES = {
  OUTBOUND_CONSENT: 'OUTBOUND_CONSENT',
  INBOUND_CONSENT_YES: 'INBOUND_CONSENT_YES',
  INBOUND_CONSENT_NO: 'INBOUND_CONSENT_NO',
  INBOUND_STOP: 'INBOUND_STOP',
  OUTBOUND_ORDER_LIST: 'OUTBOUND_ORDER_LIST',
  INBOUND_ORDER_SELECTION: 'INBOUND_ORDER_SELECTION',
  OUTBOUND_LOCATION_LIST: 'OUTBOUND_LOCATION_LIST',
  INBOUND_LOCATION_SELECTION: 'INBOUND_LOCATION_SELECTION',
  OUTBOUND_TIME_SLOTS: 'OUTBOUND_TIME_SLOTS',
  INBOUND_TIME_SELECTION: 'INBOUND_TIME_SELECTION',
  OUTBOUND_CONFIRMATION: 'OUTBOUND_CONFIRMATION',
  OUTBOUND_ERROR: 'OUTBOUND_ERROR',
  INBOUND_UNKNOWN: 'INBOUND_UNKNOWN'
};

/**
 * Consent statuses
 */
const CONSENT_STATUS = {
  CONSENTED: 'CONSENTED',
  NOT_CONSENTED: 'NOT_CONSENTED',
  REVOKED: 'REVOKED',
  PENDING: 'PENDING'
};

/**
 * Log an SMS interaction to the audit table
 * @param {Object} params - Audit log parameters
 * @param {string} params.phoneNumber - Plain text phone number (will be hashed)
 * @param {string} params.messageType - Type of message (use MESSAGE_TYPES constants)
 * @param {string} params.messageDirection - 'INBOUND' or 'OUTBOUND'
 * @param {string} params.consentStatus - Consent status (use CONSENT_STATUS constants)
 * @param {string} params.sessionId - Optional session/conversation ID
 * @param {string} params.twilioSid - Optional Twilio message SID
 * @param {boolean} params.success - Whether the operation succeeded
 * @param {string} params.errorMessage - Optional error message if failed
 * @returns {Promise<void>}
 */
async function logSMSInteraction({
  phoneNumber,
  messageType,
  messageDirection,
  consentStatus = null,
  sessionId = null,
  twilioSid = null,
  success = true,
  errorMessage = null
}) {
  try {
    const phoneHash = hashPhoneNumber(phoneNumber);

    await pool.query(
      `INSERT INTO sms_audit_log
       (phone_hash, message_type, message_direction, consent_status,
        session_id, twilio_sid, success, error_message, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
      [
        phoneHash,
        messageType,
        messageDirection,
        consentStatus,
        sessionId,
        twilioSid,
        success,
        errorMessage
      ]
    );

    logger.info('SMS interaction logged to audit trail', {
      phoneHash,
      messageType,
      messageDirection,
      consentStatus,
      success
    });
  } catch (error) {
    // CRITICAL: Audit logging failure must be logged but not thrown
    // We don't want to block SMS operations if audit fails
    logger.error('CRITICAL: Failed to log SMS interaction to audit trail', {
      error: error.message,
      stack: error.stack,
      messageType,
      messageDirection
    });
  }
}

/**
 * Get audit log for a specific phone number (hashed)
 * @param {string} phoneNumber - Plain text phone number
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} - Audit log entries
 */
async function getAuditLogForPhone(phoneNumber, limit = 100) {
  try {
    const phoneHash = hashPhoneNumber(phoneNumber);

    const result = await pool.query(
      `SELECT id, message_type, message_direction, consent_status,
              session_id, twilio_sid, success, error_message, timestamp
       FROM sms_audit_log
       WHERE phone_hash = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [phoneHash, limit]
    );

    return result.rows;
  } catch (error) {
    logger.error('Failed to retrieve audit log', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get audit statistics for reporting
 * @param {Date} startDate - Start date for stats
 * @param {Date} endDate - End date for stats
 * @returns {Promise<Object>} - Statistics object
 */
async function getAuditStats(startDate, endDate) {
  try {
    const result = await pool.query(
      `SELECT
         message_type,
         message_direction,
         COUNT(*) as count,
         SUM(CASE WHEN success THEN 1 ELSE 0 END) as success_count,
         SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failure_count
       FROM sms_audit_log
       WHERE timestamp BETWEEN $1 AND $2
       GROUP BY message_type, message_direction
       ORDER BY count DESC`,
      [startDate, endDate]
    );

    return result.rows;
  } catch (error) {
    logger.error('Failed to retrieve audit statistics', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Clean up audit logs older than retention period (7 years for HIPAA)
 * Should be run periodically via cron job
 * @returns {Promise<number>} - Number of records deleted
 */
async function cleanupOldAuditLogs() {
  try {
    const retentionDays = parseInt(process.env.SMS_AUDIT_RETENTION_DAYS) || 2555; // 7 years default

    const result = await pool.query(
      `DELETE FROM sms_audit_log
       WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '1 day' * $1`,
      [retentionDays]
    );

    const deletedCount = result.rowCount;

    if (deletedCount > 0) {
      logger.info('Cleaned up old audit logs', {
        deletedCount,
        retentionDays
      });
    }

    return deletedCount;
  } catch (error) {
    logger.error('Failed to cleanup old audit logs', {
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  logSMSInteraction,
  getAuditLogForPhone,
  getAuditStats,
  cleanupOldAuditLogs,
  MESSAGE_TYPES,
  CONSENT_STATUS
};
