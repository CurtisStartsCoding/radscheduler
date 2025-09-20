/**
 * Tenant Context Middleware
 * Single Responsibility: Load and manage organization context for request
 * This middleware ONLY loads organization data - doesn't resolve or validate
 */

const organizationService = require('../services/organization.service');
const logger = require('../utils/logger');

class TenantContext {
  /**
   * Load organization context based on resolved tenant
   * Requires tenant-resolver to run first
   *
   * @param {Object} options - Configuration options
   * @returns {Function} Express middleware
   */
  load(options = {}) {
    const { required = true, cache = true } = options;

    return async (req, res, next) => {
      try {
        // Check if tenant was resolved
        if (!req.tenantInfo || !req.tenantInfo.resolved) {
          if (required) {
            return res.status(400).json({
              success: false,
              error: 'Organization context required but not provided'
            });
          }
          // Continue without organization context
          req.organization = null;
          return next();
        }

        // Load organization data
        try {
          const organization = await this._loadOrganization(
            req.tenantInfo.identifier,
            cache
          );

          if (!organization) {
            if (required) {
              return res.status(404).json({
                success: false,
                error: 'Organization not found'
              });
            }
            req.organization = null;
            return next();
          }

          // Check if organization is active
          if (!organization.is_active) {
            return res.status(403).json({
              success: false,
              error: 'Organization is inactive'
            });
          }

          // Set organization context
          req.organization = organization;
          req.organizationId = organization.id;

          // Log context loading
          logger.debug('Organization context loaded', {
            orgId: organization.id,
            slug: organization.slug
          });

          next();
        } catch (error) {
          logger.error('Failed to load organization:', error);
          if (required) {
            return res.status(500).json({
              success: false,
              error: 'Failed to load organization context'
            });
          }
          req.organization = null;
          next();
        }
      } catch (error) {
        logger.error('TenantContext error:', error);
        next(error);
      }
    };
  }

  /**
   * Middleware to require organization context
   * Shorthand for load({ required: true })
   */
  require() {
    return this.load({ required: true });
  }

  /**
   * Middleware to optionally load organization context
   * Shorthand for load({ required: false })
   */
  optional() {
    return this.load({ required: false });
  }

  /**
   * Load organization from service
   * @private
   */
  async _loadOrganization(identifier, useCache) {
    // In a production system, you might cache this
    // For now, we'll always fetch fresh data
    return await organizationService.getOrganization(identifier);
  }

  /**
   * Helper to get organization from request
   * @param {Object} req - Express request
   * @returns {Object|null} Organization or null
   */
  static getOrganization(req) {
    return req.organization || null;
  }

  /**
   * Helper to get organization ID from request
   * @param {Object} req - Express request
   * @returns {string|null} Organization ID or null
   */
  static getOrganizationId(req) {
    return req.organizationId || req.organization?.id || null;
  }

  /**
   * Helper to check if request has organization context
   * @param {Object} req - Express request
   * @returns {boolean} True if has context
   */
  static hasContext(req) {
    return !!req.organization;
  }
}

module.exports = new TenantContext();