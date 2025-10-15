const { getPool } = require('../db/connection');
const logger = require('../utils/logger');
const { hashPhoneNumber } = require('../utils/phone-hash');
const { logSMSInteraction, CONSENT_STATUS } = require('./sms-audit');

/**
 * Patient Consent Management Service
 * HIPAA-compliant consent tracking with hashed phone numbers
 * Handles opt-ins, opt-outs, and consent verification
 */

/**
 * Consent methods
 */
const CONSENT_METHODS = {
  SMS_REPLY: 'SMS_REPLY',
  WEB_FORM: 'WEB_FORM',
  VERBAL: 'VERBAL',
  INITIAL_ORDER: 'INITIAL_ORDER'
};

/**
 * Check if patient has consented to SMS communications
 * @param {string} phoneNumber - Plain text phone number
 * @returns {Promise<boolean>} - True if consented and not revoked
 */
async function hasConsent(phoneNumber) {
  const pool = getPool();

  try {
    const phoneHash = hashPhoneNumber(phoneNumber);

    const result = await pool.query(
      `SELECT consent_given, revoked_at
       FROM patient_sms_consents
       WHERE phone_hash = $1`,
      [phoneHash]
    );

    if (result.rows.length === 0) {
      return false; // No consent record exists
    }

    const consent = result.rows[0];
    return consent.consent_given && !consent.revoked_at;
  } catch (error) {
    logger.error('Failed to check consent status', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get detailed consent information for a phone number
 * @param {string} phoneNumber - Plain text phone number
 * @returns {Promise<Object|null>} - Consent record or null if not found
 */
async function getConsentInfo(phoneNumber) {
  const pool = getPool();

  try {
    const phoneHash = hashPhoneNumber(phoneNumber);

    const result = await pool.query(
      `SELECT id, phone_hash, consent_given, consent_timestamp,
              consent_method, revoked_at, revocation_reason, created_at, updated_at
       FROM patient_sms_consents
       WHERE phone_hash = $1`,
      [phoneHash]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    logger.error('Failed to get consent info', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Record patient consent to receive SMS communications
 * @param {string} phoneNumber - Plain text phone number
 * @param {string} consentMethod - How consent was obtained (use CONSENT_METHODS)
 * @returns {Promise<Object>} - Created consent record
 */
async function recordConsent(phoneNumber, consentMethod = CONSENT_METHODS.SMS_REPLY) {
  const pool = getPool();

  try {
    const phoneHash = hashPhoneNumber(phoneNumber);

    const result = await pool.query(
      `INSERT INTO patient_sms_consents
       (phone_hash, consent_given, consent_timestamp, consent_method)
       VALUES ($1, true, CURRENT_TIMESTAMP, $2)
       ON CONFLICT (phone_hash)
       DO UPDATE SET
         consent_given = true,
         consent_timestamp = CURRENT_TIMESTAMP,
         consent_method = $2,
         revoked_at = NULL,
         revocation_reason = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [phoneHash, consentMethod]
    );

    const consent = result.rows[0];

    // Audit log the consent
    await logSMSInteraction({
      phoneNumber,
      messageType: 'CONSENT_GRANTED',
      messageDirection: 'INBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED
    });

    logger.info('Patient consent recorded', {
      phoneHash,
      consentMethod,
      consentId: consent.id
    });

    return consent;
  } catch (error) {
    logger.error('Failed to record consent', {
      error: error.message,
      consentMethod
    });
    throw error;
  }
}

/**
 * Revoke patient consent (opt-out / STOP)
 * @param {string} phoneNumber - Plain text phone number
 * @param {string} reason - Reason for revocation
 * @returns {Promise<Object>} - Updated consent record
 */
async function revokeConsent(phoneNumber, reason = 'Patient opted out via SMS STOP') {
  const pool = getPool();

  try {
    const phoneHash = hashPhoneNumber(phoneNumber);

    const result = await pool.query(
      `UPDATE patient_sms_consents
       SET consent_given = false,
           revoked_at = CURRENT_TIMESTAMP,
           revocation_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE phone_hash = $1
       RETURNING *`,
      [phoneHash, reason]
    );

    if (result.rows.length === 0) {
      // Create a revoked consent record if none exists
      const insertResult = await pool.query(
        `INSERT INTO patient_sms_consents
         (phone_hash, consent_given, consent_timestamp, consent_method,
          revoked_at, revocation_reason)
         VALUES ($1, false, CURRENT_TIMESTAMP, 'REVOKED', CURRENT_TIMESTAMP, $2)
         RETURNING *`,
        [phoneHash, reason]
      );

      const consent = insertResult.rows[0];

      // Audit log the revocation
      await logSMSInteraction({
        phoneNumber,
        messageType: 'CONSENT_REVOKED',
        messageDirection: 'INBOUND',
        consentStatus: CONSENT_STATUS.REVOKED
      });

      logger.warn('Patient consent revoked (new record)', {
        phoneHash,
        reason,
        consentId: consent.id
      });

      return consent;
    }

    const consent = result.rows[0];

    // Audit log the revocation
    await logSMSInteraction({
      phoneNumber,
      messageType: 'CONSENT_REVOKED',
      messageDirection: 'INBOUND',
      consentStatus: CONSENT_STATUS.REVOKED
    });

    logger.warn('Patient consent revoked', {
      phoneHash,
      reason,
      consentId: consent.id
    });

    return consent;
  } catch (error) {
    logger.error('Failed to revoke consent', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Check consent and throw error if not consented
 * Useful for enforcing consent before sending SMS
 * @param {string} phoneNumber - Plain text phone number
 * @throws {Error} - If consent not given
 */
async function requireConsent(phoneNumber) {
  const consented = await hasConsent(phoneNumber);

  if (!consented) {
    const error = new Error('Patient has not consented to SMS communications');
    error.code = 'NO_CONSENT';
    throw error;
  }
}

/**
 * Get consent statistics for reporting
 * @returns {Promise<Object>} - Statistics object
 */
async function getConsentStats() {
  const pool = getPool();

  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) as total_records,
         SUM(CASE WHEN consent_given AND revoked_at IS NULL THEN 1 ELSE 0 END) as active_consents,
         SUM(CASE WHEN NOT consent_given OR revoked_at IS NOT NULL THEN 1 ELSE 0 END) as revoked_consents,
         COUNT(DISTINCT consent_method) as consent_methods_used
       FROM patient_sms_consents`
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to get consent statistics', {
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  hasConsent,
  getConsentInfo,
  recordConsent,
  revokeConsent,
  requireConsent,
  getConsentStats,
  CONSENT_METHODS
};
