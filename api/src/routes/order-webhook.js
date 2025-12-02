const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const { startConversation, getActiveConversationByPhone, addOrderToConversation, resendConsentWithMultipleOrders } = require('../services/sms-conversation');
const { hashPhoneNumber } = require('../utils/phone-hash');

/**
 * Order Webhook Handler
 * Receives webhooks from Mock RIS when orders enter pending queue
 * This is the TRIGGER POINT for the entire SMS scheduling workflow
 *
 * CRITICAL SECURITY: Validates webhook secret to prevent unauthorized triggers
 */

const ORDER_WEBHOOK_SECRET = process.env.ORDER_WEBHOOK_SECRET;

/**
 * Validate webhook signature or bearer token
 */
function validateWebhookAuth(req, res, next) {
  // Check for Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    if (token === ORDER_WEBHOOK_SECRET) {
      return next();
    }
  }

  // Check for HMAC signature (alternative auth method)
  const signature = req.headers['x-webhook-signature'];
  if (signature && ORDER_WEBHOOK_SECRET) {
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', ORDER_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    if (signature === expectedSignature) {
      return next();
    }
  }

  logger.warn('SECURITY: Unauthorized order webhook attempt', {
    ip: req.ip,
    hasAuthHeader: !!authHeader,
    hasSignature: !!signature
  });

  return res.status(403).json({ error: 'Forbidden: Invalid webhook authentication' });
}

/**
 * POST /api/orders/webhook
 * Receive order from Mock RIS when it enters pending queue
 *
 * Expected payload:
 * {
 *   "orderId": "ORD-12345",
 *   "patientId": "PAT-67890",
 *   "patientPhone": "+15551234567",
 *   "modality": "CT",
 *   "priority": "routine",
 *   "orderDescription": "CT Chest with Contrast",
 *   "queuedAt": "2025-10-15T12:30:00Z"
 * }
 */
router.post('/webhook', express.json(), validateWebhookAuth, async (req, res) => {
  try {
    const {
      orderId,
      orderGroupId,         // NEW: for multi-procedure grouping
      orderSequence,        // NEW: position in group
      totalInGroup,         // NEW: total procedures
      procedures,           // NEW: array of all procedures
      estimatedDuration,    // NEW: total duration in minutes
      patientId,
      patientMrn,           // Patient MRN from HL7 PID-3
      patientDob,           // Patient DOB from HL7 PID-7
      patientGender,        // Patient gender from HL7 PID-8
      patientPhone,
      patientName,
      modality,
      priority,
      orderDescription,     // Legacy field for backward compatibility
      procedureDescription, // Alternative field name
      queuedAt,
      orderingPractice      // Practice name from HL7 MSH-3 (Sending Facility)
    } = req.body;

    // Validate required fields
    if (!orderId || !patientPhone || !modality) {
      logger.error('Invalid order webhook payload - missing required fields', {
        hasOrderId: !!orderId,
        hasPatientPhone: !!patientPhone,
        hasModality: !!modality
      });

      return res.status(400).json({
        error: 'Missing required fields: orderId, patientPhone, modality'
      });
    }

    logger.info('Order webhook received from Mock RIS', {
      orderId,
      patientHash: hashPhoneNumber(patientPhone),
      modality,
      priority,
      queuedAt,
      orderingPractice      // Practice name from HL7 MSH-3 (Sending Facility)
    });

    // Prepare order data for conversation with multi-procedure support
    const orderData = {
      orderId,
      orderGroupId: orderGroupId || orderId,
      orderSequence: orderSequence || 1,
      totalInGroup: totalInGroup || 1,
      procedures: procedures || [{
        orderId,
        description: orderDescription || procedureDescription || `${modality} exam`,
        estimatedMinutes: 30
      }],
      estimatedDuration: estimatedDuration || 30,
      patientId,
      patientMrn: patientMrn || patientId,  // Use patientMrn if provided, fallback to patientId
      patientName,
      patientDob,                            // Patient date of birth for SRM messages
      patientGender,                         // Patient gender for SRM messages
      modality,
      priority: priority || 'routine',
      orderDescription: orderDescription || procedureDescription || `${modality} exam`,
      queuedAt: queuedAt || new Date().toISOString(),
      orderingPractice       // Practice name for SMS messages
    };

    // Check if patient already has an active conversation
    const existingConversation = await getActiveConversationByPhone(patientPhone);

    let conversation;
    let wasQueued = false;

    // Always queue orders to existing conversations (including CONSENT_PENDING)
    // This prevents orphaned conversations when multiple orders arrive before patient responds
    if (existingConversation) {
      // Add order to existing conversation queue
      await addOrderToConversation(existingConversation.id, orderData);
      conversation = existingConversation;
      wasQueued = true;

      logger.info('Order added to existing SMS conversation', {
        orderId,
        conversationId: existingConversation.id,
        state: existingConversation.state,
        patientHash: hashPhoneNumber(patientPhone)
      });

      // If patient hasn't consented yet, resend consent SMS with updated order count
      if (existingConversation.state === 'CONSENT_PENDING') {
        await resendConsentWithMultipleOrders(existingConversation);
        logger.info('Resent consent request with updated order count', {
          orderId,
          conversationId: existingConversation.id,
          patientHash: hashPhoneNumber(patientPhone)
        });
      }
    } else {
      // No active conversation - start new SMS conversation flow
      conversation = await startConversation(patientPhone, orderData);

      logger.info('New SMS scheduling conversation initiated from order webhook', {
        orderId,
        conversationId: conversation.id,
        state: conversation.state,
        patientHash: hashPhoneNumber(patientPhone)
      });
    }

    // Return success response to Mock RIS
    res.status(200).json({
      success: true,
      message: wasQueued
        ? 'Order added to existing conversation'
        : 'Order received and SMS scheduling initiated',
      conversationId: conversation.id,
      orderId,
      isNewConversation: !wasQueued,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to process order webhook', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    // Return 500 so Mock RIS knows to retry
    res.status(500).json({
      success: false,
      error: 'Failed to process order webhook',
      message: error.message
    });
  }
});

/**
 * GET /api/orders/webhook
 * Health check endpoint
 */
router.get('/webhook', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Order webhook endpoint is active',
    timestamp: new Date().toISOString(),
    requiresAuth: !!ORDER_WEBHOOK_SECRET
  });
});

/**
 * POST /api/orders/webhook/test
 * Test endpoint for development (only in non-production)
 */
if (process.env.NODE_ENV !== 'production') {
  router.post('/webhook/test', express.json(), async (req, res) => {
    try {
      logger.warn('DEV MODE: Test order webhook called (no auth required)');

      const testOrderData = {
        orderId: req.body.orderId || `TEST-${Date.now()}`,
        patientId: req.body.patientId || 'TEST-PATIENT',
        patientPhone: req.body.patientPhone || process.env.TEST_PHONE_NUMBER,
        modality: req.body.modality || 'CT',
        priority: req.body.priority || 'routine',
        orderDescription: req.body.orderDescription || 'Test Order',
        queuedAt: new Date().toISOString()
      };

      if (!testOrderData.patientPhone) {
        return res.status(400).json({
          error: 'patientPhone is required. Set TEST_PHONE_NUMBER env var or include in request.'
        });
      }

      const conversation = await startConversation(testOrderData.patientPhone, testOrderData);

      res.status(200).json({
        success: true,
        message: 'Test order processed',
        conversationId: conversation.id,
        orderData: testOrderData
      });
    } catch (error) {
      logger.error('Test order webhook failed', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

module.exports = router;
