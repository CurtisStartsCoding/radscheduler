const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validateTwilioRequestMiddleware } = require('../middleware/twilio-webhook-auth');
const { handleInboundMessage } = require('../services/sms-conversation');
const { hashPhoneNumber } = require('../utils/phone-hash');

/**
 * Twilio SMS Webhook Handler
 * Receives inbound SMS messages from patients
 * CRITICAL SECURITY: Twilio signature verification is enforced
 */

/**
 * POST /api/sms/webhook
 * Twilio sends POST requests here when patients reply to SMS
 */
router.post('/webhook', validateTwilioRequestMiddleware, async (req, res) => {
  try {
    const { From: phoneNumber, Body: messageBody, MessageSid } = req.body;

    logger.info('Inbound SMS received from Twilio', {
      phoneHash: hashPhoneNumber(phoneNumber),
      messageSid: MessageSid,
      messageLength: messageBody ? messageBody.length : 0
    });

    // Handle the inbound message through conversation service
    const result = await handleInboundMessage(phoneNumber, messageBody);

    // Return TwiML response (empty response = no auto-reply from Twilio)
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);

    logger.info('Inbound SMS processed successfully', {
      phoneHash: hashPhoneNumber(phoneNumber),
      messageSid: MessageSid,
      action: result.action,
      success: result.success
    });
  } catch (error) {
    logger.error('Failed to process inbound SMS', {
      error: error.message,
      stack: error.stack
    });

    // Still return 200 to Twilio to prevent retries
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
});

/**
 * GET /api/sms/webhook
 * Health check endpoint (Twilio can test webhook URL)
 */
router.get('/webhook', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Twilio SMS webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/sms/status
 * Twilio status callback (optional, for tracking message delivery)
 */
router.post('/status', validateTwilioRequestMiddleware, async (req, res) => {
  try {
    const { MessageSid, MessageStatus, To } = req.body;

    logger.info('SMS status callback from Twilio', {
      messageSid: MessageSid,
      status: MessageStatus,
      phoneHash: hashPhoneNumber(To)
    });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Failed to process status callback', {
      error: error.message
    });
    res.status(200).send('OK'); // Always return 200 to Twilio
  }
});

module.exports = router;
