/**
 * SMS Service
 *
 * Main service for sending SMS messages with:
 * - Multi-provider support (Twilio, Telnyx)
 * - Automatic failover on provider errors
 * - Per-organization configuration
 * - Sticky sender (same number for same recipient)
 * - Number pooling for throughput
 */

const TwilioProvider = require('./twilio-provider');
const TelnyxProvider = require('./telnyx-provider');
const { SMSErrorCodes, FAILOVER_ERRORS, NO_FAILOVER_ERRORS } = require('./types');
const logger = require('../../utils/logger');
const { hashPhoneNumber, getPhoneLast4 } = require('../../utils/phone-hash');

// Provider registry
const PROVIDERS = {
  twilio: TwilioProvider,
  telnyx: TelnyxProvider
};

// Cache for initialized providers
const providerCache = new Map();

// Cache for sticky sender mapping (phoneHash -> fromNumber)
const stickySenderCache = new Map();

/**
 * Get or create a provider instance
 * @param {string} providerName
 * @param {Object} config
 * @returns {BaseSMSProvider}
 */
function getProvider(providerName, config = {}) {
  const cacheKey = `${providerName}-${JSON.stringify(config)}`;

  if (providerCache.has(cacheKey)) {
    return providerCache.get(cacheKey);
  }

  const ProviderClass = PROVIDERS[providerName];
  if (!ProviderClass) {
    throw new Error(`Unknown SMS provider: ${providerName}`);
  }

  const provider = new ProviderClass(config);
  provider.initialize();
  providerCache.set(cacheKey, provider);

  return provider;
}

/**
 * Get SMS configuration for an organization
 * @param {Object} db - Database connection
 * @param {string} organizationId - Organization UUID
 * @returns {Promise<OrganizationSMSConfig|null>}
 */
async function getOrganizationSMSConfig(db, organizationId) {
  if (!organizationId) {
    // Return default config from environment
    return getDefaultConfig();
  }

  try {
    const result = await db.query(
      `SELECT setting_value FROM organization_settings
       WHERE organization_id = $1 AND setting_key = 'sms_config'`,
      [organizationId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].setting_value;
    }

    // Fall back to default config
    return getDefaultConfig();
  } catch (error) {
    logger.error('Failed to get organization SMS config', {
      organizationId,
      error: error.message
    });
    return getDefaultConfig();
  }
}

/**
 * Get default SMS configuration from environment
 * @returns {OrganizationSMSConfig}
 */
function getDefaultConfig() {
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  return {
    provider: 'twilio',
    phoneNumbers: phoneNumber ? [phoneNumber] : [],
    failoverProvider: process.env.TELNYX_API_KEY ? 'telnyx' : null,
    failoverNumbers: process.env.TELNYX_PHONE_NUMBER
      ? [process.env.TELNYX_PHONE_NUMBER]
      : [],
    stickyNumber: true
  };
}

/**
 * Select a phone number for sending
 * Uses sticky sender if enabled, otherwise round-robin
 * @param {string[]} phoneNumbers - Available numbers
 * @param {string} recipientPhone - Recipient phone (for sticky)
 * @param {boolean} sticky - Use sticky sender
 * @returns {string}
 */
function selectFromNumber(phoneNumbers, recipientPhone, sticky = true) {
  if (!phoneNumbers || phoneNumbers.length === 0) {
    throw new Error('No phone numbers configured');
  }

  if (phoneNumbers.length === 1) {
    return phoneNumbers[0];
  }

  if (sticky && recipientPhone) {
    const phoneHash = hashPhoneNumber(recipientPhone);
    const cached = stickySenderCache.get(phoneHash);

    if (cached && phoneNumbers.includes(cached)) {
      return cached;
    }

    // Hash-based selection for consistent mapping
    const hash = phoneHash.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    const index = hash % phoneNumbers.length;
    const selected = phoneNumbers[index];

    stickySenderCache.set(phoneHash, selected);
    return selected;
  }

  // Round-robin fallback
  const index = Math.floor(Math.random() * phoneNumbers.length);
  return phoneNumbers[index];
}

/**
 * Determine if error should trigger failover
 * @param {string} errorCode
 * @returns {boolean}
 */
function shouldFailover(errorCode) {
  if (NO_FAILOVER_ERRORS.includes(errorCode)) {
    return false;
  }
  return FAILOVER_ERRORS.includes(errorCode);
}

/**
 * SMS Service Class
 */
