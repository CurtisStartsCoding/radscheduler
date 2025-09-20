/**
 * Organization Settings Repository
 * Single Responsibility: Data access layer for organization settings
 * This class ONLY handles settings persistence - no validation or business logic
 */

const { getPool } = require('../db/connection');
const logger = require('../utils/logger');

class OrganizationSettingsRepository {
  constructor() {
    this.pool = null;
  }

  /**
   * Get database connection pool
   * @private
   */
  _getPool() {
    if (!this.pool) {
      this.pool = getPool();
    }
    return this.pool;
  }

  /**
   * Get setting by key
   * @param {string} orgId - Organization ID
   * @param {string} key - Setting key
   * @returns {Promise<Object|null>} Setting value or null
   */
  async getSetting(orgId, key) {
    try {
      const result = await this._getPool().query(
        `SELECT setting_value FROM organization_settings
         WHERE organization_id = $1 AND setting_key = $2`,
        [orgId, key]
      );
      return result.rows[0]?.setting_value || null;
    } catch (error) {
      logger.error('OrganizationSettingsRepository.getSetting error:', error);
      throw error;
    }
  }

  /**
   * Get all settings for organization
   * @param {string} orgId - Organization ID
   * @returns {Promise<Object>} All settings grouped by type
   */
  async getAllSettings(orgId) {
    try {
      const result = await this._getPool().query(
        `SELECT setting_key, setting_value, setting_type
         FROM organization_settings
         WHERE organization_id = $1
         ORDER BY setting_type, setting_key`,
        [orgId]
      );

      // Group by type
      const settings = {};
      result.rows.forEach(row => {
        if (!settings[row.setting_type]) {
          settings[row.setting_type] = {};
        }
        settings[row.setting_type][row.setting_key] = row.setting_value;
      });

      return settings;
    } catch (error) {
      logger.error('OrganizationSettingsRepository.getAllSettings error:', error);
      throw error;
    }
  }

  /**
   * Set a setting value
   * @param {string} orgId - Organization ID
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @param {string} type - Setting type
   * @returns {Promise<void>}
   */
  async setSetting(orgId, key, value, type) {
    try {
      await this._getPool().query(
        `INSERT INTO organization_settings (organization_id, setting_key, setting_value, setting_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, setting_key)
         DO UPDATE SET setting_value = $3, setting_type = $4, updated_at = CURRENT_TIMESTAMP`,
        [orgId, key, JSON.stringify(value), type]
      );
    } catch (error) {
      logger.error('OrganizationSettingsRepository.setSetting error:', error);
      throw error;
    }
  }

  /**
   * Delete a setting
   * @param {string} orgId - Organization ID
   * @param {string} key - Setting key
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteSetting(orgId, key) {
    try {
      const result = await this._getPool().query(
        `DELETE FROM organization_settings
         WHERE organization_id = $1 AND setting_key = $2`,
        [orgId, key]
      );
      return result.rowCount > 0;
    } catch (error) {
      logger.error('OrganizationSettingsRepository.deleteSetting error:', error);
      throw error;
    }
  }

  /**
   * Get settings by type
   * @param {string} orgId - Organization ID
   * @param {string} type - Setting type
   * @returns {Promise<Object>} Settings of specified type
   */
  async getSettingsByType(orgId, type) {
    try {
      const result = await this._getPool().query(
        `SELECT setting_key, setting_value
         FROM organization_settings
         WHERE organization_id = $1 AND setting_type = $2`,
        [orgId, type]
      );

      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_key] = row.setting_value;
      });

      return settings;
    } catch (error) {
      logger.error('OrganizationSettingsRepository.getSettingsByType error:', error);
      throw error;
    }
  }
}

module.exports = new OrganizationSettingsRepository();