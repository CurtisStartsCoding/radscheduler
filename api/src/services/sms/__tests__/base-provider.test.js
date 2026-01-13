/**
 * Base SMS Provider Unit Tests
 */

const BaseSMSProvider = require('../base-provider');
const { SMSErrorCodes } = require('../types');

describe('BaseSMSProvider', () => {
  describe('constructor', () => {
    it('should throw error when instantiated directly', () => {
      expect(() => new BaseSMSProvider('test', {}))
        .toThrow('BaseSMSProvider is abstract and cannot be instantiated directly');
    });
  });

  describe('concrete implementation', () => {
    class TestProvider extends BaseSMSProvider {
      constructor(config) {
        super('test', config);
      }

      initialize() {
        this.enabled = true;
        return true;
      }

      async sendSMS(to, message, from) {
        return this.createSuccessResult('TEST123', 'sent');
      }
    }

    let provider;

    beforeEach(() => {
      provider = new TestProvider({});
    });

    describe('getName', () => {
      it('should return provider name', () => {
        expect(provider.getName()).toBe('test');
      });
    });

    describe('isEnabled', () => {
      it('should return false before initialization', () => {
        const newProvider = new TestProvider({});
        expect(newProvider.isEnabled()).toBe(false);
      });

      it('should return true after initialization', () => {
        provider.initialize();
        expect(provider.isEnabled()).toBe(true);
      });
    });

    describe('validatePhoneNumber', () => {
      it('should validate correct E.164 numbers', () => {
        expect(provider.validatePhoneNumber('+12345678901')).toBe(true);
        expect(provider.validatePhoneNumber('+1234567890123456')).toBe(false); // Too long
        expect(provider.validatePhoneNumber('+1')).toBe(false); // Too short
      });

      it('should reject invalid formats', () => {
        expect(provider.validatePhoneNumber('12345678901')).toBe(false);
        expect(provider.validatePhoneNumber('')).toBe(false);
        expect(provider.validatePhoneNumber(null)).toBe(false);
        expect(provider.validatePhoneNumber(undefined)).toBe(false);
        expect(provider.validatePhoneNumber(12345)).toBe(false);
      });
    });

    describe('normalizePhoneNumber', () => {
      it('should add +1 to 10-digit US numbers', () => {
        expect(provider.normalizePhoneNumber('2345678901')).toBe('+12345678901');
      });

      it('should add + to 11-digit numbers starting with 1', () => {
        expect(provider.normalizePhoneNumber('12345678901')).toBe('+12345678901');
      });

      it('should preserve valid E.164 format', () => {
        expect(provider.normalizePhoneNumber('+12345678901')).toBe('+12345678901');
      });

      it('should strip non-digit characters', () => {
        expect(provider.normalizePhoneNumber('(234) 567-8901')).toBe('+12345678901');
        expect(provider.normalizePhoneNumber('234.567.8901')).toBe('+12345678901');
        expect(provider.normalizePhoneNumber('234-567-8901')).toBe('+12345678901');
      });

      it('should return null for empty input', () => {
        expect(provider.normalizePhoneNumber('')).toBe(null);
        expect(provider.normalizePhoneNumber(null)).toBe(null);
        expect(provider.normalizePhoneNumber(undefined)).toBe(null);
      });

      it('should handle short international numbers that start with 0', () => {
        // 10-digit numbers get +1 prefix (US assumption), becoming valid
        // '+10123456789' is technically valid E.164 format
        expect(provider.normalizePhoneNumber('0123456789')).toBe('+10123456789');
      });
    });

    describe('mapErrorCode', () => {
      it('should return UNKNOWN by default', () => {
        expect(provider.mapErrorCode(new Error('test'))).toBe(SMSErrorCodes.UNKNOWN);
      });
    });

    describe('createErrorResult', () => {
      it('should create proper error result object', () => {
        const error = new Error('Test error');
        const result = provider.createErrorResult(error, SMSErrorCodes.PROVIDER_ERROR);

        expect(result).toEqual({
          sid: null,
          status: 'failed',
          provider: 'test',
          errorCode: SMSErrorCodes.PROVIDER_ERROR,
          errorMessage: 'Test error'
        });
      });

      it('should use mapErrorCode if errorCode not provided', () => {
        const error = new Error('Test error');
        const result = provider.createErrorResult(error);

        expect(result.errorCode).toBe(SMSErrorCodes.UNKNOWN);
      });
    });

    describe('createSuccessResult', () => {
      it('should create proper success result object', () => {
        const result = provider.createSuccessResult('MSG123', 'delivered');

        expect(result).toEqual({
          sid: 'MSG123',
          status: 'delivered',
          provider: 'test',
          errorCode: null,
          errorMessage: null
        });
      });

      it('should default status to queued', () => {
        const result = provider.createSuccessResult('MSG123');

        expect(result.status).toBe('queued');
      });
    });
  });
});
