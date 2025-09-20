/**
 * RIS Adapter Factory
 * Single Responsibility: Create appropriate RIS adapter instances
 * This factory ONLY creates adapters - doesn't manage configuration or connections
 */

const GenericHL7Adapter = require('./generic-hl7-adapter');
const AvreoAdapter = require('./avreo-adapter');
const logger = require('../utils/logger');

class RISAdapterFactory {
  constructor() {
    // Registry of available adapters
    this.adapters = new Map([
      ['generic', GenericHL7Adapter],
      ['generic-hl7', GenericHL7Adapter],
      ['avreo', AvreoAdapter],
      // Additional adapters can be registered here
    ]);
  }

  /**
   * Create a RIS adapter instance
   * @param {string} type - Adapter type
   * @param {Object} config - Adapter configuration
   * @returns {BaseRISAdapter} Adapter instance
   */
  create(type, config) {
    const adapterType = type.toLowerCase();

    if (!this.adapters.has(adapterType)) {
      logger.warn(`Unknown adapter type: ${type}, falling back to generic`);
      return this._createGenericAdapter(config);
    }

    const AdapterClass = this.adapters.get(adapterType);

    try {
      const adapter = new AdapterClass(config);
      logger.info(`Created ${adapterType} adapter for org ${config.organizationId}`);
      return adapter;
    } catch (error) {
      logger.error(`Failed to create ${adapterType} adapter:`, error);
      throw new Error(`Failed to create RIS adapter: ${error.message}`);
    }
  }

  /**
   * Register a custom adapter
   * @param {string} type - Adapter type identifier
   * @param {Class} AdapterClass - Adapter class
   */
  registerAdapter(type, AdapterClass) {
    if (!type || !AdapterClass) {
      throw new Error('Type and AdapterClass are required');
    }

    this.adapters.set(type.toLowerCase(), AdapterClass);
    logger.info(`Registered adapter type: ${type}`);
  }

  /**
   * Get list of available adapter types
   * @returns {Array<string>} Available adapter types
   */
  getAvailableTypes() {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if adapter type is available
   * @param {string} type - Adapter type
   * @returns {boolean} True if available
   */
  hasAdapter(type) {
    return this.adapters.has(type.toLowerCase());
  }

  /**
   * Create a generic adapter as fallback
   * @private
   */
  _createGenericAdapter(config) {
    return new GenericHL7Adapter(config);
  }
}

// Export singleton instance
module.exports = new RISAdapterFactory();