/**
 * SMS Provider Types and Interfaces
 *
 * Defines the contract for SMS providers (Twilio, Telnyx, etc.)
 * enabling provider-agnostic SMS operations with failover support.
 */

/**
 * @typedef {Object} SMSResult
 * @property {string} sid - Message ID from provider
 * @property {string} status - Message status (queued, sent, delivered, failed)
 * @property {string} provider - Provider that sent the message
 * @property {string} [errorCode] - Error code if failed
 * @property {string} [errorMessage] - Error message if failed
 */

/**
 * @typedef {Object} SMSProviderConfig
 * @property {string} provider - Provider name ('twilio' or 'telnyx')
 * @property {string} accountSid - Account identifier
 * @property {string} authToken - Authentication token
 * @property {string[]} phoneNumbers - Available phone numbers for this org
 * @property {Object} [options] - Provider-specific options
 */

/**
 * @typedef {Object} OrganizationSMSConfig
 * @property {string} provider - Primary provider name
 * @property {string[]} phoneNumbers - Primary phone numbers
 * @property {string} [failoverProvider] - Failover provider name
 * @property {string[]} [failoverNumbers] - Failover phone numbers
 * @property {boolean} [stickyNumber] - Use same number for same recipient (default: true)
 */

/**
 * Error codes for SMS operations
 */
const SMSErrorCodes = {
  INVALID_NUMBER: 'INVALID_NUMBER',
  NUMBER_BLOCKED: 'NUMBER_BLOCKED',
  CARRIER_VIOLATION: 'CARRIER_VIOLATION',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_CONTENT: 'INVALID_CONTENT',
  UNDELIVERABLE: 'UNDELIVERABLE',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Errors that should trigger failover to backup provider
 */
const FAILOVER_ERRORS = [
  SMSErrorCodes.NUMBER_BLOCKED,
  SMSErrorCodes.CARRIER_VIOLATION,
  SMSErrorCodes.RATE_LIMITED,
  SMSErrorCodes.PROVIDER_ERROR,
  SMSErrorCodes.NETWORK_ERROR
];

/**
 * Errors that should NOT trigger failover (recipient issue, not provider)
 */
const NO_FAILOVER_ERRORS = [
  SMSErrorCodes.INVALID_NUMBER,
  SMSErrorCodes.INVALID_CONTENT,
  SMSErrorCodes.UNDELIVERABLE
];

module.exports = {
  SMSErrorCodes,
  FAILOVER_ERRORS,
  NO_FAILOVER_ERRORS
};
