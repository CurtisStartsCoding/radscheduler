const twilio = require('twilio');
const logger = require('../utils/logger');
const { hashPhoneNumber, getPhoneLast4 } = require('../utils/phone-hash');

class NotificationService {
  constructor() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
      this.enabled = true;
    } else {
      logger.warn('Twilio credentials not configured, SMS will be logged only');
      this.enabled = false;
    }
  }

  async sendSMS(to, message) {
    try {
      // Add validation for the 'to' parameter
      if (!to) {
        logger.error('SMS send failed: No recipient phone number provided (to parameter is empty/null)');
        throw new Error('No recipient phone number provided');
      }

      if (typeof to !== 'string' || to.trim() === '') {
        logger.error('SMS send failed: Invalid recipient phone number format', {
          type: typeof to,
          isEmpty: to === '' || (typeof to === 'string' && to.trim() === '')
        });
        throw new Error('Invalid recipient phone number format');
      }

      // Log the parameters being sent to Twilio for debugging (HIPAA compliant)
      logger.info('Attempting to send SMS', {
        phoneHash: hashPhoneNumber(to),
        phoneLast4: getPhoneLast4(to),
        from: this.fromNumber,
        messageLength: message ? message.length : 0,
        enabled: this.enabled
      });

      if (!this.enabled) {
        logger.info('SMS (simulated)', {
          phoneHash: hashPhoneNumber(to),
          phoneLast4: getPhoneLast4(to),
          messageLength: message ? message.length : 0
        });
        return { sid: 'SIMULATED_' + Date.now(), status: 'sent' };
      }

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: to
      });

      logger.info('SMS sent successfully', {
        sid: result.sid,
        phoneHash: hashPhoneNumber(to),
        phoneLast4: getPhoneLast4(to)
      });

      return result;
    } catch (error) {
      logger.error('SMS send failed', {
        error: error.message,
        phoneHash: hashPhoneNumber(to),
        phoneLast4: getPhoneLast4(to)
      });

      throw error;
    }
  }

  async sendBulkSMS(recipients, message) {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        const result = await this.sendSMS(recipient, message);
        results.push({ recipient, success: true, result });
      } catch (error) {
        results.push({ recipient, success: false, error: error.message });
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }
}

// Create a singleton instance
const notificationService = new NotificationService();

module.exports = {
  sendSMS: async (to, message) => {
    return notificationService.sendSMS(to, message);
  },
  sendBulkSMS: async (recipients, message) => {
    return notificationService.sendBulkSMS(recipients, message);
  }
};