/**
 * Tenant Resolver Middleware
 * Single Responsibility: Identify which organization a request belongs to
 * This middleware ONLY resolves the tenant - doesn't load data or validate
 */

const logger = require('../utils/logger');

class TenantResolver {
  /**
   * Resolve organization from request
   * Priority order:
   * 1. Subdomain (e.g., memorial.radscheduler.com)
   * 2. Path prefix (e.g., /api/org/memorial/appointments)
   * 3. Header (e.g., X-Organization-Id or X-Organization-Slug)
   * 4. Query parameter (e.g., ?org=memorial)
   *
   * @returns {Function} Express middleware
   */
  resolve() {
    return (req, res, next) => {
      try {
        let organizationIdentifier = null;
        let identifierType = null;

        // 1. Check subdomain
        organizationIdentifier = this._extractFromSubdomain(req);
        if (organizationIdentifier) {
          identifierType = 'subdomain';
        }

        // 2. Check path prefix
        if (!organizationIdentifier) {
          organizationIdentifier = this._extractFromPath(req);
          if (organizationIdentifier) {
            identifierType = 'path';
          }
        }

        // 3. Check headers
        if (!organizationIdentifier) {
          organizationIdentifier = this._extractFromHeaders(req);
          if (organizationIdentifier) {
            identifierType = 'header';
          }
        }

        // 4. Check query parameters
        if (!organizationIdentifier) {
          organizationIdentifier = this._extractFromQuery(req);
          if (organizationIdentifier) {
            identifierType = 'query';
          }
        }

        // 5. Use default if configured
        if (!organizationIdentifier && process.env.DEFAULT_ORG_SLUG) {
          organizationIdentifier = process.env.DEFAULT_ORG_SLUG;
          identifierType = 'default';
        }

        // Store resolved tenant information
        req.tenantInfo = {
          identifier: organizationIdentifier,
          type: identifierType,
          resolved: !!organizationIdentifier
        };

        logger.debug('Tenant resolved', req.tenantInfo);
        next();
      } catch (error) {
        logger.error('TenantResolver error:', error);
        next(error);
      }
    };
  }

  /**
   * Extract organization from subdomain
   * @private
   */
  _extractFromSubdomain(req) {
    const hostname = req.hostname || req.get('host') || '';

    // Skip if localhost or IP
    if (hostname.includes('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(hostname)) {
      return null;
    }

    // Extract subdomain (first part before main domain)
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      const subdomain = parts[0];
      // Validate subdomain format
      if (/^[a-z0-9-]+$/.test(subdomain)) {
        return subdomain;
      }
    }

    return null;
  }

  /**
   * Extract organization from path
   * Pattern: /org/{slug}/...
   * @private
   */
  _extractFromPath(req) {
    const pathMatch = req.path.match(/^\/org\/([a-z0-9-]+)\//);
    if (pathMatch && pathMatch[1]) {
      // Update request path to remove org prefix
      req.baseUrl = `/org/${pathMatch[1]}`;
      req.path = req.path.replace(`/org/${pathMatch[1]}`, '');
      return pathMatch[1];
    }
    return null;
  }

  /**
   * Extract organization from headers
   * @private
   */
  _extractFromHeaders(req) {
    // Check for organization ID (UUID)
    const orgId = req.get('X-Organization-Id');
    if (orgId && this._isUuid(orgId)) {
      return orgId;
    }

    // Check for organization slug
    const orgSlug = req.get('X-Organization-Slug');
    if (orgSlug && /^[a-z0-9-]+$/.test(orgSlug)) {
      return orgSlug;
    }

    return null;
  }

  /**
   * Extract organization from query parameters
   * @private
   */
  _extractFromQuery(req) {
    const org = req.query.org || req.query.organization;
    if (org) {
      // Validate format (slug or UUID)
      if (/^[a-z0-9-]+$/.test(org) || this._isUuid(org)) {
        return org;
      }
    }
    return null;
  }

  /**
   * Check if string is valid UUID
   * @private
   */
  _isUuid(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }
}

module.exports = new TenantResolver();