const axios = require('axios');
const logger = require('../utils/logger');
const { query } = require('../db/connection');

class AvreoIntegration {
  constructor() {
    this.baseUrl = process.env.AVREO_API_URL || 'https://your-avreo-instance.com/api';
    this.apiKey = process.env.AVREO_API_KEY;
    this.username = process.env.AVREO_USERNAME;
    this.password = process.env.AVREO_PASSWORD;
    this.lastSync = null;
  }

  // Authenticate with Avreo API
  async authenticate() {
    try {
      const response = await axios.post(`${this.baseUrl}/auth/login`, {
        username: this.username,
        password: this.password
      });
      
      this.token = response.data.token;
      logger.info('Avreo authentication successful');
      return true;
    } catch (error) {
      logger.error('Avreo authentication failed:', error.message);
      return false;
    }
  }

  // Fetch appointments from Avreo calendar
  async fetchAppointments(startDate, endDate) {
    try {
      if (!this.token) {
        await this.authenticate();
      }

      const response = await axios.get(`${this.baseUrl}/calendar/appointments`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          includeCancelled: false
        }
      });

      logger.info(`Fetched ${response.data.appointments?.length || 0} appointments from Avreo`);
      return response.data.appointments || [];
    } catch (error) {
      logger.error('Failed to fetch Avreo appointments:', error.message);
      return [];
    }
  }

  // Sync Avreo appointments to RadScheduler database
  async syncAppointments() {
    try {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30); // Sync next 30 days

      const avreoAppointments = await this.fetchAppointments(startDate, endDate);
      
      for (const avreoApt of avreoAppointments) {
        await this.syncSingleAppointment(avreoApt);
      }

      this.lastSync = new Date();
      logger.info(`Avreo sync completed: ${avreoAppointments.length} appointments processed`);
      
      return {
        success: true,
        synced: avreoAppointments.length,
        timestamp: this.lastSync
      };
    } catch (error) {
      logger.error('Avreo sync failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Sync a single appointment from Avreo to RadScheduler
  async syncSingleAppointment(avreoApt) {
    try {
      // Check if appointment already exists
      const existing = await query(
        'SELECT id FROM appointments WHERE avreo_id = $1',
        [avreoApt.id]
      );

      const appointmentData = {
        avreo_id: avreoApt.id,
        patient_id: avreoApt.patientId || `AVREO_${avreoApt.id}`,
        patient_name: avreoApt.patientName,
        patient_phone: avreoApt.patientPhone,
        modality: avreoApt.modality,
        study_type: avreoApt.studyType,
        datetime: new Date(avreoApt.scheduledTime),
        status: this.mapAvreoStatus(avreoApt.status),
        referring_physician: avreoApt.referringPhysician,
        urgency: avreoApt.urgency || 'routine',
        notes: avreoApt.notes,
        last_synced: new Date()
      };

      if (existing.rows.length > 0) {
        // Update existing appointment
        await query(`
          UPDATE appointments 
          SET patient_name = $1, patient_phone = $2, modality = $3, 
              study_type = $4, datetime = $5, status = $6, 
              referring_physician = $7, urgency = $8, notes = $9, last_synced = $10
          WHERE avreo_id = $11
        `, [
          appointmentData.patient_name,
          appointmentData.patient_phone,
          appointmentData.modality,
          appointmentData.study_type,
          appointmentData.datetime,
          appointmentData.status,
          appointmentData.referring_physician,
          appointmentData.urgency,
          appointmentData.notes,
          appointmentData.last_synced,
          appointmentData.avreo_id
        ]);
      } else {
        // Insert new appointment
        await query(`
          INSERT INTO appointments (
            avreo_id, patient_id, patient_name, patient_phone, modality, 
            study_type, datetime, status, referring_physician, urgency, notes, last_synced
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          appointmentData.avreo_id,
          appointmentData.patient_id,
          appointmentData.patient_name,
          appointmentData.patient_phone,
          appointmentData.modality,
          appointmentData.study_type,
          appointmentData.datetime,
          appointmentData.status,
          appointmentData.referring_physician,
          appointmentData.urgency,
          appointmentData.notes,
          appointmentData.last_synced
        ]);
      }

      logger.info(`Synced Avreo appointment: ${avreoApt.id} - ${avreoApt.patientName}`);
    } catch (error) {
      logger.error(`Failed to sync Avreo appointment ${avreoApt.id}:`, error.message);
    }
  }

  // Map Avreo status to RadScheduler status
  mapAvreoStatus(avreoStatus) {
    const statusMap = {
      'scheduled': 'SCHEDULED',
      'confirmed': 'SCHEDULED',
      'completed': 'COMPLETED',
      'cancelled': 'CANCELLED',
      'no_show': 'CANCELLED'
    };
    return statusMap[avreoStatus?.toLowerCase()] || 'SCHEDULED';
  }

  // Get sync status
  getSyncStatus() {
    return {
      lastSync: this.lastSync,
      isConnected: !!this.token,
      baseUrl: this.baseUrl
    };
  }
}

module.exports = new AvreoIntegration(); 