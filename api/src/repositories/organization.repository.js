/**
 * Organization Repository
 * Single Responsibility: Data access layer for organizations
 * This class ONLY handles database operations - no business logic
 */

const { getPool } = require('../db/connection');
const logger = require('../utils/logger');

class OrganizationRepository {
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
   * Find organization by ID
   * @param {string} id - Organization UUID
   * @returns {Promise<Object|null>} Organization data or null
   */
  async findById(id) {
    try {
      const result = await this._getPool().query(
        'SELECT * FROM organizations WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('OrganizationRepository.findById error:', error);
      throw error;
    }
  }

  /**
   * Find organization by slug
   * @param {string} slug - Organization slug
   * @returns {Promise<Object|null>} Organization data or null
   */
  async findBySlug(slug) {
    try {
      const result = await this._getPool().query(
        'SELECT * FROM organizations WHERE slug = $1 AND is_active = true',
        [slug]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('OrganizationRepository.findBySlug error:', error);
      throw error;
    }
  }

  /**
   * Create new organization
   * @param {Object} data - Organization data
   * @returns {Promise<Object>} Created organization
   */
  async create(data) {
    try {
      const { slug, name } = data;
      const result = await this._getPool().query(
        `INSERT INTO organizations (slug, name)
         VALUES ($1, $2)
         RETURNING *`,
        [slug, name]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('OrganizationRepository.create error:', error);
      throw error;
    }
  }

  /**
   * Update organization
   * @param {string} id - Organization ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated organization
   */
  async update(id, data) {
    try {
      const { name, is_active } = data;
      const result = await this._getPool().query(
        `UPDATE organizations
         SET name = COALESCE($2, name),
             is_active = COALESCE($3, is_active)
         WHERE id = $1
         RETURNING *`,
        [id, name, is_active]
      );
      return result.rows[0];
    } catch (error) {
      logger.error('OrganizationRepository.update error:', error);
      throw error;
    }
  }

  /**
   * List all active organizations
   * @returns {Promise<Array>} List of organizations
   */
  async listActive() {
    try {
      const result = await this._getPool().query(
        'SELECT * FROM organizations WHERE is_active = true ORDER BY name'
      );
      return result.rows;
    } catch (error) {
      logger.error('OrganizationRepository.listActive error:', error);
      throw error;
    }
  }

  /**
   * Check if slug exists
   * @param {string} slug - Slug to check
   * @returns {Promise<boolean>} True if exists
   */
  async slugExists(slug) {
    try {
      const result = await this._getPool().query(
        'SELECT 1 FROM organizations WHERE slug = $1',
        [slug]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error('OrganizationRepository.slugExists error:', error);
      throw error;
    }
  }
}

module.exports = new OrganizationRepository();