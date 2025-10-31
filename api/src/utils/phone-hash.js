const crypto = require('crypto');

/**
 * Phone number hashing and encryption utility for HIPAA compliance
 * - Uses SHA-256 to hash phone numbers for lookups
 * - Uses AES-256-GCM to encrypt phone numbers for secure storage
 */

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const ENCRYPTION_KEY = process.env.PHONE_ENCRYPTION_KEY || 'default-key-please-change-in-production-min-32-chars';

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

/**
 * Encrypt a phone number using AES-256-GCM
 * @param {string} phoneNumber - The phone number to encrypt
 * @returns {string} - Encrypted phone number (base64 encoded)
 */
function encryptPhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    return null;
  }

  // Normalize phone number
  const normalized = phoneNumber.toString().replace(/[\s\-\(\)]/g, '');

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key from encryption key
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  let encrypted = cipher.update(normalized, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get auth tag
  const authTag = cipher.getAuthTag();

  // Combine IV + encrypted + authTag (all base64 encoded)
  const combined = Buffer.concat([
    iv,
    Buffer.from(encrypted, 'base64'),
    authTag
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt a phone number
 * @param {string} encryptedPhone - The encrypted phone number (base64 encoded)
 * @returns {string} - Decrypted phone number
 */
function decryptPhoneNumber(encryptedPhone) {
  if (!encryptedPhone) {
    return null;
  }

  try {
    // Decode from base64
    const combined = Buffer.from(encryptedPhone, 'base64');

    // Extract IV, encrypted data, and auth tag
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(combined.length - TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    // Derive key from encryption key
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt phone number:', error.message);
    return null;
  }
}

module.exports = {
  hashPhoneNumber,
  getPhoneLast4,
  createPhoneLogObject,
  encryptPhoneNumber,
  decryptPhoneNumber
};
