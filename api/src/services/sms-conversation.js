const { getPool } = require('../db/connection');
const logger = require('../utils/logger');
const { hashPhoneNumber } = require('../utils/phone-hash');
const { sendSMS } = require('./notifications');
const { hasConsent, recordConsent, revokeConsent } = require('./patient-consent');
const { logSMSInteraction, MESSAGE_TYPES, CONSENT_STATUS } = require('./sms-audit');
const risClient = require('./ris-api-client');

/**
 * SMS Conversation State Machine
 * Manages multi-step SMS scheduling conversations
 * State flow: CONSENT_PENDING → CHOOSING_LOCATION → CHOOSING_TIME → CONFIRMED
 */

/**
 * Conversation states
 */
const STATES = {
  CONSENT_PENDING: 'CONSENT_PENDING',
  CHOOSING_ORDER: 'CHOOSING_ORDER',
  CHOOSING_LOCATION: 'CHOOSING_LOCATION',
  CHOOSING_TIME: 'CHOOSING_TIME',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};

const SESSION_TTL_HOURS = parseInt(process.env.SMS_SESSION_TTL_HOURS) || 24;

/**
 * Start a new SMS conversation for an order
 * @param {string} phoneNumber - Patient phone number
 * @param {Object} orderData - Order information from RIS
 * @returns {Promise<Object>} - Created conversation
 */
