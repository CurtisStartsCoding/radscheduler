/**
 * Organization Service
 * Single Responsibility: Business logic for organizations
 * This class ONLY handles business rules and orchestration - no data access or HTTP
 */

const organizationRepository = require('../repositories/organization.repository');
const settingsRepository = require('../repositories/organization-settings.repository');
const logger = require('../utils/logger');

class OrganizationService {
  /**
   * Create a new organization with default settings
   * @param {Object} orgData - Organization data
   * @returns {Promise<Object>} Created organization with settings
   */
  async createOrganization(orgData) {
    try {
      // Validate slug format (business rule)
      if (!this._isValidSlug(orgData.slug)) {
        throw new Error('Invalid slug format. Use lowercase letters, numbers, and hyphens only.');
      }

      // Check if slug is unique (business rule)
      const exists = await organizationRepository.slugExists(orgData.slug);
      if (exists) {
        throw new Error('Organization slug already exists');
      }

      // Create organization
      const organization = await organizationRepository.create(orgData);

      // Apply default settings (business logic)
      await this._applyDefaultSettings(organization.id);

      return organization;
    } catch (error) {
      logger.error('OrganizationService.createOrganization error:', error);
      throw error;
    }
  }

  /**
   * Get organization with settings
   * @param {string} identifier - Organization ID or slug
   * @returns {Promise<Object>} Organization with settings
   */
  async getOrganization(identifier) {
    try {
      // Determine if identifier is UUID or slug (business logic)
      const isUuid = this._isUuid(identifier);

      const organization = isUuid
        ? await organizationRepository.findById(identifier)
        : await organizationRepository.findBySlug(identifier);

      if (!organization) {
        throw new Error('Organization not found');
      }

      // Enrich with settings
      const settings = await settingsRepository.getAllSettings(organization.id);

      return {
        ...organization,
        settings
      };
    } catch (error) {
      logger.error('OrganizationService.getOrganization error:', error);
      throw error;
    }
  }

  /**
   * Update organization settings
   * @param {string} orgId - Organization ID
   * @param {string} settingType - Setting type
   * @param {Object} settings - Settings to update
   * @returns {Promise<void>}
   */
  async updateSettings(orgId, settingType, settings) {
    try {
      // Validate setting type (business rule)
      const validTypes = ['ris', 'scheduling', 'features', 'branding'];
      if (!validTypes.includes(settingType)) {
        throw new Error(`Invalid setting type. Must be one of: ${validTypes.join(', ')}`);
      }

      // Validate settings based on type (business logic)
      this._validateSettings(settingType, settings);

      // Save each setting
      for (const [key, value] of Object.entries(settings)) {
        await settingsRepository.setSetting(orgId, key, value, settingType);
      }
    } catch (error) {
      logger.error('OrganizationService.updateSettings error:', error);
      throw error;
    }
  }

  /**
   * Get RIS configuration for organization
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} RIS configuration
   */
  async getRISConfiguration(orgId) {
    try {
      const risSettings = await settingsRepository.getSettingsByType(orgId, 'ris');

      // Apply defaults if missing (business logic)
      return {
        type: risSettings.ris_type || 'custom',
        apiUrl: risSettings.api_url || null,
        syncEnabled: risSettings.sync_enabled !== false,
        syncInterval: risSettings.sync_interval || 300000, // 5 minutes default
        ...risSettings
      };
    } catch (error) {
      logger.error('OrganizationService.getRISConfiguration error:', error);
      throw error;
    }
  }

  /**
   * Check if feature is enabled for organization
   * @param {string} orgId - Organization ID
   * @param {string} featureName - Feature name
   * @returns {Promise<boolean>} True if enabled
   */
  async isFeatureEnabled(orgId, featureName) {
    try {
      const features = await settingsRepository.getSettingsByType(orgId, 'features');
      return features[featureName] === true;
    } catch (error) {
      logger.error('OrganizationService.isFeatureEnabled error:', error);
      throw error;
    }
  }

  /**
   * Validate slug format
   * @private
   */
  _isValidSlug(slug) {
    return /^[a-z0-9-]+$/.test(slug);
  }

  /**
   * Check if string is valid UUID
   * @private
   */
  _isUuid(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Validate settings based on type
   * @private
   */
  _validateSettings(type, settings) {
    switch (type) {
      case 'ris':
        if (settings.ris_type && !['avreo', 'epic', 'cerner', 'custom'].includes(settings.ris_type)) {
          throw new Error('Invalid RIS type');
        }
        break;
      case 'scheduling':
        if (settings.business_hours_start && (settings.business_hours_start < 0 || settings.business_hours_start > 23)) {
          throw new Error('Invalid business hours');
        }
        break;
      // Add more validation as needed
    }
  }

  /**
   * Apply default settings for new organization
   * @private
   */
  async _applyDefaultSettings(orgId) {
    const defaults = {
      ris: {
        ris_type: 'custom',
        sync_enabled: false
      },
      scheduling: {
        patient_self_scheduling: false,
        business_hours_start: 8,
        business_hours_end: 18,
        slot_duration: 30
      },
      features: {
        sms_notifications: true,
        ai_scheduling: true,
        patient_portal: false
      }
    };

    for (const [type, settings] of Object.entries(defaults)) {
      for (const [key, value] of Object.entries(settings)) {
        await settingsRepository.setSetting(orgId, key, value, type);
      }
    }
  }
}

module.exports = new OrganizationService();