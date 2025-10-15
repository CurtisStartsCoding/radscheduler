const express = require('express');
const router = express.Router();
const { getPool } = require('../db/connection');
const { sendSMS } = require('../services/notifications');
const logger = require('../utils/logger');
const Joi = require('joi');
const schedulingConfig = require('../config/scheduling');

// Validation schemas
const selfScheduleSchema = Joi.object({
  patientName: Joi.string().min(2).max(100).required(),
  patientPhone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  patientEmail: Joi.string().email().optional(),
  modality: Joi.string().required(),
  studyType: Joi.string().required(),
  preferredDate: Joi.string().isoDate().required(),
  preferredTime: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  urgency: Joi.string().valid('routine', 'urgent', 'emergency').default('routine'),
  notes: Joi.string().max(500).optional()
});

const availabilitySchema = Joi.object({
  date: Joi.string().isoDate().required(),
  modality: Joi.string().optional(),
  duration: Joi.number().min(15).max(120).default(30)
});

// Get available appointment slots
router.get('/available-slots', async (req, res) => {
  // Check if patient self-scheduling is enabled
  if (!schedulingConfig.isPatientSelfSchedulingEnabled()) {
    return res.status(403).json({
      success: false,
      error: 'Patient self-scheduling is not enabled for this RIS'
    });
  }

  const { error } = availabilitySchema.validate(req.query);
  if (error) return res.status(400).json({ success: false, error: error.message });

  try {
    const { date, modality, duration = 30 } = req.query;
    
    // Check if modality is allowed for self-scheduling
    if (!schedulingConfig.isModalityAllowedForSelfScheduling(modality)) {
      return res.status(403).json({
        success: false,
        error: `${modality} appointments cannot be self-scheduled. Please contact the office.`
      });
    }

    const targetDate = new Date(date);
    const config = schedulingConfig.patientSelfScheduling;
    
    // Use configured business hours
    const businessHours = config.businessHours;

    // Get existing appointments for the date
    const pool = getPool();
    const existingAppointments = await pool.query(`
      SELECT datetime, modality 
      FROM appointments 
      WHERE DATE(datetime) = $1 
      AND status != 'CANCELLED'
    `, [targetDate.toISOString().split('T')[0]]);

    // Generate available slots
    const availableSlots = [];
    const slotDuration = duration;
    
    for (let hour = businessHours.start; hour < businessHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        const slotTime = new Date(targetDate);
        slotTime.setHours(hour, minute, 0, 0);
        
        // Check if slot conflicts with existing appointments
        const hasConflict = existingAppointments.rows.some(apt => {
          const aptTime = new Date(apt.datetime);
          const timeDiff = Math.abs(slotTime - aptTime) / (1000 * 60); // minutes
          return timeDiff < slotDuration && (!modality || apt.modality === modality);
        });

        if (!hasConflict) {
          availableSlots.push({
            datetime: slotTime.toISOString(),
            time: slotTime.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            }),
            available: true,
            duration: slotDuration
          });
        }
      }
    }

    res.json({
      success: true,
      date: date,
      availableSlots,
      totalSlots: availableSlots.length
    });

  } catch (error) {
    logger.error('Error getting available slots:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available slots'
    });
  }
});

