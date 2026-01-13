const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const logger = require('../utils/logger');
const { startConversation, getActiveConversationByPhone, addOrderToConversation, resendConsentWithMultipleOrders } = require('../services/sms-conversation');
const { hashPhoneNumber } = require('../utils/phone-hash');

/**
 * Order Webhook Handler
 * Receives webhooks from Mock RIS/QIE when orders enter pending queue
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
 * Validate patientContext structure if present
 * @param {Object} patientContext - Optional patient context from QIE
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validatePatientContext(patientContext) {
  if (!patientContext) {
    return { valid: true, errors: [] };
  }

  const errors = [];

  // Validate allergies array if present
  if (patientContext.allergies !== undefined) {
    if (!Array.isArray(patientContext.allergies)) {
      errors.push('patientContext.allergies must be an array');
    } else {
      patientContext.allergies.forEach((allergy, idx) => {
        if (!allergy.allergen && !allergy.type) {
          errors.push(`patientContext.allergies[${idx}] must have allergen or type`);
        }
      });
    }
  }

  // Validate labs array if present
  if (patientContext.labs !== undefined) {
    if (!Array.isArray(patientContext.labs)) {
      errors.push('patientContext.labs must be an array');
    } else {
      patientContext.labs.forEach((lab, idx) => {
        if (!lab.name && !lab.code) {
          errors.push(`patientContext.labs[${idx}] must have name or code`);
        }
        if (lab.value === undefined) {
          errors.push(`patientContext.labs[${idx}] must have value`);
        }
      });
    }
  }

  // Validate priorImaging array if present
  if (patientContext.priorImaging !== undefined) {
    if (!Array.isArray(patientContext.priorImaging)) {
      errors.push('patientContext.priorImaging must be an array');
    } else {
      patientContext.priorImaging.forEach((imaging, idx) => {
        if (!imaging.modality) {
          errors.push(`patientContext.priorImaging[${idx}] must have modality`);
        }
        if (!imaging.date) {
          errors.push(`patientContext.priorImaging[${idx}] must have date`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * POST /api/orders/webhook
 * Receive order from Mock RIS/QIE when it enters pending queue
 *
 * Expected payload:
 * {
 *   "orderId": "ORD-12345",
 *   "patientId": "PAT-67890",
 *   "patientPhone": "+15551234567",
 *   "modality": "CT",
 *   "priority": "routine",
 *   "orderDescription": "CT Chest with Contrast",
 *   "queuedAt": "2025-10-15T12:30:00Z",
 *   "patientContext": {
 *     "allergies": [{ "allergen": "Iodinated contrast", "type": "MC", "severity": "SV", "reaction": "Anaphylaxis" }],
 *     "labs": [{ "name": "eGFR", "code": "33914-3", "value": "65", "units": "mL/min/1.73m2", "date": "2026-01-05" }],
 *     "priorImaging": [{ "modality": "CT", "date": "2026-01-05", "hadContrast": true }]
 *   }
 * }
 */
router.post('/webhook', express.json(), validateWebhookAuth, async (req, res) => {
  try {
    const {
      orderId,
      orderGroupId,         // For multi-procedure grouping
      orderSequence,        // Position in group
      totalInGroup,         // Total procedures
      procedures,           // Array of all procedures
      estimatedDuration,    // Total duration in minutes
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
      orderingPractice,     // Practice name from HL7 MSH-3 (Sending Facility)
      patientContext        // NEW: Patient context from QIE (allergies, labs, priorImaging)
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

    // Validate patientContext if present
    const contextValidation = validatePatientContext(patientContext);
    if (!contextValidation.valid) {
      logger.warn('Invalid patientContext structure', {
        orderId,
        errors: contextValidation.errors
      });
      // Log warning but don't reject - continue without patientContext
    }

    logger.info('Order webhook received from Mock RIS', {
      orderId,
      patientHash: hashPhoneNumber(patientPhone),
      modality,
      priority,
      queuedAt,
      orderingPractice,
      hasPatientContext: !!patientContext,
      patientContextFields: patientContext ? {
        allergies: patientContext.allergies?.length || 0,
        labs: patientContext.labs?.length || 0,
        priorImaging: patientContext.priorImaging?.length || 0
      } : null
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
      orderingPractice,                      // Practice name for SMS messages
      // NEW: Store patient context for safety checks
      patientContext: contextValidation.valid ? patientContext : null
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
        // Re-fetch conversation to get updated order_data with new pending order
        const updatedConversation = await getActiveConversationByPhone(patientPhone);
        await resendConsentWithMultipleOrders(updatedConversation);
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
      hasPatientContext: !!patientContext,
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
        queuedAt: new Date().toISOString(),
        patientContext: req.body.patientContext || null
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
