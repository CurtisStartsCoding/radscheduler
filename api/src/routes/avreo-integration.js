const express = require('express');
const router = express.Router();
const avreoIntegration = require('../services/avreo-integration');
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');

// Validation schemas
const syncSchema = Joi.object({
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().optional(),
  force: Joi.boolean().default(false)
});

// Manual sync endpoint
router.post('/sync', authenticate, authorize(['admin', 'scheduler']), async (req, res) => {
  const { error } = syncSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.message });

  try {
    logger.info('Manual Avreo sync requested', {
      userId: req.user.id,
      userRole: req.user.role
    });

    const result = await avreoIntegration.syncAppointments();
    
    res.json({
      success: result.success,
      message: result.success ? 'Sync completed successfully' : 'Sync failed',
      data: result
    });

  } catch (error) {
    logger.error('Avreo sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Sync operation failed'
    });
  }
});

// Get sync status
router.get('/status', authenticate, async (req, res) => {
  try {
    const status = avreoIntegration.getSyncStatus();
    
    res.json({
      success: true,
      status: {
        lastSync: status.lastSync,
        isConnected: status.isConnected,
        baseUrl: status.baseUrl,
        configured: !!(process.env.AVREO_API_URL && process.env.AVREO_USERNAME)
      }
    });

  } catch (error) {
    logger.error('Avreo status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Status check failed'
    });
  }
});

// Test Avreo connection
router.post('/test-connection', authenticate, authorize(['admin']), async (req, res) => {
  try {
    logger.info('Testing Avreo connection');
    
    const isAuthenticated = await avreoIntegration.authenticate();
    
    if (isAuthenticated) {
      // Try to fetch a small sample of appointments
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 1);
      
      const appointments = await avreoIntegration.fetchAppointments(startDate, endDate);
      
      res.json({
        success: true,
        message: 'Connection successful',
        data: {
          authenticated: true,
          sampleAppointments: appointments.length,
          baseUrl: avreoIntegration.baseUrl
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Authentication failed. Check credentials and API URL.'
      });
    }

  } catch (error) {
    logger.error('Avreo connection test error:', error);
    res.status(500).json({
      success: false,
      error: 'Connection test failed: ' + error.message
    });
  }
});

// Get Avreo configuration (admin only)
router.get('/config', authenticate, authorize(['admin']), (req, res) => {
  res.json({
    success: true,
    config: {
      baseUrl: process.env.AVREO_API_URL || 'Not configured',
      username: process.env.AVREO_USERNAME ? 'Configured' : 'Not configured',
      apiKey: process.env.AVREO_API_KEY ? 'Configured' : 'Not configured'
    }
  });
});

// Schedule automatic sync (admin only)
router.post('/schedule-sync', authenticate, authorize(['admin']), async (req, res) => {
  try {
    // Set up automatic sync every 5 minutes
    if (!avreoIntegration.syncInterval) {
      avreoIntegration.syncInterval = setInterval(async () => {
        logger.info('Running automatic Avreo sync');
        await avreoIntegration.syncAppointments();
      }, 5 * 60 * 1000); // 5 minutes
    }

    res.json({
      success: true,
      message: 'Automatic sync scheduled every 5 minutes'
    });

  } catch (error) {
    logger.error('Schedule sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule sync'
    });
  }
});

module.exports = router; 