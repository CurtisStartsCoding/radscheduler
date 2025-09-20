/**
 * Organizations Router
 * Single Responsibility: Handle HTTP requests for organization management
 * This router ONLY handles HTTP layer - delegates business logic to service
 */

const express = require('express');
const router = express.Router();
const organizationService = require('../services/organization.service');
const { authenticate, authorize, ROLES } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const Joi = require('joi');
const logger = require('../utils/logger');

// Validation schemas
const createOrgSchema = Joi.object({
  slug: Joi.string().pattern(/^[a-z0-9-]+$/).min(3).max(50).required(),
  name: Joi.string().min(2).max(200).required()
});

const updateOrgSchema = Joi.object({
  name: Joi.string().min(2).max(200).optional(),
  is_active: Joi.boolean().optional()
});

const updateSettingsSchema = Joi.object({
  type: Joi.string().valid('ris', 'scheduling', 'features', 'branding').required(),
  settings: Joi.object().required()
});

/**
 * Create new organization
 * POST /api/organizations
 */
router.post('/',
  authenticate,
  authorize(['admin']),
  auditMiddleware.create,
  async (req, res) => {
    try {
      // Validate request
      const { error } = createOrgSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      // Create organization
      const organization = await organizationService.createOrganization(req.body);

      res.status(201).json({
        success: true,
        organization
      });
    } catch (error) {
      logger.error('Failed to create organization:', error);
      res.status(error.message.includes('already exists') ? 409 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get organization details
 * GET /api/organizations/:identifier
 */
router.get('/:identifier',
  authenticate,
  auditMiddleware.read,
  async (req, res) => {
    try {
      const organization = await organizationService.getOrganization(req.params.identifier);

      res.json({
        success: true,
        organization
      });
    } catch (error) {
      logger.error('Failed to get organization:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Update organization
 * PATCH /api/organizations/:id
 */
router.patch('/:id',
  authenticate,
  authorize(['admin']),
  auditMiddleware.update,
  async (req, res) => {
    try {
      // Validate request
      const { error } = updateOrgSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      const organization = await organizationService.updateOrganization(
        req.params.id,
        req.body
      );

      res.json({
        success: true,
        organization
      });
    } catch (error) {
      logger.error('Failed to update organization:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Update organization settings
 * PUT /api/organizations/:id/settings
 */
router.put('/:id/settings',
  authenticate,
  authorize(['admin']),
  auditMiddleware.update,
  async (req, res) => {
    try {
      // Validate request
      const { error } = updateSettingsSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: error.details[0].message
        });
      }

      await organizationService.updateSettings(
        req.params.id,
        req.body.type,
        req.body.settings
      );

      res.json({
        success: true,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      logger.error('Failed to update organization settings:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Get organization RIS configuration
 * GET /api/organizations/:id/ris-config
 */
router.get('/:id/ris-config',
  authenticate,
  auditMiddleware.read,
  async (req, res) => {
    try {
      const config = await organizationService.getRISConfiguration(req.params.id);

      res.json({
        success: true,
        config
      });
    } catch (error) {
      logger.error('Failed to get RIS configuration:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * Check feature availability
 * GET /api/organizations/:id/features/:feature
 */
router.get('/:id/features/:feature',
  authenticate,
  async (req, res) => {
    try {
      const enabled = await organizationService.isFeatureEnabled(
        req.params.id,
        req.params.feature
      );

      res.json({
        success: true,
        feature: req.params.feature,
        enabled
      });
    } catch (error) {
      logger.error('Failed to check feature:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;