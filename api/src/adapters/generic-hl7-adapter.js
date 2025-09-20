/**
 * Generic HL7 RIS Adapter
 * Single Responsibility: Handle generic HL7-based RIS integration
 * This adapter works with any RIS that supports standard HL7 messaging
 */

const BaseRISAdapter = require('./base-ris-adapter');
const axios = require('axios');
const logger = require('../utils/logger');

class GenericHL7Adapter extends BaseRISAdapter {
  constructor(config) {
    super(config);
    this.hl7Endpoint = config.hl7_endpoint;
    this.hl7Version = config.hl7_version || '2.5.1';
    this.sendingFacility = config.sending_facility || 'RADSCHEDULER';
    this.receivingFacility = config.receiving_facility || 'RIS';
  }

  async connect() {
    try {
      // Test connection with a simple query
      if (this.hl7Endpoint) {
        const response = await axios.get(`${this.hl7Endpoint}/status`, {
          timeout: 5000
        });
        this.isConnected = response.status === 200;
      } else {
        // No endpoint configured - offline mode
        this.isConnected = false;
      }
      return this.isConnected;
    } catch (error) {
      logger.warn('GenericHL7Adapter connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    this.isConnected = false;
  }

  async fetchAppointments(startDate, endDate) {
    try {
      // Build QRY^A19 message for appointment query
      const hl7Message = this._buildQueryMessage(startDate, endDate);

      const response = await this.sendHL7Message('QRY^A19', hl7Message);

      // Parse response and transform appointments
      const appointments = this._parseHL7Response(response);
      return appointments.map(apt => this._transformToInternal(apt));
    } catch (error) {
      logger.error('GenericHL7Adapter.fetchAppointments error:', error);
      return [];
    }
  }

  async createAppointment(appointmentData) {
    try {
      // Build SIU^S12 message for new appointment
      const hl7Message = this._buildSIUMessage('S12', appointmentData);

      const response = await this.sendHL7Message('SIU^S12', hl7Message);

      // Parse acknowledgment
      if (this._isAcknowledged(response)) {
        return this._transformToInternal({
          ...appointmentData,
          id: response.appointmentId || this._generateId(),
          status: 'SCHEDULED'
        });
      }

      throw new Error('Appointment creation not acknowledged');
    } catch (error) {
      logger.error('GenericHL7Adapter.createAppointment error:', error);
      throw error;
    }
  }

  async updateAppointment(appointmentId, updateData) {
    try {
      // Build SIU^S13 message for appointment update
      const hl7Message = this._buildSIUMessage('S13', {
        appointmentId,
        ...updateData
      });

      const response = await this.sendHL7Message('SIU^S13', hl7Message);

      if (this._isAcknowledged(response)) {
        return this._transformToInternal({
          id: appointmentId,
          ...updateData
        });
      }

      throw new Error('Appointment update not acknowledged');
    } catch (error) {
      logger.error('GenericHL7Adapter.updateAppointment error:', error);
      throw error;
    }
  }

  async cancelAppointment(appointmentId, reason) {
    try {
      // Build SIU^S15 message for appointment cancellation
      const hl7Message = this._buildSIUMessage('S15', {
        appointmentId,
        cancellationReason: reason
      });

      const response = await this.sendHL7Message('SIU^S15', hl7Message);

      return this._isAcknowledged(response);
    } catch (error) {
      logger.error('GenericHL7Adapter.cancelAppointment error:', error);
      return false;
    }
  }

  async getAvailableSlots(date, modality, duration) {
    // Generic implementation - check against existing appointments
    const appointments = await this.fetchAppointments(date, date);

    // Generate all possible slots
    const slots = [];
    const startHour = 8;
    const endHour = 17;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += duration) {
        const slotTime = new Date(date);
        slotTime.setHours(hour, minute, 0, 0);

        // Check if slot conflicts with existing appointments
        const hasConflict = appointments.some(apt => {
          const aptTime = new Date(apt.datetime);
          const timeDiff = Math.abs(slotTime - aptTime) / 60000; // minutes
          return timeDiff < duration;
        });

        if (!hasConflict) {
          slots.push({
            datetime: slotTime.toISOString(),
            available: true,
            duration
          });
        }
      }
    }

    return slots;
  }

  async sendHL7Message(messageType, messageData) {
    if (!this.hl7Endpoint) {
      logger.warn('No HL7 endpoint configured - message not sent');
      return { acknowledged: false };
    }

    try {
      const response = await axios.post(
        `${this.hl7Endpoint}/hl7`,
        {
          messageType,
          message: messageData,
          version: this.hl7Version
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Organization-Id': this.organizationId
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error) {
      logger.error('GenericHL7Adapter.sendHL7Message error:', error);
      throw error;
    }
  }

  getType() {
    return 'generic-hl7';
  }

  getSupportedFeatures() {
    return ['appointments', 'hl7', 'scheduling', 'cancellation'];
  }

  // Private helper methods

  _buildQueryMessage(startDate, endDate) {
    // Simplified HL7 message building
    return {
      MSH: {
        sendingFacility: this.sendingFacility,
        receivingFacility: this.receivingFacility,
        messageType: 'QRY^A19',
        timestamp: new Date().toISOString()
      },
      QRD: {
        queryDateTime: new Date().toISOString(),
        queryId: this._generateId(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    };
  }

  _buildSIUMessage(triggerEvent, data) {
    return {
      MSH: {
        sendingFacility: this.sendingFacility,
        receivingFacility: this.receivingFacility,
        messageType: `SIU^${triggerEvent}`,
        timestamp: new Date().toISOString()
      },
      SCH: {
        appointmentId: data.appointmentId || this._generateId(),
        appointmentDateTime: data.datetime,
        duration: data.duration || 30,
        modality: data.modality,
        status: data.status || 'SCHEDULED'
      },
      PID: {
        patientId: data.patientId,
        patientName: data.patientName,
        patientPhone: data.patientPhone
      }
    };
  }

  _parseHL7Response(response) {
    // Parse HL7 response into appointments
    if (!response || !response.appointments) {
      return [];
    }
    return response.appointments;
  }

  _isAcknowledged(response) {
    return response && (response.acknowledged === true || response.ACK === 'AA');
  }

  _generateId() {
    return `APT${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = GenericHL7Adapter;