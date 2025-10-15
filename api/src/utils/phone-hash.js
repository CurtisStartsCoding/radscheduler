const crypto = require('crypto');

/**
 * Phone number hashing utility for HIPAA compliance
 * Uses SHA-256 to hash phone numbers before storage and logging
 */

/**
 * Hash a phone number using SHA-256
 * @param {string} phoneNumber - The phone number to hash
 * @returns {string} - The hashed phone number (64 character hex string)
 */
function hashPhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    return null;
  }

  // Normalize phone number (remove spaces, dashes, parentheses)
  const normalized = phoneNumber.toString().replace(/[\s\-\(\)]/g, '');

  // Create SHA-256 hash
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex');
}

/**
 * Get last 4 digits of phone number for display purposes
 * Safe to use in logs as it doesn't uniquely identify
 * @param {string} phoneNumber - The phone number
 * @returns {string} - Last 4 digits (e.g., "****1234")
 */
function getPhoneLast4(phoneNumber) {
  if (!phoneNumber) {
    return '****';
  }

  const normalized = phoneNumber.toString().replace(/[\s\-\(\)]/g, '');
  const last4 = normalized.slice(-4);
  return `****${last4}`;
}

/**
 * Create a safe log object for phone numbers
 * @param {string} phoneNumber - The phone number
 * @returns {object} - Object with hash and last4
 */
function createPhoneLogObject(phoneNumber) {
  return {
    hash: hashPhoneNumber(phoneNumber),
    last4: getPhoneLast4(phoneNumber)
  };
}

module.exports = {
  hashPhoneNumber,
  getPhoneLast4,
  createPhoneLogObject
};
