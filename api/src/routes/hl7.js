const express = require('express');
const router = express.Router();
const hl7Processor = require('../services/hl7-processor');
const logger = require('../utils/logger');

// Main HL7 endpoint - receives messages from Mirth
router.post('/appointment', async (req, res) => {
  try {
    logger.info('HL7 appointment endpoint hit', {
      contentType: req.headers['content-type'],
      bodySize: JSON.stringify(req.body).length
    });
    
    const result = await hl7Processor.processMessage(req.body);
    
    res.status(201).json({
      success: true,
      appointmentId: result.appointment.id,
      conflicts: result.conflicts,
      message: 'Appointment processed successfully'
    });
    
  } catch (error) {
    logger.error('HL7 processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Raw HL7 endpoint for direct integration
router.post('/raw', async (req, res) => {
  try {
    const rawHL7 = req.body;
    logger.info('Raw HL7 message received', {
      length: rawHL7.length,
      preview: rawHL7.substring(0, 50)
    });
    
    const result = await hl7Processor.processMessage(rawHL7);
    
    res.status(201).json({
      success: true,
      message: 'HL7 message processed',
      appointmentId: result.appointment.id
    });
    
  } catch (error) {
    logger.error('Raw HL7 processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Simulate HL7 message for testing
router.post('/simulate', async (req, res) => {
  try {
    const { patientName, modality, datetime, scenario } = req.body;
    
    const simulatedHL7 = {
      patientId: 'P' + Date.now(),
      patientName: patientName || 'Test Patient',
      patientPhone: process.env.DEMO_PHONE || '+1234567890',
      modality: modality || 'MRI',
      studyType: 'Routine Study',
      datetime: datetime || new Date(Date.now() + 3600000).toISOString(),
      referringPhysician: 'Dr. Demo',
      urgency: 'routine',
      scenario: scenario
    };
    
    // Special scenarios for demo
    if (scenario === 'dramatic_save') {
      simulatedHL7.patientName = 'John Doe';
      simulatedHL7.studyType = 'Brain with Contrast';
    }
    
    const result = await hl7Processor.processMessage(simulatedHL7);
    
    res.status(201).json({
      success: true,
      message: 'Simulated HL7 processed',
      result
    });
    
  } catch (error) {
    logger.error('HL7 simulation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;