class SMSService {
  /**
   * @param {Object} db - Database connection pool
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Send SMS with automatic failover
   * @param {Object} options
   * @param {string} options.to - Recipient phone number
   * @param {string} options.message - Message content
   * @param {string} [options.organizationId] - Organization UUID
   * @param {string} [options.from] - Override sender number
   * @returns {Promise<SMSResult>}
   */
  async sendSMS({ to, message, organizationId, from }) {
    const phoneHash = hashPhoneNumber(to);
    const phoneLast4 = getPhoneLast4(to);

    logger.info('SMS send request', {
      phoneHash,
      phoneLast4,
      organizationId,
      messageLength: message?.length
    });

    // Get organization config
    const config = await getOrganizationSMSConfig(this.db, organizationId);

    if (!config || !config.provider) {
      logger.error('No SMS configuration found', { organizationId });
      return {
        sid: null,
        status: 'failed',
        provider: null,
        errorCode: SMSErrorCodes.PROVIDER_ERROR,
        errorMessage: 'No SMS provider configured'
      };
    }

    // Select from number
    const fromNumber = from || selectFromNumber(
      config.phoneNumbers,
      to,
      config.stickyNumber !== false
    );

    // Get primary provider
    const primaryProvider = getProvider(config.provider);

    // Try primary provider
    let result = await primaryProvider.sendSMS(to, message, fromNumber);

    // Log the attempt
    await this.logSMSAttempt({
      organizationId,
      phoneHash,
      provider: config.provider,
      fromNumber,
      success: result.status !== 'failed',
      errorCode: result.errorCode,
      sid: result.sid
    });

    // Check if we should failover
    if (result.status === 'failed' && shouldFailover(result.errorCode)) {
      if (config.failoverProvider && config.failoverNumbers?.length > 0) {
        logger.warn('Primary SMS failed, attempting failover', {
          primaryProvider: config.provider,
          failoverProvider: config.failoverProvider,
          errorCode: result.errorCode,
          phoneHash
        });

        const failoverFromNumber = selectFromNumber(
          config.failoverNumbers,
          to,
          config.stickyNumber !== false
        );

        const failoverProvider = getProvider(config.failoverProvider);
        const failoverResult = await failoverProvider.sendSMS(to, message, failoverFromNumber);

        // Log failover attempt
        await this.logSMSAttempt({
          organizationId,
          phoneHash,
          provider: config.failoverProvider,
          fromNumber: failoverFromNumber,
          success: failoverResult.status !== 'failed',
          errorCode: failoverResult.errorCode,
          sid: failoverResult.sid,
          isFailover: true
        });

        if (failoverResult.status !== 'failed') {
          logger.info('Failover SMS succeeded', {
            phoneHash,
            provider: config.failoverProvider,
            sid: failoverResult.sid
          });
          return {
            ...failoverResult,
            fromNumber: failoverFromNumber,
            failedOver: true,
            originalError: result.errorCode
          };
        }

        // Both failed
        logger.error('Both primary and failover SMS failed', {
          phoneHash,
          primaryError: result.errorCode,
          failoverError: failoverResult.errorCode
        });
      }
    }

    return {
      ...result,
      fromNumber
    };
  }

  /**
   * Send bulk SMS messages
   * @param {Array<{to: string, message: string}>} messages
   * @param {string} organizationId
   * @param {number} delayMs - Delay between messages (rate limiting)
   * @returns {Promise<Array<SMSResult>>}
   */
  async sendBulkSMS(messages, organizationId, delayMs = 100) {
    const results = [];

    for (const msg of messages) {
      const result = await this.sendSMS({
        to: msg.to,
        message: msg.message,
        organizationId
      });
      results.push(result);

      // Rate limiting delay
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Log SMS attempt to audit table
   * @private
   */
  async logSMSAttempt({
    organizationId,
    phoneHash,
    provider,
    fromNumber,
    success,
    errorCode,
    sid,
    isFailover = false
  }) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO sms_audit_log
         (organization_id, phone_hash, message_type, message_direction,
          from_number, twilio_sid, success, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          organizationId,
          phoneHash,
          isFailover ? 'OUTBOUND_FAILOVER' : 'OUTBOUND',
          'OUTBOUND',
          fromNumber,
          sid,
          success,
          errorCode || null
        ]
      );
    } catch (error) {
      logger.error('Failed to log SMS attempt', { error: error.message });
    }
  }

  /**
   * Get available providers
   * @returns {string[]}
   */
  static getAvailableProviders() {
    return Object.keys(PROVIDERS);
  }

  /**
   * Check if a provider is configured
   * @param {string} providerName
   * @returns {boolean}
   */
  static isProviderConfigured(providerName) {
    try {
      const provider = getProvider(providerName);
      return provider.isEnabled();
    } catch {
      return false;
    }
  }

  /**
   * Clear provider cache (useful for testing)
   */
  static clearCache() {
    providerCache.clear();
    stickySenderCache.clear();
  }
}

// Singleton instance for backward compatibility
let defaultInstance = null;

/**
 * Get default SMS service instance
 * @param {Object} db - Database connection
 * @returns {SMSService}
 */
function getSMSService(db) {
  if (!defaultInstance) {
    defaultInstance = new SMSService(db);
  }
  return defaultInstance;
}

/**
 * Simple send function for backward compatibility
 * @param {string} to
 * @param {string} message
 * @param {Object} options
 * @returns {Promise<SMSResult>}
 */
async function sendSMS(to, message, options = {}) {
  const service = getSMSService(options.db);
  return service.sendSMS({
    to,
    message,
    organizationId: options.organizationId,
    from: options.from
  });
}

module.exports = {
  SMSService,
  getSMSService,
  sendSMS,
  getProvider,
  getOrganizationSMSConfig,
  getDefaultConfig,
  selectFromNumber,
  shouldFailover
};