async function startConversation(phoneNumber, orderData) {
  const pool = getPool();

  try {
    const phoneHash = hashPhoneNumber(phoneNumber);
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    // Check if patient has consent
    const consented = await hasConsent(phoneNumber);

    // Create conversation record
    const result = await pool.query(
      `INSERT INTO sms_conversations
       (phone_hash, state, order_data, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        phoneHash,
        consented ? STATES.CHOOSING_LOCATION : STATES.CONSENT_PENDING,
        JSON.stringify(orderData),
        expiresAt
      ]
    );

    const conversation = result.rows[0];

    logger.info('SMS conversation started', {
      conversationId: conversation.id,
      phoneHash,
      state: conversation.state,
      orderId: orderData.orderId
    });

    // Send initial message
    if (consented) {
      await sendLocationOptions(phoneNumber, conversation);
    } else {
      await sendConsentRequest(phoneNumber, conversation);
    }

    return conversation;
  } catch (error) {
    logger.error('Failed to start conversation', {
      error: error.message,
      orderData
    });
    throw error;
  }
}

/**
 * Send consent request SMS
 */
async function sendConsentRequest(phoneNumber, conversation) {
  const message = `Hello! You have a new imaging order. Would you like to schedule your appointment via text message? Reply YES to continue or STOP to opt out.`;

  await sendSMS(phoneNumber, message);

  await logSMSInteraction({
    phoneNumber,
    messageType: MESSAGE_TYPES.OUTBOUND_CONSENT,
    messageDirection: 'OUTBOUND',
    consentStatus: CONSENT_STATUS.PENDING,
    sessionId: conversation.id.toString()
  });
}

/**
 * Send location selection options
 */
async function sendLocationOptions(phoneNumber, conversation) {
  const pool = getPool();

  try {
    const orderData = typeof conversation.order_data === 'string'
      ? JSON.parse(conversation.order_data)
      : conversation.order_data;

    // Get available locations from RIS
    const locations = await risClient.getLocations(orderData.modality);

    if (locations.length === 0) {
      await sendSMS(phoneNumber, 'Sorry, there are no available locations at this time. Please call us to schedule.');
      await updateConversationState(conversation.id, STATES.CANCELLED);
      return;
    }

    // Build location selection message with multi-procedure support
    let message = '';

    if (orderData.procedures && orderData.procedures.length > 1) {
      // Multiple procedures - list them all
      message = `Please select a location for your ${orderData.procedures.length} imaging exams:\n`;
      orderData.procedures.forEach(proc => {
        message += `• ${proc.description}\n`;
      });
      message += `(Total time: ${orderData.estimatedDuration} minutes)\n\n`;
    } else {
      // Single procedure
      const description = orderData.procedures?.[0]?.description ||
                         orderData.orderDescription ||
                         `${orderData.modality} exam`;
      message = `Please select a location for your ${description}:\n\n`;
    }

    // Add location options
    locations.slice(0, 5).forEach((loc, index) => {
      message += `${index + 1}. ${loc.name} - ${loc.address}\n`;
    });
    message += `\nReply with the number (1-${Math.min(locations.length, 5)})`;

    await sendSMS(phoneNumber, message);

    // Store locations in conversation data
    await pool.query(
      `UPDATE sms_conversations
       SET order_data = jsonb_set(order_data, '{availableLocations}', $1::jsonb)
       WHERE id = $2`,
      [JSON.stringify(locations.slice(0, 5)), conversation.id]
    );

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_LOCATION_LIST,
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString()
    });
  } catch (error) {
    logger.error('Failed to send location options', {
      error: error.message,
      conversationId: conversation.id
    });
    await sendSMS(phoneNumber, 'Sorry, there was an error. Please try again later or call us to schedule.');
  }
}

/**
 * Send time slot selection options
 */
async function sendTimeSlotOptions(phoneNumber, conversation) {
  const pool = getPool();

  try {
    const orderData = typeof conversation.order_data === 'string'
      ? JSON.parse(conversation.order_data)
      : conversation.order_data;

    const locationId = conversation.selected_location_id;
    const startDate = new Date();
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // Next 14 days

    // Get available slots from RIS
    const slots = await risClient.getAvailableSlots(locationId, orderData.modality, startDate, endDate);

    if (slots.length === 0) {
      await sendSMS(phoneNumber, 'Sorry, there are no available time slots. Please call us to schedule.');
      await updateConversationState(conversation.id, STATES.CANCELLED);
      return;
    }

    // Build time slot selection message
    let message = `Available times:\n\n`;
    slots.slice(0, 5).forEach((slot, index) => {
      const date = new Date(slot.startTime);
      message += `${index + 1}. ${date.toLocaleDateString()} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n`;
    });
    message += `\nReply with the number (1-${Math.min(slots.length, 5)})`;

    await sendSMS(phoneNumber, message);

    // Store slots in conversation data
    await pool.query(
      `UPDATE sms_conversations
       SET order_data = jsonb_set(order_data, '{availableSlots}', $1::jsonb)
       WHERE id = $2`,
      [JSON.stringify(slots.slice(0, 5)), conversation.id]
    );

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_TIME_SLOTS,
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString()
    });
  } catch (error) {
    logger.error('Failed to send time slot options', {
      error: error.message,
      conversationId: conversation.id
    });
    await sendSMS(phoneNumber, 'Sorry, there was an error. Please try again later or call us to schedule.');
  }
}

/**
 * Handle inbound SMS reply
 * @param {string} phoneNumber - Patient phone number
 * @param {string} messageBody - SMS message content
 * @returns {Promise<Object>} - Response status
 */
async function handleInboundMessage(phoneNumber, messageBody) {
  try {
    const phoneHash = hashPhoneNumber(phoneNumber);
    const normalizedMessage = messageBody.trim().toUpperCase();

    // Handle STOP (opt-out) first
    if (normalizedMessage === 'STOP' || normalizedMessage === 'UNSUBSCRIBE') {
      await revokeConsent(phoneNumber, 'Patient sent STOP command');
      await sendSMS(phoneNumber, 'You have been unsubscribed from SMS notifications. Reply START to opt back in.');

      await logSMSInteraction({
        phoneNumber,
        messageType: MESSAGE_TYPES.INBOUND_STOP,
        messageDirection: 'INBOUND',
        consentStatus: CONSENT_STATUS.REVOKED
      });

      return { success: true, action: 'STOPPED' };
    }

    // Get active conversation
    const conversation = await getActiveConversation(phoneHash);

    if (!conversation) {
      logger.warn('No active conversation for inbound message', { phoneHash });
      await sendSMS(phoneNumber, 'You don\'t have an active scheduling session. Please wait for a new appointment notification.');
      return { success: false, error: 'NO_ACTIVE_CONVERSATION' };
    }

    // Handle based on current state
    switch (conversation.state) {
      case STATES.CONSENT_PENDING:
        return await handleConsentResponse(phoneNumber, conversation, normalizedMessage);

      case STATES.CHOOSING_LOCATION:
        return await handleLocationSelection(phoneNumber, conversation, normalizedMessage);

      case STATES.CHOOSING_TIME:
        return await handleTimeSelection(phoneNumber, conversation, normalizedMessage);

      default:
        logger.warn('Conversation in unexpected state', {
          conversationId: conversation.id,
          state: conversation.state
        });
        return { success: false, error: 'INVALID_STATE' };
    }
  } catch (error) {
    logger.error('Failed to handle inbound message', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Handle consent response
 */
async function handleConsentResponse(phoneNumber, conversation, message) {
  if (message === 'YES' || message === 'Y') {
    await recordConsent(phoneNumber);
    await updateConversationState(conversation.id, STATES.CHOOSING_LOCATION);
    await sendLocationOptions(phoneNumber, { ...conversation, state: STATES.CHOOSING_LOCATION });

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.INBOUND_CONSENT_YES,
      messageDirection: 'INBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString()
    });

    return { success: true, action: 'CONSENT_GRANTED' };
  } else if (message === 'NO' || message === 'N') {
    await updateConversationState(conversation.id, STATES.CANCELLED);
    await sendSMS(phoneNumber, 'Understood. Please call us to schedule your appointment.');

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.INBOUND_CONSENT_NO,
      messageDirection: 'INBOUND',
      consentStatus: CONSENT_STATUS.NOT_CONSENTED,
      sessionId: conversation.id.toString()
    });

    return { success: true, action: 'CONSENT_DECLINED' };
  } else {
    await sendSMS(phoneNumber, 'Please reply YES to schedule via text or STOP to opt out.');
    return { success: false, error: 'INVALID_CONSENT_RESPONSE' };
  }
}

/**
 * Handle location selection
 */
async function handleLocationSelection(phoneNumber, conversation, message) {
  const pool = getPool();
  const selection = parseInt(message);

  if (isNaN(selection) || selection < 1 || selection > 5) {
    await sendSMS(phoneNumber, 'Please reply with a number (1-5) to select a location.');
    return { success: false, error: 'INVALID_LOCATION_SELECTION' };
  }

  const orderData = typeof conversation.order_data === 'string'
    ? JSON.parse(conversation.order_data)
    : conversation.order_data;

  const selectedLocation = orderData.availableLocations[selection - 1];

  if (!selectedLocation) {
    await sendSMS(phoneNumber, 'Invalid selection. Please choose a number from the list.');
    return { success: false, error: 'LOCATION_NOT_FOUND' };
  }

  // Update conversation with selected location
  await pool.query(
    `UPDATE sms_conversations
     SET selected_location_id = $1, state = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [selectedLocation.id, STATES.CHOOSING_TIME, conversation.id]
  );

  await logSMSInteraction({
    phoneNumber,
    messageType: MESSAGE_TYPES.INBOUND_LOCATION_SELECTION,
    messageDirection: 'INBOUND',
    consentStatus: CONSENT_STATUS.CONSENTED,
    sessionId: conversation.id.toString()
  });

  // Send time slot options
  await sendTimeSlotOptions(phoneNumber, {
    ...conversation,
    selected_location_id: selectedLocation.id,
    state: STATES.CHOOSING_TIME
  });

  return { success: true, action: 'LOCATION_SELECTED' };
}

/**
 * Handle time slot selection and book appointment
 */
async function handleTimeSelection(phoneNumber, conversation, message) {
  const pool = getPool();
  const selection = parseInt(message);

  if (isNaN(selection) || selection < 1 || selection > 5) {
    await sendSMS(phoneNumber, 'Please reply with a number (1-5) to select a time.');
    return { success: false, error: 'INVALID_TIME_SELECTION' };
  }

  const orderData = typeof conversation.order_data === 'string'
    ? JSON.parse(conversation.order_data)
    : conversation.order_data;

  const selectedSlot = orderData.availableSlots[selection - 1];

  if (!selectedSlot) {
    await sendSMS(phoneNumber, 'Invalid selection. Please choose a number from the list.');
    return { success: false, error: 'SLOT_NOT_FOUND' };
  }

  try {
    // Determine which orders need to be booked
    // Include BOTH the primary order AND any pending orders
    const ordersToBook = [];

    // Always include the primary order (the one that created the conversation)
    ordersToBook.push({
      orderId: orderData.orderId,
      modality: orderData.modality,
      patientId: orderData.patientId
    });

    // Add any additional pending orders (from multi-procedure groups)
    if (orderData.pendingOrders && orderData.pendingOrders.length > 0) {
      ordersToBook.push(...orderData.pendingOrders);
    }

    logger.info('Booking appointments for multiple orders', {
      conversationId: conversation.id,
      orderCount: ordersToBook.length,
      orderIds: ordersToBook.map(o => o.orderId)
    });

    // Book appointment for each order
    const bookings = [];
    for (let i = 0; i < ordersToBook.length; i++) {
      const order = ordersToBook[i];

      try {
        const booking = await risClient.bookAppointment({
          orderId: order.orderId,
          patientId: order.patientId || orderData.patientId,
          locationId: conversation.selected_location_id,
          modality: order.modality || orderData.modality,
          slotId: selectedSlot.id,  // Same slot ID for all (they're all at the same time)
          appointmentTime: selectedSlot.startTime,
          phoneNumber,
          groupReference: ordersToBook.length > 1 ? `GROUP-${conversation.id}` : null  // Link multi-procedure bookings
        });

        bookings.push({
          orderId: order.orderId,
          confirmationNumber: booking.confirmationNumber,
          appointmentId: booking.appointmentId
        });

        logger.info('Appointment booked for order', {
          orderId: order.orderId,
          confirmationNumber: booking.confirmationNumber,
          orderIndex: i + 1,
          totalOrders: ordersToBook.length
        });
      } catch (error) {
        // If individual booking fails, log but continue trying others
        logger.error('Failed to book appointment for individual order', {
          orderId: order.orderId,
          error: error.message,
          orderIndex: i + 1,
          totalOrders: ordersToBook.length
        });

        // Only fail the entire process if NO bookings succeeded
        if (bookings.length === 0 && i === ordersToBook.length - 1) {
          throw error;  // Re-throw if this was the last order and nothing succeeded
        }
      }
    }

    // Update conversation
    await pool.query(
      `UPDATE sms_conversations
       SET selected_slot_time = $1, state = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [selectedSlot.startTime, STATES.CONFIRMED, conversation.id]
    );

    // Send confirmation (list all confirmation numbers for multi-procedure orders)
    const confirmDate = new Date(selectedSlot.startTime);
    let confirmMessage = `Appointment${ordersToBook.length > 1 ? 's' : ''} confirmed!\n\nDate: ${confirmDate.toLocaleDateString()}\nTime: ${confirmDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n`;

    if (ordersToBook.length > 1) {
      confirmMessage += `\nProcedures (${ordersToBook.length}):\n`;
      bookings.forEach((booking, index) => {
        confirmMessage += `${index + 1}. Confirmation #: ${booking.confirmationNumber}\n`;
      });
    } else {
      confirmMessage += `Confirmation #: ${bookings[0].confirmationNumber}\n`;
    }

    confirmMessage += `\nPlease arrive 15 minutes early.`;

    await sendSMS(phoneNumber, confirmMessage);

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.INBOUND_TIME_SELECTION,
      messageDirection: 'INBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString(),
      success: true
    });

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_CONFIRMATION,
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString()
    });

    return { success: true, action: 'APPOINTMENT_BOOKED', bookings, orderCount: ordersToBook.length };
  } catch (error) {
    logger.error('Failed to book appointment', {
      error: error.message,
      conversationId: conversation.id
    });

    await sendSMS(phoneNumber, 'Sorry, we couldn\'t complete your booking. Please call us to schedule.');
    await updateConversationState(conversation.id, STATES.CANCELLED);

    return { success: false, error: 'BOOKING_FAILED' };
  }
}

