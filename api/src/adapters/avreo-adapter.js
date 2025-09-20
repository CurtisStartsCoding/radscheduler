/**
 * Avreo RIS Adapter
 * Single Responsibility: Handle Avreo-specific RIS integration
 * This adapter ONLY manages Avreo API communication
 */

const BaseRISAdapter = require('./base-ris-adapter');
const axios = require('axios');
const logger = require('../utils/logger');

class AvreoAdapter extends BaseRISAdapter {
  constructor(config) {
    super(config);
    this.apiUrl = config.api_url || config.avreo_api_url;
    this.apiKey = config.api_key || config.avreo_api_key;
    this.username = config.username || config.avreo_username;
    this.password = config.password || config.avreo_password;
    this.token = null;
    this.tokenExpiry = null;
  }

  async connect() {
    try {
      // Authenticate with Avreo
      const response = await axios.post(
        `${this.apiUrl}/auth/login`,
        {
          username: this.username,
          password: this.password
        },
        {
          headers: {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      if (response.data && response.data.token) {
        this.token = response.data.token;
        this.tokenExpiry = new Date(Date.now() + 3600000); // 1 hour
        this.isConnected = true;
        logger.info('Avreo adapter connected successfully');
        return true;
      }

      this.isConnected = false;
      return false;
    } catch (error) {
      logger.error('AvreoAdapter connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    this.token = null;
    this.tokenExpiry = null;
    this.isConnected = false;
  }

  async fetchAppointments(startDate, endDate) {
    try {
      await this._ensureConnected();

      const response = await axios.get(
        `${this.apiUrl}/calendar/appointments`,
        {
          headers: this._getAuthHeaders(),
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            includeCancelled: false
          },
          timeout: 10000
        }
      );

      const appointments = response.data.appointments || [];
      return appointments.map(apt => this._transformAvreoToInternal(apt));
    } catch (error) {
      logger.error('AvreoAdapter.fetchAppointments error:', error);
      return [];
    }
  }

  async createAppointment(appointmentData) {
    try {
      await this._ensureConnected();

      const avreoData = this._transformInternalToAvreo(appointmentData);

      const response = await axios.post(
        `${this.apiUrl}/calendar/appointments`,
        avreoData,
        {
          headers: this._getAuthHeaders(),
          timeout: 10000
        }
      );

      return this._transformAvreoToInternal(response.data);
    } catch (error) {
      logger.error('AvreoAdapter.createAppointment error:', error);
      throw error;
    }
  }

  async updateAppointment(appointmentId, updateData) {
    try {
      await this._ensureConnected();

      const avreoData = this._transformInternalToAvreo(updateData);

      const response = await axios.put(
        `${this.apiUrl}/calendar/appointments/${appointmentId}`,
        avreoData,
        {
          headers: this._getAuthHeaders(),
          timeout: 10000
        }
      );

      return this._transformAvreoToInternal(response.data);
    } catch (error) {
      logger.error('AvreoAdapter.updateAppointment error:', error);
      throw error;
    }
  }

  async cancelAppointment(appointmentId, reason) {
    try {
      await this._ensureConnected();

      const response = await axios.delete(
        `${this.apiUrl}/calendar/appointments/${appointmentId}`,
        {
          headers: this._getAuthHeaders(),
          data: { cancellationReason: reason },
          timeout: 10000
        }
      );

      return response.status === 200 || response.status === 204;
    } catch (error) {
      logger.error('AvreoAdapter.cancelAppointment error:', error);
      return false;
    }
  }

  async getAvailableSlots(date, modality, duration) {
    try {
      await this._ensureConnected();

      const response = await axios.get(
        `${this.apiUrl}/calendar/availability`,
        {
          headers: this._getAuthHeaders(),
          params: {
            date: date.toISOString().split('T')[0],
            modality,
            duration
          },
          timeout: 10000
        }
      );

      return response.data.slots || [];
    } catch (error) {
      logger.error('AvreoAdapter.getAvailableSlots error:', error);
      return [];
    }
  }

  async sendHL7Message(messageType, messageData) {
    try {
      await this._ensureConnected();

      const response = await axios.post(
        `${this.apiUrl}/hl7/send`,
        {
          messageType,
          messageData
        },
        {
          headers: this._getAuthHeaders(),
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logger.error('AvreoAdapter.sendHL7Message error:', error);
      throw error;
    }
  }

  getType() {
    return 'avreo';
  }

  getSupportedFeatures() {
    return [
      'appointments',
      'hl7',
      'scheduling',
      'cancellation',
      'availability',
      'documents',
      'worklist'
    ];
  }

  // Private helper methods

  async _ensureConnected() {
    // Check if token is expired
    if (this.tokenExpiry && new Date() > this.tokenExpiry) {
      this.isConnected = false;
    }

    if (!this.isConnected) {
      const connected = await this.connect();
      if (!connected) {
        throw new Error('Failed to connect to Avreo');
      }
    }
  }

  _getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      'X-Organization-Id': this.organizationId
    };
  }

  _transformAvreoToInternal(avreoAppointment) {
    return {
      externalId: avreoAppointment.id,
      avreoId: avreoAppointment.id, // Keep Avreo ID for sync
      patientId: avreoAppointment.patient?.id || avreoAppointment.patientId,
      patientName: avreoAppointment.patient?.name || avreoAppointment.patientName,
      patientPhone: avreoAppointment.patient?.phone || avreoAppointment.patientPhone,
      datetime: avreoAppointment.scheduledTime || avreoAppointment.datetime,
      modality: avreoAppointment.modality,
      studyType: avreoAppointment.studyType || avreoAppointment.procedure,
      status: this._mapAvreoStatus(avreoAppointment.status),
      duration: avreoAppointment.duration || 30,
      referringPhysician: avreoAppointment.referringDoctor,
      notes: avreoAppointment.notes,
      organizationId: this.organizationId
    };
  }

  _transformInternalToAvreo(internalAppointment) {
    return {
      patientId: internalAppointment.patientId,
      patientName: internalAppointment.patientName,
      patientPhone: internalAppointment.patientPhone,
      scheduledTime: internalAppointment.datetime,
      modality: internalAppointment.modality,
      procedure: internalAppointment.studyType,
      duration: internalAppointment.duration || 30,
      referringDoctor: internalAppointment.referringPhysician,
      notes: internalAppointment.notes,
      status: this._mapInternalStatus(internalAppointment.status)
    };
  }

  _mapAvreoStatus(avreoStatus) {
    const statusMap = {
      'scheduled': 'SCHEDULED',
      'completed': 'COMPLETED',
      'cancelled': 'CANCELLED',
      'no_show': 'NO_SHOW',
      'in_progress': 'IN_PROGRESS'
    };
    return statusMap[avreoStatus?.toLowerCase()] || 'SCHEDULED';
  }

  _mapInternalStatus(internalStatus) {
    const statusMap = {
      'SCHEDULED': 'scheduled',
      'COMPLETED': 'completed',
      'CANCELLED': 'cancelled',
      'NO_SHOW': 'no_show',
      'IN_PROGRESS': 'in_progress'
    };
    return statusMap[internalStatus] || 'scheduled';
  }
}

module.exports = AvreoAdapter;