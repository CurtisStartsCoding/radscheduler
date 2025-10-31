/**
 * HL7 Scheduling Additions for sms-conversation.js
 * These functions should be added to sms-conversation.js and exported in module.exports
 */

const { getPool } = require('../db/connection');
const logger = require('../utils/logger');
const { decryptPhoneNumber } = require('../utils/phone-hash');
const { sendSMS } = require('./notifications');
const { logSMSInteraction, MESSAGE_TYPES, CONSENT_STATUS } = require('./sms-audit');

// Import STATES from sms-conversation.js
const { STATES } = require('./sms-conversation');

/**
 * Find conversation by patient MRN
 * Searches for active conversations where order_data contains the specified MRN
 * @param {string} mrn - Patient MRN
 * @returns {Promise<Object|null>} - Found conversation or null
 */
async function findConversationByMRN(mrn) {
  const pool = getPool();

  try {
    // Query conversations where order_data contains MRN in various possible fields
    // Handle both base MRN (e.g., "FHRD7NZ4CVZZ7KR") and formatted MRN (e.g., "FHRD7NZ4CVZZ7KR^^^EMR^MR")
    const result = await pool.query(
      `SELECT * FROM sms_conversations
       WHERE (
         (order_data->>'patientId' = $1)
         OR (order_data->'patient'->>'mrn' = $1)
         OR (order_data->>'patientMrn' = $1)
         OR (split_part(order_data->>'patientMrn', '^', 1) = $1)
       )
       AND state NOT IN ('EXPIRED', 'CANCELLED')
       AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC
       LIMIT 1`,
      [mrn]
    );

    const conversation = result.rows.length > 0 ? result.rows[0] : null;

    if (conversation) {
      logger.info('Found conversation by MRN', {
        conversationId: conversation.id,
        mrn,
        state: conversation.state
      });
    } else {
      logger.warn('No active conversation found for MRN', { mrn });
    }

    return conversation;
  } catch (error) {
    logger.error('Failed to find conversation by MRN', {
      error: error.message,
      mrn
    });
    throw error;
  }
}

/**
 * Store available appointment slots in conversation
 * @param {number} conversationId - Conversation ID
 * @param {Array} slots - Array of available time slots from HL7 SRR
 * @returns {Promise<void>}
 */
async function storeAvailableSlots(conversationId, slots) {
  const pool = getPool();

  try {
    await pool.query(
      `UPDATE sms_conversations
       SET order_data = jsonb_set(
         COALESCE(order_data, '{}'::jsonb),
         '{availableSlots}',
         $1::jsonb
       ),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(slots), conversationId]
    );

    logger.info('Stored available slots in conversation', {
      conversationId,
      slotsCount: slots.length
    });
  } catch (error) {
    logger.error('Failed to store available slots', {
      error: error.message,
      conversationId,
      slotsCount: slots?.length
    });
    throw error;
  }
}

/**
 * Update conversation with appointment details
 * @param {number} conversationId - Conversation ID
 * @param {Object} appointmentData - Appointment details from HL7 SIU
 * @returns {Promise<void>}
 */
async function updateAppointmentStatus(conversationId, appointmentData) {
  const pool = getPool();

  try {
    await pool.query(
      `UPDATE sms_conversations
       SET order_data = jsonb_set(
         COALESCE(order_data, '{}'::jsonb),
         '{appointment}',
         $1::jsonb
       ),
       state = $2,
       completed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        JSON.stringify(appointmentData),
        STATES.CONFIRMED,
        conversationId
      ]
    );

    logger.info('Updated conversation with appointment details', {
      conversationId,
      appointmentId: appointmentData.appointmentId,
      status: appointmentData.status
    });
  } catch (error) {
    logger.error('Failed to update appointment status', {
      error: error.message,
      conversationId,
      appointmentData
    });
    throw error;
  }
}

/**
 * Send formatted slot options to patient via SMS
 * @param {Object} conversation - Conversation object
 * @param {Array} slots - Array of available time slots
 * @returns {Promise<void>}
 */
async function sendSlotOptions(conversation, slots) {
  const pool = getPool();

  try {
    // Decrypt phone number from conversation
    const phoneNumber = decryptPhoneNumber(conversation.encrypted_phone);

    if (!phoneNumber) {
      logger.error('Failed to decrypt phone number', {
        conversationId: conversation.id
      });
      throw new Error('Phone number not available');
    }

    // Format slots for SMS display
    let message = 'Available times:\n\n';

    slots.slice(0, 5).forEach((slot, index) => {
      const date = new Date(slot.dateTime);
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      message += `${index + 1}. ${dateStr} at ${timeStr}\n`;
    });

    message += `\nReply with the number (1-${Math.min(slots.length, 5)})`;

    // Update conversation state to CHOOSING_TIME
    await pool.query(
      `UPDATE sms_conversations
       SET state = $1,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [STATES.CHOOSING_TIME, conversation.id]
    );

    // Send SMS with available slots
    await sendSMS(phoneNumber, message);

    logger.info('Sent slot options via SMS', {
      conversationId: conversation.id,
      slotsCount: slots.length
    });

    // Log SMS interaction
    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_TIME_SLOTS,
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString()
    });

  } catch (error) {
    logger.error('Failed to send slot options', {
      error: error.message,
      conversationId: conversation?.id
    });
    throw error;
  }
}

module.exports = {
  findConversationByMRN,
  storeAvailableSlots,
  updateAppointmentStatus,
  sendSlotOptions
};

/*
 * ADD THESE TO sms-conversation.js module.exports:
 *
 * module.exports = {
 *   startConversation,
 *   handleInboundMessage,
 *   getActiveConversation,
 *   getActiveConversationByPhone,
 *   addOrderToConversation,
 *   findConversationByMRN,         // ADD
 *   storeAvailableSlots,           // ADD
 *   updateAppointmentStatus,       // ADD
 *   sendSlotOptions,               // ADD
 *   STATES
 * };
 */