// Patient self-scheduling
router.post('/book-appointment', async (req, res) => {
  // Check if patient self-scheduling is enabled
  if (!schedulingConfig.isPatientSelfSchedulingEnabled()) {
    return res.status(403).json({
      success: false,
      error: 'Patient self-scheduling is not enabled for this RIS'
    });
  }

  const { error } = selfScheduleSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: error.message });

  try {
    const {
      patientName,
      patientPhone,
      patientEmail,
      modality,
      studyType,
      preferredDate,
      preferredTime,
      urgency,
      notes
    } = req.body;

    // Check if modality is allowed for self-scheduling
    if (!schedulingConfig.isModalityAllowedForSelfScheduling(modality)) {
      return res.status(403).json({
        success: false,
        error: `${modality} appointments cannot be self-scheduled. Please contact the office.`
      });
    }

    // Check if modality requires approval
    const requiresApproval = schedulingConfig.doesModalityRequireApproval(modality);
    const initialStatus = requiresApproval ? 'PENDING_APPROVAL' : 'SCHEDULED';

    // Combine date and time
    const appointmentDateTime = new Date(`${preferredDate}T${preferredTime}:00`);

    // Check if slot is still available
    const pool = getPool();
    const existingAppointments = await pool.query(`
      SELECT id FROM appointments 
      WHERE datetime = $1 
      AND status != 'CANCELLED'
    `, [appointmentDateTime]);

    if (existingAppointments.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Selected time slot is no longer available'
      });
    }

    // Create appointment
    const result = await pool.query(`
      INSERT INTO appointments (
        patient_name, patient_phone, patient_email, modality, study_type,
        datetime, status, urgency, notes, source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      patientName,
      patientPhone,
      patientEmail || null,
      modality,
      studyType,
      appointmentDateTime,
      initialStatus,
      urgency,
      notes || null,
      'patient_self_schedule'
    ]);

    const appointmentId = result.rows[0].id;

    // Send appropriate SMS based on approval status
    let smsMessage;
    if (requiresApproval) {
      smsMessage = `Your ${modality} appointment request for ${studyType} has been submitted for approval. We will contact you within 24 hours to confirm. Confirmation #${appointmentId}.`;
    } else {
      smsMessage = `Your ${modality} appointment for ${studyType} has been scheduled for ${appointmentDateTime.toLocaleString()}. Confirmation #${appointmentId}. Please arrive 15 minutes early.`;
    }
    
    try {
      await sendSMS(patientPhone, smsMessage);
      logger.info('Confirmation SMS sent to patient', { phone: patientPhone, appointmentId });
    } catch (smsError) {
      logger.warn('Failed to send confirmation SMS', { error: smsError.message, appointmentId });
    }

    // Log the self-scheduling
    logger.info('Patient self-scheduled appointment', {
      appointmentId,
      patientName,
      patientPhone,
      modality,
      studyType,
      datetime: appointmentDateTime,
      requiresApproval
    });

    res.status(201).json({
      success: true,
      appointmentId,
      message: requiresApproval ? 'Appointment request submitted for approval' : 'Appointment scheduled successfully',
      requiresApproval,
      confirmation: {
        appointmentId,
        datetime: appointmentDateTime.toISOString(),
        modality,
        studyType,
        status: initialStatus
      }
    });

  } catch (error) {
    logger.error('Error booking appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to book appointment'
    });
  }
});

// Get patient's appointments
router.get('/my-appointments', async (req, res) => {
  const { phone } = req.query;
  
  if (!phone) {
    return res.status(400).json({
      success: false,
      error: 'Phone number is required'
    });
  }

  try {
    const pool = getPool();
    const result = await pool.query(`
      SELECT id, patient_name, modality, study_type, datetime, status, notes
      FROM appointments 
      WHERE patient_phone = $1 
      ORDER BY datetime DESC
    `, [phone]);

    res.json({
      success: true,
      appointments: result.rows
    });

  } catch (error) {
    logger.error('Error getting patient appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get appointments'
    });
  }
});

// Cancel patient appointment
router.post('/cancel-appointment', async (req, res) => {
  const { appointmentId, patientPhone } = req.body;

  if (!appointmentId || !patientPhone) {
    return res.status(400).json({
      success: false,
      error: 'Appointment ID and phone number are required'
    });
  }

  try {
    const pool = getPool();
    // Verify patient owns the appointment
    const appointment = await pool.query(`
      SELECT id, patient_name, datetime, modality, study_type
      FROM appointments 
      WHERE id = $1 AND patient_phone = $2
    `, [appointmentId, patientPhone]);

    if (appointment.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found or not authorized to cancel'
      });
    }

    // Cancel the appointment
    await pool.query(`
      UPDATE appointments 
      SET status = 'CANCELLED', notes = CONCAT(COALESCE(notes, ''), ' - Cancelled by patient')
      WHERE id = $1
    `, [appointmentId]);

    // Send cancellation SMS
    const apt = appointment.rows[0];
    const smsMessage = `Your ${apt.modality} appointment scheduled for ${new Date(apt.datetime).toLocaleString()} has been cancelled.`;
    
    try {
      await sendSMS(patientPhone, smsMessage);
      logger.info('Cancellation SMS sent to patient', { phone: patientPhone, appointmentId });
    } catch (smsError) {
      logger.warn('Failed to send cancellation SMS', { error: smsError.message, appointmentId });
    }

    logger.info('Patient cancelled appointment', { appointmentId, patientPhone });

    res.json({
      success: true,
      message: 'Appointment cancelled successfully'
    });

  } catch (error) {
    logger.error('Error cancelling appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel appointment'
    });
  }
});

module.exports = router; 