/**
 * Get active conversation for a phone number
 */
async function getActiveConversation(phoneHash) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM sms_conversations
     WHERE phone_hash = $1
       AND state NOT IN ('CONFIRMED', 'EXPIRED', 'CANCELLED')
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at DESC
     LIMIT 1`,
    [phoneHash]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Update conversation state
 */
async function updateConversationState(conversationId, newState) {
  const pool = getPool();
  await pool.query(
    `UPDATE sms_conversations
     SET state = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [newState, conversationId]
  );
}

/**
 * Add order to existing conversation's pending queue
 * Prevents duplicate SMS when multiple orders arrive for same patient
 */
async function addOrderToConversation(conversationId, newOrderData) {
  const pool = getPool();

  try {
    // Get current conversation
    const result = await pool.query(
      'SELECT order_data FROM sms_conversations WHERE id = $1',
      [conversationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Conversation not found');
    }

    const currentData = typeof result.rows[0].order_data === 'string'
      ? JSON.parse(result.rows[0].order_data)
      : result.rows[0].order_data;

    // Initialize pending orders array if it doesn't exist
    if (!currentData.pendingOrders) {
      currentData.pendingOrders = [];
    }

    // Add new order to pending queue
    currentData.pendingOrders.push(newOrderData);

    // Update conversation
    await pool.query(
      `UPDATE sms_conversations
       SET order_data = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(currentData), conversationId]
    );

    logger.info('Order added to existing conversation', {
      conversationId,
      newOrderId: newOrderData.orderId,
      pendingCount: currentData.pendingOrders.length
    });

    return true;
  } catch (error) {
    logger.error('Failed to add order to conversation', {
      error: error.message,
      conversationId,
      newOrderId: newOrderData.orderId
    });
    throw error;
  }
}

/**
 * Get active conversation by phone number (wrapper for hash)
 */
async function getActiveConversationByPhone(phoneNumber) {
  const phoneHash = hashPhoneNumber(phoneNumber);
  return await getActiveConversation(phoneHash);
}

module.exports = {
  startConversation,
  handleInboundMessage,
  getActiveConversation,
  getActiveConversationByPhone,
  addOrderToConversation,
  STATES
};
