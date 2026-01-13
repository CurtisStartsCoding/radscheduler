/**
 * Base SMS Provider
 *
 * Abstract base class defining the interface all SMS providers must implement.
 * Provides common functionality and enforces consistent behavior.
 */

const { SMSErrorCodes } = require('./types');

class BaseSMSProvider {
  /**
   * @param {string} name - Provider name for logging
   * @param {Object} config - Provider configuration
   */
  constructor(name, config) {
    if (new.target === BaseSMSProvider) {
      throw new Error('BaseSMSProvider is abstract and cannot be instantiated directly');
    }
    this.name = name;
    this.config = config;
    this.enabled = false;
  }

  /**
   * Initialize the provider with credentials
   * @returns {boolean} - Whether initialization was successful
   */
  initialize() {
    throw new Error('Subclass must implement initialize()');
  }

  /**
   * Send an SMS message
   * @param {string} to - Recipient phone number (E.164 format)
   * @param {string} message - Message content
   * @param {string} from - Sender phone number
   * @returns {Promise<SMSResult>}
   */
  async sendSMS(to, message, from) {
    throw new Error('Subclass must implement sendSMS()');
  }

  /**
   * Check if provider is enabled and configured
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    return this.name;
  }

  /**
   * Validate phone number format (E.164)
   * @param {string} phoneNumber
   * @returns {boolean}
   */
  validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return false;
    }
    // E.164: + followed by 1-15 digits
    return /^\+[1-9]\d{1,14}$/.test(phoneNumber.trim());
  }

  /**
   * Normalize phone number to E.164 format
   * @param {string} phoneNumber
   * @returns {string|null}
   */
  normalizePhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;

    // Remove all non-digit characters except leading +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '');

    // If no +, assume US number and add +1
    if (!cleaned.startsWith('+')) {
      // Remove leading 1 if present (US)
      if (cleaned.startsWith('1') && cleaned.length === 11) {
        cleaned = '+' + cleaned;
      } else if (cleaned.length === 10) {
        cleaned = '+1' + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }

    return this.validatePhoneNumber(cleaned) ? cleaned : null;
  }

  /**
   * Map provider-specific error to standard error code
   * @param {Error} error - Provider error
   * @returns {string} - SMSErrorCode
   */
  mapErrorCode(error) {
    // Subclasses should override with provider-specific mapping
    return SMSErrorCodes.UNKNOWN;
  }

  /**
   * Create standardized error result
   * @param {Error} error
   * @param {string} errorCode
   * @returns {SMSResult}
   */
  createErrorResult(error, errorCode) {
    return {
      sid: null,
      status: 'failed',
      provider: this.name,
      errorCode: errorCode || this.mapErrorCode(error),
      errorMessage: error.message
    };
  }

  /**
   * Create standardized success result
   * @param {string} sid - Message ID
   * @param {string} status - Message status
   * @returns {SMSResult}
   */
  createSuccessResult(sid, status = 'queued') {
    return {
      sid,
      status,
      provider: this.name,
      errorCode: null,
      errorMessage: null
    };
  }
}

module.exports = BaseSMSProvider;
