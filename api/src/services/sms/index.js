/**
 * SMS Module
 *
 * Multi-provider SMS service with failover support.
 *
 * Usage:
 *   const { SMSService, sendSMS } = require('./services/sms');
 *
 *   // Simple usage (backward compatible)
 *   await sendSMS('+1234567890', 'Hello!', { organizationId: 'uuid' });
 *
 *   // Full service usage
 *   const smsService = new SMSService(db);
 *   await smsService.sendSMS({
 *     to: '+1234567890',
 *     message: 'Hello!',
 *     organizationId: 'uuid'
 *   });
 */

const {
  SMSService,
  getSMSService,
  sendSMS,
  getProvider,
  getOrganizationSMSConfig,
  getDefaultConfig,
  selectFromNumber,
  shouldFailover
} = require('./sms-service');

const TwilioProvider = require('./twilio-provider');
const TelnyxProvider = require('./telnyx-provider');
const BaseSMSProvider = require('./base-provider');
const { SMSErrorCodes, FAILOVER_ERRORS, NO_FAILOVER_ERRORS } = require('./types');

module.exports = {
  // Main service
  SMSService,
  getSMSService,
  sendSMS,

  // Providers
  TwilioProvider,
  TelnyxProvider,
  BaseSMSProvider,
  getProvider,

  // Configuration
  getOrganizationSMSConfig,
  getDefaultConfig,

  // Utilities
  selectFromNumber,
  shouldFailover,

  // Types
  SMSErrorCodes,
  FAILOVER_ERRORS,
  NO_FAILOVER_ERRORS
};
