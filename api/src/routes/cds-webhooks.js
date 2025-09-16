const express = require('express');
const router = express.Router();
const cdsHL7Connector = require('../services/cds-hl7-connector');
const logger = require('../utils/logger');
const Joi = require('joi');

// Validation schemas
const clinicalDecisionSchema = Joi.object({
  patientId: Joi.string().required(),
  patientName: Joi.string().required(),
  patientDob: Joi.string().required(),
  patientGender: Joi.string().valid('M', 'F', 'O').required(),
  orderId: Joi.string().required(),
  procedureCode: Joi.string().required(),
  procedureDescription: Joi.string().required(),
  referringPhysician: Joi.string().required(),
  visitLocation: Joi.string().default('CLINIC'),
  riskScore: Joi.number().min(0).max(100).required(),
  recommendations: Joi.array().items(Joi.string()).required(),
  clinicalSummary: Joi.string().optional(), // Base64 encoded PDF
  radiologyGroupId: Joi.string().required()
});

const documentSchema = Joi.object({
  patientId: Joi.string().required(),
  patientName: Joi.string().required(),
  patientDob: Joi.string().required(),
  patientGender: Joi.string().valid('M', 'F', 'O').required(),
  orderId: Joi.string().required(),
  documentType: Joi.string().required(),
  documentDescription: Joi.string().required(),
  content: Joi.string().required(), // Base64 encoded document
  referringPhysician: Joi.string().required(),
  visitLocation: Joi.string().default('CLINIC'),
  radiologyGroupId: Joi.string().required()
});

/**
 * @route   POST /api/cds/clinical-decision
 * @desc    Receive clinical decision from CDS platform and send to RIS
 * @access  Public (with API key validation)
 */
router.post('/clinical-decision', async (req, res) => {
  try {
    // Validate request
    const { error, value } = clinicalDecisionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.details
      });
    }

    const clinicalData = value;

    logger.info('Clinical decision received from CDS', {
      patientId: clinicalData.patientId,
      orderId: clinicalData.orderId,
      riskScore: clinicalData.riskScore,
      radiologyGroupId: clinicalData.radiologyGroupId
    });

    // Send to RIS via HL7 connector
    const result = await cdsHL7Connector.sendClinicalDecision(
      clinicalData.radiologyGroupId,
      clinicalData
    );

    res.status(200).json({
      success: true,
      messageId: result.messageId,
      message: 'Clinical decision sent to RIS successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to process clinical decision:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   POST /api/cds/document
 * @desc    Receive document from CDS platform and send to RIS
 * @access  Public (with API key validation)
 */
router.post('/document', async (req, res) => {
  try {
    // Validate request
    const { error, value } = documentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.details
      });
    }

    const documentData = value;

    logger.info('Document received from CDS', {
      patientId: documentData.patientId,
      orderId: documentData.orderId,
      documentType: documentData.documentType,
      radiologyGroupId: documentData.radiologyGroupId
    });

    // Send to RIS via HL7 connector
    const result = await cdsHL7Connector.sendDocument(
      documentData.radiologyGroupId,
      documentData
    );

    res.status(200).json({
      success: true,
      messageId: result.messageId,
      message: 'Document sent to RIS successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to process document:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * @route   GET /api/cds/status
 * @desc    Get status of HL7 connections and recent transactions
 * @access  Private (admin only)
 */
router.get('/status', async (req, res) => {
  try {
    // Get connection status
    const connectionStatus = cdsHL7Connector.getConnectionStatus();

    // Get recent transactions (last 24 hours)
    const { query } = require('../db/connection');
    const result = await query(`
      SELECT 
        client_id,
        message_type,
        status,
        sent_at,
        COUNT(*) as message_count
      FROM hl7_transactions 
      WHERE sent_at > NOW() - INTERVAL '24 hours'
      GROUP BY client_id, message_type, status, sent_at
      ORDER BY sent_at DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      connections: connectionStatus,
      recentTransactions: result.rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/cds/test-connection
 * @desc    Test connection to a specific RIS system
 * @access  Private (admin only)
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { radiologyGroupId } = req.body;

    if (!radiologyGroupId) {
      return res.status(400).json({
        success: false,
        error: 'radiologyGroupId is required'
      });
    }

    // Test connection
    const connection = await cdsHL7Connector.initializeConnection(
      radiologyGroupId,
      await cdsHL7Connector.loadClientConfigurations()[radiologyGroupId]
    );

    res.json({
      success: true,
      connection: {
        id: connection.id,
        status: connection.status,
        lastHeartbeat: connection.lastHeartbeat
      },
      message: `Connection test ${connection.status === 'connected' ? 'passed' : 'failed'}`
    });

  } catch (error) {
    logger.error('Connection test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/cds/send-test-message
 * @desc    Send a test message to a specific RIS system
 * @access  Private (admin only)
 */
router.post('/send-test-message', async (req, res) => {
  try {
    const { radiologyGroupId, messageType } = req.body;

    if (!radiologyGroupId || !messageType) {
      return res.status(400).json({
        success: false,
        error: 'radiologyGroupId and messageType are required'
      });
    }

    // Create test data
    const testData = {
      patientId: 'TEST123',
      patientName: 'TEST^PATIENT',
      patientDob: '19800101',
      patientGender: 'M',
      orderId: `TEST_${Date.now()}`,
      procedureCode: '71020',
      procedureDescription: 'CHEST XRAY 2 VIEWS',
      referringPhysician: 'TEST^DOCTOR^MD',
      visitLocation: 'CLINIC',
      riskScore: 50,
      recommendations: ['Test recommendation'],
      radiologyGroupId: radiologyGroupId
    };

    let result;
    if (messageType === 'clinical-decision') {
      result = await cdsHL7Connector.sendClinicalDecision(radiologyGroupId, testData);
    } else if (messageType === 'document') {
      result = await cdsHL7Connector.sendDocument(radiologyGroupId, {
        ...testData,
        documentType: 'TEST_DOC',
        documentDescription: 'Test Document',
        content: 'dGVzdCBjb250ZW50' // Base64 encoded "test content"
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid messageType. Use "clinical-decision" or "document"'
      });
    }

    res.json({
      success: true,
      messageId: result.messageId,
      message: `Test ${messageType} message sent successfully`,
      testData: testData
    });

  } catch (error) {
    logger.error('Test message failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 