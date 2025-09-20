/**
 * Configuration Provider
 * Single Responsibility: Provide configuration values for organizations
 * This service ONLY retrieves configuration - doesn't validate or transform
 */

const settingsRepository = require('../repositories/organization-settings.repository');
const logger = require('../utils/logger');

class ConfigurationProvider {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60000; // 1 minute cache
  }

  /**
   * Get RIS configuration for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} RIS configuration
   */
  async getRISConfig(organizationId) {
    const cacheKey = `ris_${organizationId}`;

    // Check cache
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const settings = await settingsRepository.getSettingsByType(organizationId, 'ris');

      const config = {
        organizationId,
        ris_type: settings.ris_type || 'generic',
        api_url: settings.api_url,
        api_key: settings.api_key,
        username: settings.username,
        password: settings.password,
        hl7_endpoint: settings.hl7_endpoint,
        hl7_version: settings.hl7_version || '2.5.1',
        sending_facility: settings.sending_facility,
        receiving_facility: settings.receiving_facility,
        sync_enabled: settings.sync_enabled !== false,
        sync_interval: settings.sync_interval || 300000
      };

      this._setCache(cacheKey, config);
      return config;
    } catch (error) {
      logger.error('ConfigurationProvider.getRISConfig error:', error);
      throw error;
    }
  }

  /**
   * Get scheduling configuration for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Scheduling configuration
   */
  async getSchedulingConfig(organizationId) {
    const cacheKey = `scheduling_${organizationId}`;

    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const settings = await settingsRepository.getSettingsByType(organizationId, 'scheduling');

      const config = {
        patient_self_scheduling: settings.patient_self_scheduling || false,
        allowed_modalities: settings.allowed_modalities || [],
        restricted_modalities: settings.restricted_modalities || [],
        business_hours_start: settings.business_hours_start || 8,
        business_hours_end: settings.business_hours_end || 18,
        slot_duration: settings.slot_duration || 30,
        max_advance_booking_days: settings.max_advance_booking_days || 30,
        min_advance_booking_hours: settings.min_advance_booking_hours || 24,
        require_approval_modalities: settings.require_approval_modalities || []
      };

      this._setCache(cacheKey, config);
      return config;
    } catch (error) {
      logger.error('ConfigurationProvider.getSchedulingConfig error:', error);
      throw error;
    }
  }

  /**
   * Get feature flags for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Feature flags
   */
  async getFeatures(organizationId) {
    const cacheKey = `features_${organizationId}`;

    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const settings = await settingsRepository.getSettingsByType(organizationId, 'features');

      const features = {
        sms_notifications: settings.sms_notifications !== false,
        email_notifications: settings.email_notifications || false,
        ai_scheduling: settings.ai_scheduling !== false,
        patient_portal: settings.patient_portal || false,
        hl7_integration: settings.hl7_integration !== false,
        document_upload: settings.document_upload || false,
        video_consultation: settings.video_consultation || false,
        automated_reminders: settings.automated_reminders || false
      };

      this._setCache(cacheKey, features);
      return features;
    } catch (error) {
      logger.error('ConfigurationProvider.getFeatures error:', error);
      throw error;
    }
  }

  /**
   * Get branding configuration for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Branding configuration
   */
  async getBrandingConfig(organizationId) {
    const cacheKey = `branding_${organizationId}`;

    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const settings = await settingsRepository.getSettingsByType(organizationId, 'branding');

      const branding = {
        logo_url: settings.logo_url,
        primary_color: settings.primary_color || '#1e40af',
        secondary_color: settings.secondary_color || '#3b82f6',
        company_name: settings.company_name,
        support_email: settings.support_email,
        support_phone: settings.support_phone,
        custom_css: settings.custom_css
      };

      this._setCache(cacheKey, branding);
      return branding;
    } catch (error) {
      logger.error('ConfigurationProvider.getBrandingConfig error:', error);
      throw error;
    }
  }

  /**
   * Get specific configuration value
   * @param {string} organizationId - Organization ID
   * @param {string} key - Configuration key
   * @param {*} defaultValue - Default value if not found
   * @returns {Promise<*>} Configuration value
   */
  async getValue(organizationId, key, defaultValue = null) {
    try {
      const value = await settingsRepository.getSetting(organizationId, key);
      return value !== null ? value : defaultValue;
    } catch (error) {
      logger.error('ConfigurationProvider.getValue error:', error);
      return defaultValue;
    }
  }

  /**
   * Clear cache for organization
   * @param {string} organizationId - Organization ID
   */
  clearCache(organizationId) {
    // Clear all cache entries for this organization
    for (const [key] of this.cache) {
      if (key.includes(organizationId)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    this.cache.clear();
  }

  // Private cache methods

  _getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  _setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}

module.exports = new ConfigurationProvider();