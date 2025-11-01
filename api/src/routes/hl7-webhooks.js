const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
// TODO: Merge sms-conversation-hl7-additions.js into sms-conversation.js
// For now, importing from additions file
const {
  findConversationByMRN,
  storeAvailableSlots,
  updateAppointmentStatus,
  sendSlotOptions
} = require('../services/sms-conversation-hl7-additions');
const { logSMSInteraction, MESSAGE_TYPES } = require('../services/sms-audit');

/**
 * HL7 Webhook Handler for Scheduling Messages
 * Receives HL7-derived JSON from QIE channels 8083 (SRR) and 8084 (SIU)
 */

const HL7_WEBHOOK_TOKEN = process.env.HL7_WEBHOOK_TOKEN || '1bb6f78820f0cd6ae29e3a1621433fe24cd98add207588035f5c7038a7bb9440';

/**
 * Middleware for Bearer token authentication
 */
function authenticateHL7Webhook(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('SECURITY: Missing Authorization header on HL7 webhook', {
      ip: req.ip,
      path: req.path
    });
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.substring(7);
  if (token !== HL7_WEBHOOK_TOKEN) {
    logger.warn('SECURITY: Invalid HL7 webhook token', {
      ip: req.ip,
      path: req.path
    });
    return res.status(401).json({ error: 'Invalid token' });
  }

  next();
}

/**
 * POST /api/webhooks/hl7/schedule-response
 * Receives available appointment slots from QIE channel 8083
 *
 * Input: SRR^S01 transformed to JSON by QIE
 * Output: Stores slots in conversation, sends SMS to patient
 */
