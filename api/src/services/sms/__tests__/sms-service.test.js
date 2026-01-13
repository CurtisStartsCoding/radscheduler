/**
 * SMS Service Unit Tests
 *
 * Tests for the multi-provider SMS service with failover support.
 */

const {
  SMSService,
  getProvider,
  getDefaultConfig,
  selectFromNumber,
  shouldFailover,
  SMSErrorCodes,
  FAILOVER_ERRORS,
  NO_FAILOVER_ERRORS
} = require('../index');

// Mock the logger
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock phone-hash utils
jest.mock('../../../utils/phone-hash', () => ({
  hashPhoneNumber: jest.fn(phone => `hash_${phone}`),
  getPhoneLast4: jest.fn(phone => phone?.slice(-4) || '0000')
}));

describe('SMS Service', () => {
  beforeEach(() => {
    // Clear provider cache before each test
    SMSService.clearCache();
    jest.clearAllMocks();
  });

  describe('getDefaultConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return twilio as default provider', () => {
      process.env.TWILIO_PHONE_NUMBER = '+12345678901';
      const config = getDefaultConfig();

      expect(config.provider).toBe('twilio');
      expect(config.phoneNumbers).toContain('+12345678901');
    });

    it('should include telnyx as failover if configured', () => {
      process.env.TWILIO_PHONE_NUMBER = '+12345678901';
      process.env.TELNYX_API_KEY = 'test-key';
      process.env.TELNYX_PHONE_NUMBER = '+19876543210';

      const config = getDefaultConfig();

      expect(config.failoverProvider).toBe('telnyx');
      expect(config.failoverNumbers).toContain('+19876543210');
    });

    it('should return empty phone arrays if not configured', () => {
      delete process.env.TWILIO_PHONE_NUMBER;
      delete process.env.TELNYX_PHONE_NUMBER;

      const config = getDefaultConfig();

      expect(config.phoneNumbers).toEqual([]);
    });
  });

  describe('selectFromNumber', () => {
    it('should return single number when only one available', () => {
      const numbers = ['+12345678901'];
      const result = selectFromNumber(numbers, '+19876543210');

      expect(result).toBe('+12345678901');
    });

    it('should return consistent number for same recipient (sticky)', () => {
      const numbers = ['+11111111111', '+12222222222', '+13333333333'];
      const recipient = '+19876543210';

      const result1 = selectFromNumber(numbers, recipient, true);
      const result2 = selectFromNumber(numbers, recipient, true);

      expect(result1).toBe(result2);
    });

    it('should throw error when no numbers available', () => {
      expect(() => selectFromNumber([], '+19876543210')).toThrow('No phone numbers configured');
    });

    it('should throw error when numbers is null', () => {
      expect(() => selectFromNumber(null, '+19876543210')).toThrow('No phone numbers configured');
    });
  });

  describe('shouldFailover', () => {
    it('should return true for NUMBER_BLOCKED error', () => {
      expect(shouldFailover(SMSErrorCodes.NUMBER_BLOCKED)).toBe(true);
    });

    it('should return true for CARRIER_VIOLATION error', () => {
      expect(shouldFailover(SMSErrorCodes.CARRIER_VIOLATION)).toBe(true);
    });

    it('should return true for RATE_LIMITED error', () => {
      expect(shouldFailover(SMSErrorCodes.RATE_LIMITED)).toBe(true);
    });

    it('should return true for PROVIDER_ERROR', () => {
      expect(shouldFailover(SMSErrorCodes.PROVIDER_ERROR)).toBe(true);
    });

    it('should return true for NETWORK_ERROR', () => {
      expect(shouldFailover(SMSErrorCodes.NETWORK_ERROR)).toBe(true);
    });

    it('should return false for INVALID_NUMBER error', () => {
      expect(shouldFailover(SMSErrorCodes.INVALID_NUMBER)).toBe(false);
    });

    it('should return false for INVALID_CONTENT error', () => {
      expect(shouldFailover(SMSErrorCodes.INVALID_CONTENT)).toBe(false);
    });

    it('should return false for UNDELIVERABLE error', () => {
      expect(shouldFailover(SMSErrorCodes.UNDELIVERABLE)).toBe(false);
    });
  });

  describe('SMSErrorCodes', () => {
    it('should have all expected error codes', () => {
      expect(SMSErrorCodes.INVALID_NUMBER).toBe('INVALID_NUMBER');
      expect(SMSErrorCodes.NUMBER_BLOCKED).toBe('NUMBER_BLOCKED');
      expect(SMSErrorCodes.CARRIER_VIOLATION).toBe('CARRIER_VIOLATION');
      expect(SMSErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(SMSErrorCodes.PROVIDER_ERROR).toBe('PROVIDER_ERROR');
      expect(SMSErrorCodes.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(SMSErrorCodes.INVALID_CONTENT).toBe('INVALID_CONTENT');
      expect(SMSErrorCodes.UNDELIVERABLE).toBe('UNDELIVERABLE');
      expect(SMSErrorCodes.UNKNOWN).toBe('UNKNOWN');
    });
  });

  describe('FAILOVER_ERRORS', () => {
    it('should contain provider-related errors', () => {
      expect(FAILOVER_ERRORS).toContain(SMSErrorCodes.NUMBER_BLOCKED);
      expect(FAILOVER_ERRORS).toContain(SMSErrorCodes.CARRIER_VIOLATION);
      expect(FAILOVER_ERRORS).toContain(SMSErrorCodes.RATE_LIMITED);
      expect(FAILOVER_ERRORS).toContain(SMSErrorCodes.PROVIDER_ERROR);
      expect(FAILOVER_ERRORS).toContain(SMSErrorCodes.NETWORK_ERROR);
    });

    it('should not contain recipient-related errors', () => {
      expect(FAILOVER_ERRORS).not.toContain(SMSErrorCodes.INVALID_NUMBER);
      expect(FAILOVER_ERRORS).not.toContain(SMSErrorCodes.INVALID_CONTENT);
    });
  });

  describe('NO_FAILOVER_ERRORS', () => {
    it('should contain recipient-related errors', () => {
      expect(NO_FAILOVER_ERRORS).toContain(SMSErrorCodes.INVALID_NUMBER);
      expect(NO_FAILOVER_ERRORS).toContain(SMSErrorCodes.INVALID_CONTENT);
      expect(NO_FAILOVER_ERRORS).toContain(SMSErrorCodes.UNDELIVERABLE);
    });
  });
});

describe('getProvider', () => {
  beforeEach(() => {
    SMSService.clearCache();
  });

  it('should throw error for unknown provider', () => {
    expect(() => getProvider('unknown-provider')).toThrow('Unknown SMS provider: unknown-provider');
  });

  it('should return TwilioProvider for twilio', () => {
    const provider = getProvider('twilio');
    expect(provider.getName()).toBe('twilio');
  });

  it('should return TelnyxProvider for telnyx', () => {
    const provider = getProvider('telnyx');
    expect(provider.getName()).toBe('telnyx');
  });

  it('should cache provider instances', () => {
    const provider1 = getProvider('twilio');
    const provider2 = getProvider('twilio');
    expect(provider1).toBe(provider2);
  });
});
