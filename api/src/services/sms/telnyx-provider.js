/**
 * Telnyx SMS Provider (Stub)
 *
 * Implementation of SMS provider interface for Telnyx.
 * Currently stubbed - will be implemented when Telnyx account is available.
 *
 * Telnyx API Reference: https://developers.telnyx.com/docs/api/v2/messaging
 *
 * To implement:
 * 1. npm install telnyx
 * 2. Get API Key from https://portal.telnyx.com
 * 3. Configure messaging profile
 * 4. Update this file with actual implementation
 */

const BaseSMSProvider = require('./base-provider');
const { SMSErrorCodes } = require('./types');
const logger = require('../../utils/logger');

// Telnyx error code mappings (to be populated when implementing)
const TELNYX_ERROR_MAP = {
  // Invalid number errors
  40001: SMSErrorCodes.INVALID_NUMBER,
  40002: SMSErrorCodes.INVALID_NUMBER,

  // Blocked/filtered errors
  40300: SMSErrorCodes.NUMBER_BLOCKED,
  40310: SMSErrorCodes.CARRIER_VIOLATION,

  // Rate limiting
  42900: SMSErrorCodes.RATE_LIMITED,

  // Provider errors
  50000: SMSErrorCodes.PROVIDER_ERROR,
  50001: SMSErrorCodes.NETWORK_ERROR
};

class TelnyxProvider extends BaseSMSProvider {
  /**
   * @param {Object} config
   * @param {string} config.apiKey - Telnyx API Key
   * @param {string} config.messagingProfileId - Telnyx Messaging Profile ID
   */
  constructor(config = {}) {
    super('telnyx', config);
    this.client = null;
  }

  /**
   * Initialize Telnyx client
   * @returns {boolean}
   */
  initialize() {
    const apiKey = this.config.apiKey || process.env.TELNYX_API_KEY;
    const messagingProfileId = this.config.messagingProfileId || process.env.TELNYX_MESSAGING_PROFILE_ID;

    if (!apiKey) {
      logger.info('Telnyx API key not configured - provider disabled (stub mode)');
      this.enabled = false;
      return false;
    }

    try {
      // TODO: Uncomment when telnyx package is installed
      // const Telnyx = require('telnyx');
      // this.client = Telnyx(apiKey);
      // this.messagingProfileId = messagingProfileId;
      // this.enabled = true;

      // For now, stub mode
      logger.info('Telnyx provider initialized in stub mode');
      this.enabled = false;
      return false;
    } catch (error) {
      logger.error('Failed to initialize Telnyx provider', { error: error.message });
      this.enabled = false;
      return false;
    }
  }

  /**
   * Send SMS via Telnyx
   * @param {string} to - Recipient phone number
   * @param {string} message - Message content
   * @param {string} from - Sender phone number
   * @returns {Promise<SMSResult>}
   */
  async sendSMS(to, message, from) {
    if (!this.enabled || !this.client) {
      // Return stub response for testing
      logger.info('Telnyx SMS (stub mode)', {
        to: to?.slice(-4),
        messageLength: message?.length
      });

      return this.createErrorResult(
        new Error('Telnyx provider not configured - running in stub mode'),
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
      // TODO: Actual Telnyx implementation
      // const result = await this.client.messages.create({
      //   from: normalizedFrom,
      //   to: normalizedTo,
      //   text: message,
      //   messaging_profile_id: this.messagingProfileId
      // });
      //
      // return this.createSuccessResult(result.data.id, 'queued');

      // Stub response
      return this.createErrorResult(
        new Error('Telnyx not implemented'),
        SMSErrorCodes.PROVIDER_ERROR
      );
    } catch (error) {
      const errorCode = this.mapErrorCode(error);

      logger.error('Telnyx SMS failed', {
        errorCode,
        message: error.message,
        to: normalizedTo.slice(-4)
      });

      return this.createErrorResult(error, errorCode);
    }
  }

  /**
   * Map Telnyx error codes to standard error codes
   * @param {Error} error
   * @returns {string}
   */
  mapErrorCode(error) {
    // Telnyx errors typically have a code property
    if (error.code && TELNYX_ERROR_MAP[error.code]) {
      return TELNYX_ERROR_MAP[error.code];
    }

    const msg = error.message?.toLowerCase() || '';

    if (msg.includes('invalid') && msg.includes('number')) {
      return SMSErrorCodes.INVALID_NUMBER;
    }
    if (msg.includes('blocked') || msg.includes('reject')) {
      return SMSErrorCodes.NUMBER_BLOCKED;
    }
    if (msg.includes('rate') || msg.includes('limit')) {
      return SMSErrorCodes.RATE_LIMITED;
    }

    return SMSErrorCodes.UNKNOWN;
  }

  /**
   * Get message status from Telnyx
   * @param {string} id - Message ID
   * @returns {Promise<Object>}
   */
  async getMessageStatus(id) {
    if (!this.enabled || !this.client) {
      throw new Error('Telnyx provider not configured');
    }

    // TODO: Implement when Telnyx is configured
    // const message = await this.client.messages.retrieve(id);
    // return {
    //   id: message.data.id,
    //   status: message.data.to[0].status,
    //   ...
    // };

    throw new Error('Telnyx getMessageStatus not implemented');
  }
}

module.exports = TelnyxProvider;