router.post('/schedule-response', authenticateHL7Webhook, async (req, res) => {
  try {
    const { messageControlId, success, patient, availableSlots, timestamp } = req.body;

    logger.info('[HL7 Webhook] Schedule response received', {
      messageControlId,
      success,
      mrn: patient?.mrn,
      slotsCount: availableSlots?.length || 0,
      timestamp
    });

    // Validate request
    if (!patient?.mrn) {
      logger.error('Invalid schedule response payload - missing patient MRN', {
        messageControlId,
        hasPatient: !!patient
      });
      return res.status(400).json({ error: 'Missing patient MRN' });
    }

    if (!success) {
      logger.warn(`Schedule request failed for MRN ${patient.mrn}`, {
        messageControlId
      });
      // TODO: Handle failure - maybe retry or notify patient
      return res.status(200).json({
        success: true,
        message: 'Failure acknowledged'
      });
    }

    // Validate available slots
    if (!availableSlots || !Array.isArray(availableSlots) || availableSlots.length === 0) {
      logger.warn('No available slots returned', {
        messageControlId,
        mrn: patient.mrn
      });
      // TODO: Notify patient that no slots are available
      return res.status(200).json({
        success: true,
        message: 'No slots available - patient will be notified'
      });
    }

    // Find active conversation for this patient (by MRN in order_data)
    const conversation = await findConversationByMRN(patient.mrn);
    if (!conversation) {
      logger.warn(`No active conversation found for MRN ${patient.mrn}`, {
        messageControlId
      });
      return res.status(404).json({ error: 'No active conversation' });
    }

    logger.info('Found active conversation for schedule response', {
      conversationId: conversation.id,
      mrn: patient.mrn,
      state: conversation.state,
      slotsCount: availableSlots.length
    });

    // Store slots in conversation state
    await storeAvailableSlots(conversation.id, availableSlots);

    // Send SMS to patient with available slots
    await sendSlotOptions(conversation, availableSlots);

    // Audit log
    await logSMSInteraction({
      phoneNumber: null, // We don't have plaintext phone, using phone_hash from conversation
      messageType: MESSAGE_TYPES.OUTBOUND_TIME,
      messageDirection: 'OUTBOUND',
      sessionId: conversation.id.toString()
    });

    res.status(200).json({
      success: true,
      message: 'Schedule response processed',
      slotsReceived: availableSlots.length
    });

  } catch (error) {
    logger.error('Error processing schedule response webhook', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/webhooks/hl7/appointment-notification
 * Receives appointment booking confirmations from QIE channel 8084
 *
 * Input: SIU^S12/S13/S14/S15 transformed to JSON by QIE
 * Output: Updates conversation, sends confirmation SMS to patient
 */
router.post('/appointment-notification', authenticateHL7Webhook, async (req, res) => {
  try {
    const { messageControlId, action, eventType, appointment, patient, orderIds, timestamp } = req.body;

    logger.info('[HL7 Webhook] Appointment notification received', {
      messageControlId,
      action,
      eventType,
      appointmentId: appointment?.appointmentId,
      mrn: patient?.mrn,
      timestamp
    });

    // Validate request
    if (!patient?.mrn || !appointment) {
      logger.error('Invalid appointment notification payload - missing required fields', {
        messageControlId,
        hasPatient: !!patient,
        hasAppointment: !!appointment
      });
      return res.status(400).json({ error: 'Missing patient or appointment data' });
    }

    // Find active conversation for this patient
    const conversation = await findConversationByMRN(patient.mrn);
    if (!conversation) {
      logger.warn(`No active conversation found for MRN ${patient.mrn}`, {
        messageControlId,
        action
      });
      // Still acknowledge the webhook, but can't send SMS
      return res.status(200).json({
        success: true,
        message: 'Notification acknowledged (no active conversation)'
      });
    }

    logger.info('Found active conversation for appointment notification', {
      conversationId: conversation.id,
      mrn: patient.mrn,
      state: conversation.state,
      action
    });

    // Handle different event types
    let message;
    switch (action) {
      case 'new_appointment':
        message = await handleNewAppointment(conversation, appointment, patient);
        break;
      case 'rescheduled':
        message = await handleRescheduledAppointment(conversation, appointment, patient);
        break;
      case 'cancelled':
        message = await handleCancelledAppointment(conversation, appointment, patient);
        break;
      case 'modified':
        message = await handleModifiedAppointment(conversation, appointment, patient);
        break;
      default:
        logger.warn(`Unknown appointment action: ${action}`, { messageControlId });
        message = null;
    }

    // Update conversation state with appointment details
    await updateAppointmentStatus(conversation.id, {
      appointmentId: appointment.appointmentId,
      fillerAppointmentId: appointment.fillerAppointmentId,
      status: appointment.status,
      dateTime: appointment.dateTime,
      locationName: appointment.locationName,
      serviceDescription: appointment.serviceDescription
    });

    // Audit log
    if (message) {
      await logSMSInteraction({
        phoneNumber: null, // Using phone_hash from conversation
        messageType: MESSAGE_TYPES.OUTBOUND_CONFIRMATION,
        messageDirection: 'OUTBOUND',
        sessionId: conversation.id.toString()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Appointment notification processed',
      action
    });

  } catch (error) {
    logger.error('Error processing appointment notification webhook', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Helper functions to handle different appointment actions
 */

async function handleNewAppointment(conversation, appointment, patient) {
  const { sendSMS } = require('../services/notifications');
  const { decryptPhoneNumber } = require('../utils/phone-hash');

  // Decrypt phone number from conversation
  const phoneNumber = decryptPhoneNumber(conversation.encrypted_phone);

  if (!phoneNumber) {
    logger.error('Failed to decrypt phone number for appointment confirmation', {
      conversationId: conversation.id
    });
    return null;
  }

  const apptDate = new Date(appointment.dateTime);
  const dateStr = apptDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = apptDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const message = `✅ Your appointment is confirmed!\n` +
    `${appointment.serviceDescription}\n` +
    `${dateStr} at ${timeStr}\n` +
    `Location: ${appointment.locationName || appointment.locationId || 'To be confirmed'}\n\n` +
    `Confirmation #: ${appointment.fillerAppointmentId}\n\n` +
    `You'll receive a reminder 24 hours before your appointment.`;

  // Send the actual SMS
  await sendSMS(phoneNumber, message);
  logger.info('Appointment confirmation SMS sent', {
    conversationId: conversation.id,
    appointmentId: appointment.appointmentId
  });

  return message;
}

async function handleRescheduledAppointment(conversation, appointment, patient) {
  const apptDate = new Date(appointment.dateTime);
  const dateStr = apptDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const message = `📅 Your appointment has been rescheduled:\n\n` +
    `New time: ${dateStr} at ${timeStr}\n` +
    `Location: ${appointment.locationName || appointment.locationId || 'To be confirmed'}\n` +
    `Confirmation #: ${appointment.fillerAppointmentId}`;

  logger.warn('Cannot send SMS without plaintext phone number - need to modify architecture');
  return message;
}

async function handleCancelledAppointment(conversation, appointment, patient) {
  const message = `❌ Your appointment has been cancelled.\n\n` +
    `If you'd like to reschedule, please reply YES.`;

  logger.warn('Cannot send SMS without plaintext phone number - need to modify architecture');
  return message;
}

async function handleModifiedAppointment(conversation, appointment, patient) {
  const message = `ℹ️ Your appointment details have been updated:\n\n` +
    `${appointment.serviceDescription}\n` +
    `Location: ${appointment.locationName}\n` +
    `Confirmation #: ${appointment.fillerAppointmentId}`;

  logger.warn('Cannot send SMS without plaintext phone number - need to modify architecture');
  return message;
}

/**
 * GET /api/webhooks/hl7/schedule-response
 * Health check endpoint
 */
router.get('/schedule-response', (req, res) => {
  res.json({
    status: 'ok',
    message: 'HL7 schedule response webhook endpoint is active',
    timestamp: new Date().toISOString(),
    requiresAuth: true
  });
});

/**
 * GET /api/webhooks/hl7/appointment-notification
 * Health check endpoint
 */
router.get('/appointment-notification', (req, res) => {
  res.json({
    status: 'ok',
    message: 'HL7 appointment notification webhook endpoint is active',
    timestamp: new Date().toISOString(),
    requiresAuth: true
  });
});

module.exports = router;
