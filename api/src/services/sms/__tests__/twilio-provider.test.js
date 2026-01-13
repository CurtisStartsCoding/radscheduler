/**
 * Twilio Provider Unit Tests
 */

const TwilioProvider = require('../twilio-provider');
const { SMSErrorCodes } = require('../types');

// Mock twilio
jest.mock('twilio', () => {
  return jest.fn(() => ({
    messages: {
      create: jest.fn()
    }
  }));
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('TwilioProvider', () => {
  let provider;
  let mockTwilio;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTwilio = require('twilio');
  });

  describe('constructor', () => {
    it('should create provider with correct name', () => {
      provider = new TwilioProvider();
      expect(provider.getName()).toBe('twilio');
    });

    it('should start disabled', () => {
      provider = new TwilioProvider();
      expect(provider.isEnabled()).toBe(false);
    });
  });

  describe('initialize', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should enable provider with valid credentials', () => {
      process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';

      provider = new TwilioProvider();
      const result = provider.initialize();

      expect(result).toBe(true);
      expect(provider.isEnabled()).toBe(true);
    });

    it('should disable provider without credentials', () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;

      provider = new TwilioProvider();
      const result = provider.initialize();

      expect(result).toBe(false);
      expect(provider.isEnabled()).toBe(false);
    });

    it('should use config credentials over env vars', () => {
      process.env.TWILIO_ACCOUNT_SID = 'env-sid';
      process.env.TWILIO_AUTH_TOKEN = 'env-token';

      provider = new TwilioProvider({
        accountSid: 'config-sid',
        authToken: 'config-token'
      });
      provider.initialize();

      expect(mockTwilio).toHaveBeenCalledWith('config-sid', 'config-token');
    });
  });

  describe('validatePhoneNumber', () => {
    beforeEach(() => {
      provider = new TwilioProvider();
    });

    it('should validate correct E.164 format', () => {
      expect(provider.validatePhoneNumber('+12345678901')).toBe(true);
      expect(provider.validatePhoneNumber('+442071234567')).toBe(true);
      expect(provider.validatePhoneNumber('+8618612345678')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(provider.validatePhoneNumber('12345678901')).toBe(false);
      expect(provider.validatePhoneNumber('+0123456789')).toBe(false);
      expect(provider.validatePhoneNumber('invalid')).toBe(false);
      expect(provider.validatePhoneNumber('')).toBe(false);
      expect(provider.validatePhoneNumber(null)).toBe(false);
    });
  });

  describe('normalizePhoneNumber', () => {
    beforeEach(() => {
      provider = new TwilioProvider();
    });

    it('should normalize US 10-digit number', () => {
      expect(provider.normalizePhoneNumber('2345678901')).toBe('+12345678901');
    });

    it('should normalize US 11-digit number', () => {
      expect(provider.normalizePhoneNumber('12345678901')).toBe('+12345678901');
    });

    it('should pass through valid E.164', () => {
      expect(provider.normalizePhoneNumber('+12345678901')).toBe('+12345678901');
    });

    it('should strip formatting characters', () => {
      expect(provider.normalizePhoneNumber('(234) 567-8901')).toBe('+12345678901');
      expect(provider.normalizePhoneNumber('234.567.8901')).toBe('+12345678901');
    });

    it('should return null for invalid numbers', () => {
      expect(provider.normalizePhoneNumber('')).toBe(null);
      expect(provider.normalizePhoneNumber(null)).toBe(null);
    });
  });

  describe('sendSMS', () => {
    beforeEach(() => {
      process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
      process.env.TWILIO_AUTH_TOKEN = 'test-token';

      provider = new TwilioProvider();
      provider.initialize();
    });

    it('should return error when not initialized', async () => {
      const uninitializedProvider = new TwilioProvider();
      const result = await uninitializedProvider.sendSMS('+12345678901', 'test', '+19876543210');

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe(SMSErrorCodes.PROVIDER_ERROR);
    });

    it('should return error for invalid recipient number', async () => {
      const result = await provider.sendSMS('invalid', 'test', '+19876543210');

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe(SMSErrorCodes.INVALID_NUMBER);
    });

    it('should return error for invalid sender number', async () => {
      const result = await provider.sendSMS('+12345678901', 'test', 'invalid');

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe(SMSErrorCodes.INVALID_NUMBER);
    });

    it('should return error for empty message', async () => {
      const result = await provider.sendSMS('+12345678901', '', '+19876543210');

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe(SMSErrorCodes.INVALID_CONTENT);
    });

    it('should return success result on successful send', async () => {
      const mockCreate = jest.fn().mockResolvedValue({
        sid: 'SM123456',
        status: 'queued'
      });
      provider.client.messages.create = mockCreate;

      const result = await provider.sendSMS('+12345678901', 'Hello', '+19876543210');

      expect(result.status).toBe('queued');
      expect(result.sid).toBe('SM123456');
      expect(result.provider).toBe('twilio');
      expect(result.errorCode).toBe(null);
    });

    it('should call Twilio with correct parameters', async () => {
      const mockCreate = jest.fn().mockResolvedValue({
        sid: 'SM123456',
        status: 'queued'
      });
      provider.client.messages.create = mockCreate;

      await provider.sendSMS('+12345678901', 'Hello World', '+19876543210');

      expect(mockCreate).toHaveBeenCalledWith({
        body: 'Hello World',
        from: '+19876543210',
        to: '+12345678901'
      });
    });
  });

  describe('mapErrorCode', () => {
    beforeEach(() => {
      provider = new TwilioProvider();
    });

    it('should map invalid number error codes', () => {
      expect(provider.mapErrorCode({ code: 21211 })).toBe(SMSErrorCodes.INVALID_NUMBER);
      expect(provider.mapErrorCode({ code: 21610 })).toBe(SMSErrorCodes.INVALID_NUMBER);
    });

    it('should map blocked number error codes', () => {
      expect(provider.mapErrorCode({ code: 21612 })).toBe(SMSErrorCodes.NUMBER_BLOCKED);
      expect(provider.mapErrorCode({ code: 30004 })).toBe(SMSErrorCodes.NUMBER_BLOCKED);
    });

    it('should map carrier violation error codes', () => {
      expect(provider.mapErrorCode({ code: 21608 })).toBe(SMSErrorCodes.CARRIER_VIOLATION);
      expect(provider.mapErrorCode({ code: 30034 })).toBe(SMSErrorCodes.CARRIER_VIOLATION);
    });

    it('should map rate limit error codes', () => {
      expect(provider.mapErrorCode({ code: 20429 })).toBe(SMSErrorCodes.RATE_LIMITED);
    });

    it('should return UNKNOWN for unmapped codes', () => {
      expect(provider.mapErrorCode({ code: 99999 })).toBe(SMSErrorCodes.UNKNOWN);
    });

    it('should detect errors from message patterns', () => {
      expect(provider.mapErrorCode({ message: 'Invalid phone number format' }))
        .toBe(SMSErrorCodes.INVALID_NUMBER);
      expect(provider.mapErrorCode({ message: 'Number is blocked' }))
        .toBe(SMSErrorCodes.NUMBER_BLOCKED);
      expect(provider.mapErrorCode({ message: 'Rate limit exceeded' }))
        .toBe(SMSErrorCodes.RATE_LIMITED);
    });
  });
});
