/**
 * Twilio SMS Provider
 *
 * Implementation of SMS provider interface for Twilio.
 * Handles all Twilio-specific API interactions and error mapping.
 */

const BaseSMSProvider = require('./base-provider');
const { SMSErrorCodes } = require('./types');
const logger = require('../../utils/logger');

// Twilio error code mappings
const TWILIO_ERROR_MAP = {
  // Invalid number errors
  21211: SMSErrorCodes.INVALID_NUMBER,
  21214: SMSErrorCodes.INVALID_NUMBER,
  21217: SMSErrorCodes.INVALID_NUMBER,
  21219: SMSErrorCodes.INVALID_NUMBER,
  21401: SMSErrorCodes.INVALID_NUMBER,
  21407: SMSErrorCodes.INVALID_NUMBER,
  21408: SMSErrorCodes.INVALID_NUMBER,
  21421: SMSErrorCodes.INVALID_NUMBER,
  21610: SMSErrorCodes.INVALID_NUMBER, // Unsubscribed

  // Blocked/filtered errors
  21612: SMSErrorCodes.NUMBER_BLOCKED,
  21614: SMSErrorCodes.NUMBER_BLOCKED,
  30003: SMSErrorCodes.UNDELIVERABLE,
  30004: SMSErrorCodes.NUMBER_BLOCKED,
  30005: SMSErrorCodes.UNDELIVERABLE,
  30006: SMSErrorCodes.NUMBER_BLOCKED,
  30007: SMSErrorCodes.CARRIER_VIOLATION,
  30008: SMSErrorCodes.UNDELIVERABLE,

  // Carrier violations
  21608: SMSErrorCodes.CARRIER_VIOLATION,
  30034: SMSErrorCodes.CARRIER_VIOLATION,

  // Rate limiting
  20429: SMSErrorCodes.RATE_LIMITED,
  88001: SMSErrorCodes.RATE_LIMITED,

  // Provider/network errors
  20500: SMSErrorCodes.PROVIDER_ERROR,
  30001: SMSErrorCodes.PROVIDER_ERROR,
  30002: SMSErrorCodes.NETWORK_ERROR,
  30009: SMSErrorCodes.NETWORK_ERROR,
  30010: SMSErrorCodes.NETWORK_ERROR,

  // Content errors
  21602: SMSErrorCodes.INVALID_CONTENT,
  21617: SMSErrorCodes.INVALID_CONTENT
};

class TwilioProvider extends BaseSMSProvider {
  /**
   * @param {Object} config
   * @param {string} config.accountSid - Twilio Account SID
   * @param {string} config.authToken - Twilio Auth Token
   */
  constructor(config = {}) {
    super('twilio', config);
    this.client = null;
  }

  /**
   * Initialize Twilio client
   * @returns {boolean}
   */
  initialize() {
    const accountSid = this.config.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = this.config.authToken || process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      logger.warn('Twilio credentials not configured');
      this.enabled = false;
      return false;
    }

    try {
      const twilio = require('twilio');
      this.client = twilio(accountSid, authToken);
      this.enabled = true;
      logger.info('Twilio provider initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Twilio provider', { error: error.message });
      this.enabled = false;
      return false;
    }
  }

  /**
   * Send SMS via Twilio
   * @param {string} to - Recipient phone number
   * @param {string} message - Message content
   * @param {string} from - Sender phone number
   * @returns {Promise<SMSResult>}
   */
  async sendSMS(to, message, from) {
    if (!this.enabled || !this.client) {
      return this.createErrorResult(
        new Error('Twilio provider not initialized'),
        SMSErrorCodes.PROVIDER_ERROR
      );
    }

    // Validate inputs
    const normalizedTo = this.normalizePhoneNumber(to);
    if (!normalizedTo) {
      return this.createErrorResult(
        new Error(`Invalid recipient number: ${to}`),
        SMSErrorCodes.INVALID_NUMBER
      );
    }

    const normalizedFrom = this.normalizePhoneNumber(from);
    if (!normalizedFrom) {
      return this.createErrorResult(
        new Error(`Invalid sender number: ${from}`),
        SMSErrorCodes.INVALID_NUMBER
      );
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return this.createErrorResult(
        new Error('Message content is required'),
        SMSErrorCodes.INVALID_CONTENT
      );
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: normalizedFrom,
        to: normalizedTo
      });

      logger.info('Twilio SMS sent', {
        sid: result.sid,
        status: result.status,
        to: normalizedTo.slice(-4) // Last 4 digits only for privacy
      });

      return this.createSuccessResult(result.sid, result.status);
    } catch (error) {
      const errorCode = this.mapErrorCode(error);

      logger.error('Twilio SMS failed', {
        errorCode,
        twilioCode: error.code,
        message: error.message,
        to: normalizedTo.slice(-4)
      });

      return this.createErrorResult(error, errorCode);
    }
  }

  /**
   * Map Twilio error codes to standard error codes
   * @param {Error} error
   * @returns {string}
   */
  mapErrorCode(error) {
    if (error.code && TWILIO_ERROR_MAP[error.code]) {
      return TWILIO_ERROR_MAP[error.code];
    }

    // Check error message patterns
    const msg = error.message?.toLowerCase() || '';

    if (msg.includes('invalid') && msg.includes('number')) {
      return SMSErrorCodes.INVALID_NUMBER;
    }
    if (msg.includes('blocked') || msg.includes('blacklist')) {
      return SMSErrorCodes.NUMBER_BLOCKED;
    }
    if (msg.includes('rate') || msg.includes('throttl')) {
      return SMSErrorCodes.RATE_LIMITED;
    }
    if (msg.includes('network') || msg.includes('timeout')) {
      return SMSErrorCodes.NETWORK_ERROR;
    }

    return SMSErrorCodes.UNKNOWN;
  }

  /**
   * Get message status from Twilio
   * @param {string} sid - Message SID
   * @returns {Promise<Object>}
   */
  async getMessageStatus(sid) {
    if (!this.enabled || !this.client) {
      throw new Error('Twilio provider not initialized');
    }

    try {
      const message = await this.client.messages(sid).fetch();
      return {
        sid: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated
      };
    } catch (error) {
      logger.error('Failed to fetch Twilio message status', {
        sid,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = TwilioProvider;
