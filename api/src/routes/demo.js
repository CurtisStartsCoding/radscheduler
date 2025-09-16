const express = require('express');
const router = express.Router();
const { broadcastEvent } = require('../services/websocket');
const { sendBulkSMS } = require('../services/notifications');
const logger = require('../utils/logger');
const Joi = require('joi');

// Validation schemas
const scenarioSchema = Joi.string().valid('dramatic-save', 'efficiency-boost', 'bulk-sms').required();

const bulkSMSSchema = Joi.object({
  phoneNumbers: Joi.array().items(
    Joi.string().pattern(/^\+?[1-9]\d{1,14}$/)
  ).min(1).required()
});

// Trigger demo scenarios
router.post('/scenario/:name', async (req, res) => {
  const { error: paramError } = scenarioSchema.validate(req.params.name);
  if (paramError) return res.status(400).json({ success: false, error: paramError.message });
  
  // Validate body for bulk-sms scenario
  if (req.params.name === 'bulk-sms') {
    const { error: bodyError } = bulkSMSSchema.validate(req.body);
    if (bodyError) return res.status(400).json({ success: false, error: bodyError.message });
  }
  
  try {
    const { name } = req.params;
    
    switch (name) {
      case 'dramatic-save':
        await triggerDramaticSave();
        break;
      case 'efficiency-boost':
        await triggerEfficiencyBoost();
        break;
      case 'bulk-sms':
        await triggerBulkSMS(req.body.phoneNumbers);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Unknown scenario'
        });
    }
    
    res.json({
      success: true,
      message: `Scenario ${name} triggered`
    });
  } catch (error) {
    logger.error('Error triggering scenario:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reset demo state
router.post('/reset', async (req, res) => {
  try {
    // Clear any demo-specific data
    broadcastEvent('demo_reset', {
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Demo state reset'
    });
  } catch (error) {
    logger.error('Error resetting demo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

async function triggerDramaticSave() {
  const events = [
    {
      delay: 0,
      type: 'hl7_received',
      data: {
        messageType: 'SIU^S12',
        preview: 'MSH|^~\\&|RIS|MEMORIAL|RADSCHED|...',
        timestamp: new Date().toISOString()
      }
    },
    {
      delay: 1500,
      type: 'processing_started',
      data: {
        patientName: 'John Doe',
        modality: 'MRI',
        studyType: 'Brain with Gadolinium Contrast'
      }
    },
    {
      delay: 3000,
      type: 'critical_alert',
      data: {
        severity: 'CRITICAL',
        title: 'Contrast Allergy Detected!',
        message: 'Patient has documented severe gadolinium allergy',
        patientId: 'P123456'
      }
    },
    {
      delay: 4500,
      type: 'ai_analysis',
      data: {
        recommendation: 'Switch to non-contrast T2-weighted protocol',
        confidence: 98.5,
        alternativeProtocols: [
          'T2 FLAIR without contrast',
          'DWI/ADC sequences',
          'Consider CT if MRI contraindicated'
        ]
      }
    },
    {
      delay: 6000,
      type: 'protocol_updated',
      data: {
        original: 'MRI Brain with Contrast',
        updated: 'MRI Brain T2/FLAIR without Contrast',
        safetyVerified: true
      }
    },
    {
      delay: 7000,
      type: 'appointment_saved',
      data: {
        status: 'CONFIRMED_SAFE',
        modifications: ['Protocol changed', 'Allergy alert added'],
        notificationSent: true
      }
    }
  ];
  
  // Execute events with delays
  for (const event of events) {
    setTimeout(() => {
      broadcastEvent(event.type, event.data);
    }, event.delay);
  }
}

async function triggerEfficiencyBoost() {
  broadcastEvent('optimization_started', {
    modality: 'MRI',
    date: new Date().toISOString().split('T')[0],
    currentUtilization: 65
  });
  
  setTimeout(() => {
    broadcastEvent('optimization_progress', {
      stage: 'Analyzing current schedule...',
      progress: 25
    });
  }, 1000);
  
  setTimeout(() => {
    broadcastEvent('optimization_progress', {
      stage: 'Identifying gaps and conflicts...',
      progress: 50
    });
  }, 2000);
  
  setTimeout(() => {
    broadcastEvent('optimization_progress', {
      stage: 'Applying AI optimization...',
      progress: 75
    });
  }, 3000);
  
  setTimeout(() => {
    broadcastEvent('optimization_complete', {
      before: {
        utilizationRate: 65,
        averageWaitTime: 47,
        openSlots: 12,
        revenue: 125000
      },
      after: {
        utilizationRate: 92,
        averageWaitTime: 12,
        openSlots: 3,
        revenue: 187500
      },
      improvements: {
        efficiency: '+47%',
        revenueIncrease: '+$62,500/day',
        waitTimeReduction: '-74%',
        annualImpact: '+$2.3M'
      },
      recommendations: [
        'Group contrast studies in morning blocks',
        'Add 15-min buffers for complex cases',
        'Reserve 2-3 PM for emergency slots',
        'Batch pediatric appointments'
      ]
    });
  }, 4500);
}

async function triggerBulkSMS(phoneNumbers) {
  if (!phoneNumbers || !phoneNumbers.length) {
    throw new Error('No phone numbers provided');
  }
  
  const message = 'RadScheduler Demo: Your appointment has been confirmed. This system processes 1000+ appointments daily with 99.7% accuracy.';
  
  const results = await sendBulkSMS(phoneNumbers, message);
  
  broadcastEvent('bulk_sms_sent', {
    count: results.length,
    successful: results.filter(r => r.success).length,
    timestamp: new Date().toISOString()
  });
  
  return results;
}

module.exports = router;