/**
 * Base RIS Adapter
 * Single Responsibility: Define interface contract for RIS adapters
 * This is an abstract base class - defines what methods all adapters must implement
 */

class BaseRISAdapter {
  constructor(config) {
    if (new.target === BaseRISAdapter) {
      throw new Error('BaseRISAdapter is abstract and cannot be instantiated directly');
    }

    this.config = config;
    this.organizationId = config.organizationId;
    this.isConnected = false;
  }

  /**
   * Connect to the RIS system
   * @returns {Promise<boolean>} Connection status
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from the RIS system
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Fetch appointments from RIS
   * @param {Date} startDate - Start date range
   * @param {Date} endDate - End date range
   * @returns {Promise<Array>} List of appointments
   */
  async fetchAppointments(startDate, endDate) {
    throw new Error('fetchAppointments() must be implemented by subclass');
  }

  /**
   * Create appointment in RIS
   * @param {Object} appointmentData - Appointment details
   * @returns {Promise<Object>} Created appointment
   */
  async createAppointment(appointmentData) {
    throw new Error('createAppointment() must be implemented by subclass');
  }

  /**
   * Update appointment in RIS
   * @param {string} appointmentId - Appointment ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated appointment
   */
  async updateAppointment(appointmentId, updateData) {
    throw new Error('updateAppointment() must be implemented by subclass');
  }

  /**
   * Cancel appointment in RIS
   * @param {string} appointmentId - Appointment ID
   * @param {string} reason - Cancellation reason
   * @returns {Promise<boolean>} Success status
   */
  async cancelAppointment(appointmentId, reason) {
    throw new Error('cancelAppointment() must be implemented by subclass');
  }

  /**
   * Get available time slots
   * @param {Date} date - Date to check
   * @param {string} modality - Imaging modality
   * @param {number} duration - Appointment duration in minutes
   * @returns {Promise<Array>} Available time slots
   */
  async getAvailableSlots(date, modality, duration) {
    throw new Error('getAvailableSlots() must be implemented by subclass');
  }

  /**
   * Send HL7 message to RIS
   * @param {string} messageType - HL7 message type
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} Response
   */
  async sendHL7Message(messageType, messageData) {
    throw new Error('sendHL7Message() must be implemented by subclass');
  }

  /**
   * Get adapter type
   * @returns {string} Adapter type identifier
   */
  getType() {
    throw new Error('getType() must be implemented by subclass');
  }

  /**
   * Check if adapter supports a feature
   * @param {string} feature - Feature name
   * @returns {boolean} True if supported
   */
  supportsFeature(feature) {
    // Default implementation - can be overridden
    const supportedFeatures = this.getSupportedFeatures();
    return supportedFeatures.includes(feature);
  }

  /**
   * Get list of supported features
   * @returns {Array<string>} Supported features
   */
  getSupportedFeatures() {
    // Default - subclasses should override
    return ['appointments', 'hl7'];
  }

  /**
   * Validate configuration
   * @returns {boolean} True if valid
   */
  validateConfig() {
    if (!this.config) {
      throw new Error('Configuration is required');
    }
    if (!this.organizationId) {
      throw new Error('Organization ID is required');
    }
    return true;
  }

  /**
   * Transform external appointment to internal format
   * @protected
   * @param {Object} externalAppointment - External appointment data
   * @returns {Object} Internal appointment format
   */
  _transformToInternal(externalAppointment) {
    // Base transformation - subclasses can override
    return {
      externalId: externalAppointment.id,
      patientId: externalAppointment.patientId,
      patientName: externalAppointment.patientName,
      datetime: externalAppointment.datetime,
      modality: externalAppointment.modality,
      status: externalAppointment.status,
      organizationId: this.organizationId
    };
  }

  /**
   * Transform internal appointment to external format
   * @protected
   * @param {Object} internalAppointment - Internal appointment data
   * @returns {Object} External appointment format
   */
  _transformToExternal(internalAppointment) {
    // Base transformation - subclasses can override
    return {
      id: internalAppointment.externalId,
      patientId: internalAppointment.patientId,
      patientName: internalAppointment.patientName,
      datetime: internalAppointment.datetime,
      modality: internalAppointment.modality,
      status: internalAppointment.status
    };
  }
}

module.exports = BaseRISAdapter;