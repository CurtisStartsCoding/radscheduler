const { getPool } = require('../db/connection');
const logger = require('../utils/logger');
const { hashPhoneNumber, encryptPhoneNumber, decryptPhoneNumber } = require('../utils/phone-hash');
const { sendSMS } = require('./notifications');
const { hasConsent, recordConsent, revokeConsent } = require('./patient-consent');
const { logSMSInteraction, MESSAGE_TYPES, CONSENT_STATUS } = require('./sms-audit');
const risClient = require('./ris-api-client');
const { checkSchedulingSafety, formatSafetyMessages } = require('./scheduling-safety');
const { filterLocationsByCapability, getLocationEquipment } = require('./equipment-service');
const { calculateDuration, formatDuration, getEquipmentLabel } = require('./duration-calculator');

/**
 * Helper to send SMS with organization context from conversation
 * @param {string} phoneNumber - Recipient phone
 * @param {string} message - Message content
 * @param {Object} [conversation] - Conversation object containing organization_id
 */
async function sendConversationSMS(phoneNumber, message, conversation = null) {
  const organizationId = conversation?.organization_id || null;
  return sendSMS(phoneNumber, message, { organizationId });
}

/**
 * SMS Conversation State Machine
 * Manages multi-step SMS scheduling conversations
 * State flow: CONSENT_PENDING -> CHOOSING_LOCATION -> CHOOSING_TIME -> CONFIRMED
 *             Or: -> COORDINATOR_REVIEW (when safety blocks exist)
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
  CANCELLED: 'CANCELLED',
  COORDINATOR_REVIEW: 'COORDINATOR_REVIEW'  // NEW: For blocked patients
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
    const encryptedPhone = encryptPhoneNumber(phoneNumber);
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    // Check if patient has consent
    const consented = await hasConsent(phoneNumber);

    // Extract organization_id from orderData (passed from webhook)
    const organizationId = orderData.organizationId || null;

    // Create conversation record
    const result = await pool.query(
      `INSERT INTO sms_conversations
       (phone_hash, encrypted_phone, state, order_data, expires_at, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        phoneHash,
        encryptedPhone,
        consented ? STATES.CHOOSING_LOCATION : STATES.CONSENT_PENDING,
        JSON.stringify(orderData),
        expiresAt,
        organizationId
      ]
    );

    const conversation = result.rows[0];

    logger.info('SMS conversation started', {
      conversationId: conversation.id,
      phoneHash,
      state: conversation.state,
      orderId: orderData.orderId,
      hasPatientContext: !!orderData.patientContext
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
  // Extract practice name from order data
  const orderData = typeof conversation.order_data === 'string'
    ? JSON.parse(conversation.order_data)
    : conversation.order_data;

  const practiceName = orderData.orderingPractice || 'Your healthcare provider';

  const message = `${practiceName} has a new imaging order for you. Would you like to schedule your appointment via text message? Reply YES to continue or STOP to opt out.`;

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
 * Send location selection options with safety checks and equipment filtering
 */
async function sendLocationOptions(phoneNumber, conversation) {
  const pool = getPool();

  try {
    const orderData = typeof conversation.order_data === 'string'
      ? JSON.parse(conversation.order_data)
      : conversation.order_data;

    // SAFETY CHECK: Run safety validation before showing locations
    const safetyCheck = checkSchedulingSafety(orderData);

    // If blocked, route to coordinator
    if (!safetyCheck.canProceed) {
      logger.warn('Safety block - routing to coordinator', {
        conversationId: conversation.id,
        blocks: safetyCheck.blocks.map(b => b.reason)
      });

      // Send block message to patient
      const blockMessage = safetyCheck.blocks[0].message;
      await sendSMS(phoneNumber, blockMessage);

      // Transition to COORDINATOR_REVIEW state
      await transitionToCoordinatorReview(conversation.id, {
        reason: 'SAFETY_BLOCK',
        safetyBlocks: safetyCheck.blocks,
        safetyWarnings: safetyCheck.warnings
      });

      await logSMSInteraction({
        phoneNumber,
        messageType: 'OUTBOUND_SAFETY_BLOCK',
        messageDirection: 'OUTBOUND',
        consentStatus: CONSENT_STATUS.CONSENTED,
        sessionId: conversation.id.toString()
      });

      return;
    }

    // If warnings, inform patient first
    if (safetyCheck.warnings.length > 0) {
      const warningMessages = safetyCheck.warnings.map(w => w.message).join('\n\n');
      await sendSMS(phoneNumber, warningMessages);

      logger.info('Safety warnings sent to patient', {
        conversationId: conversation.id,
        warnings: safetyCheck.warnings.map(w => w.reason)
      });
    }

    // Get available locations from RIS
    let locations = await risClient.getLocations(orderData.modality);

    if (locations.length === 0) {
      await sendSMS(phoneNumber, 'Sorry, there are no available locations at this time. Please call us to schedule.');
      await updateConversationState(conversation.id, STATES.CANCELLED);
      return;
    }

    // EQUIPMENT FILTERING: Filter locations by capability
    try {
      const capableLocations = await filterLocationsByCapability(locations, orderData);

      if (capableLocations.length === 0) {
        logger.warn('No capable locations for order requirements', {
          conversationId: conversation.id,
          orderDescription: orderData.orderDescription,
          totalLocations: locations.length
        });

        await sendSMS(phoneNumber,
          'We need to find a location with the right equipment for your exam. A coordinator will call you shortly.');

        await transitionToCoordinatorReview(conversation.id, {
          reason: 'NO_CAPABLE_LOCATIONS',
          orderDescription: orderData.orderDescription,
          checkedLocations: locations.length
        });

        return;
      }

      locations = capableLocations;
      logger.info('Locations filtered by equipment capability', {
        conversationId: conversation.id,
        originalCount: locations.length,
        capableCount: capableLocations.length
      });
    } catch (error) {
      // Log error but continue with all locations (fail open)
      logger.error('Equipment filtering failed, using all locations', {
        error: error.message,
        conversationId: conversation.id
      });
    }

    // DURATION CALCULATION: Calculate duration for each location
    const locationsWithDuration = await Promise.all(locations.slice(0, 5).map(async (loc) => {
      try {
        const equipment = loc.equipment || await getLocationEquipment(loc.id || loc.location_id, orderData.modality);
        const durationInfo = calculateDuration(orderData, equipment, orderData.patientContext);
        return {
          ...loc,
          equipment,
          calculatedDuration: durationInfo.totalDuration,
          durationBreakdown: durationInfo.breakdown,
          equipmentLabel: getEquipmentLabel(equipment, orderData.modality)
        };
      } catch (error) {
        return {
          ...loc,
          calculatedDuration: orderData.estimatedDuration || 30,
          equipmentLabel: ''
        };
      }
    }));

    // Build location selection message with multi-procedure support
    let message = '';

    // Get practice name from order data
    const practiceName = orderData.orderingPractice || 'Your healthcare provider';

    if (orderData.procedures && orderData.procedures.length > 1) {
      // Multiple procedures - list them all
      message = `${practiceName} has ordered ${orderData.procedures.length} imaging exams for you:\n`;
      orderData.procedures.forEach(proc => {
        message += `- ${proc.description}\n`;
      });
      message += `\nPlease select a convenient location:\n\n`;
    } else {
      // Single procedure
      const description = orderData.procedures?.[0]?.description ||
                         orderData.orderDescription ||
                         `${orderData.modality} exam`;
      message = `${practiceName} has ordered a ${description} exam for you.\n\nPlease select a convenient location:\n\n`;
    }

    // Add location options with equipment info and duration
    locationsWithDuration.forEach((loc, index) => {
      const equipmentInfo = loc.equipmentLabel ? ` (${loc.equipmentLabel})` : '';
      const durationInfo = ` - ${formatDuration(loc.calculatedDuration)}`;
      message += `${index + 1}. ${loc.name}${equipmentInfo}${durationInfo}\n`;
    });
    message += `\nReply with the number (1-${Math.min(locationsWithDuration.length, 5)})`;

    await sendSMS(phoneNumber, message);

    // Store locations with duration info in conversation data
    await pool.query(
      `UPDATE sms_conversations
       SET order_data = jsonb_set(
         jsonb_set(order_data, '{availableLocations}', $1::jsonb),
         '{minScheduleDate}', $2::jsonb
       )
       WHERE id = $3`,
      [
        JSON.stringify(locationsWithDuration),
        JSON.stringify(safetyCheck.minScheduleDate),
        conversation.id
      ]
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
 * Transition conversation to COORDINATOR_REVIEW state
 * @param {number} conversationId - Conversation ID
 * @param {Object} reviewData - Data about why review is needed
 */
async function transitionToCoordinatorReview(conversationId, reviewData) {
  const pool = getPool();

  logger.info('Transitioning to COORDINATOR_REVIEW', {
    conversationId,
    reason: reviewData.reason
  });

  await pool.query(
    `UPDATE sms_conversations
     SET state = $1,
         order_data = jsonb_set(order_data, '{coordinatorReview}', $2::jsonb),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [STATES.COORDINATOR_REVIEW, JSON.stringify(reviewData), conversationId]
  );
}

/**
 * Send time slot selection options via HL7 flow through QIE
 * Sends SRM request to QIE, which responds asynchronously via webhook
 */
async function sendTimeSlotOptions(phoneNumber, conversation) {
  try {
    const orderData = typeof conversation.order_data === 'string'
      ? JSON.parse(conversation.order_data)
      : conversation.order_data;

    const locationId = conversation.selected_location_id;

    // Apply minScheduleDate if set from safety checks
    const minDate = orderData.minScheduleDate ? new Date(orderData.minScheduleDate) : new Date();
    const startDate = minDate > new Date() ? minDate : new Date();
    const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000); // Next 14 days from start

    // Collect all order IDs for this conversation
    const orderIds = [orderData.orderId];
    if (orderData.pendingOrders && orderData.pendingOrders.length > 0) {
      orderData.pendingOrders.forEach(order => orderIds.push(order.orderId));
    }

    // Patient data from QIE Channel 6663 webhook (extracted from ORU PID segment)
    const patientData = {
      patientMrn: orderData.patientMrn,
      patientName: orderData.patientName,
      patientDob: orderData.patientDob,
      patientGender: orderData.patientGender
    };

    // Send SRM request to QIE Channel 8082 (HL7 scheduling request)
    // Response will come back asynchronously via webhook to /api/webhooks/hl7/schedule-response
    // Note: getAvailableSlots() returns empty array - slots arrive via webhook
    await risClient.getAvailableSlots(locationId, orderData.modality, startDate, endDate, patientData, orderIds);

    logger.info('Schedule request sent to QIE via HL7', {
      conversationId: conversation.id,
      locationId,
      modality: orderData.modality,
      patientMrn: patientData.patientMrn,
      orderIds,
      startDate: startDate.toISOString(),
      minScheduleDate: orderData.minScheduleDate
    });

  } catch (error) {
    logger.error('Failed to request time slots', {
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

    // Handle STOP (opt-out) first - works in ANY state including COORDINATOR_REVIEW
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

      case STATES.COORDINATOR_REVIEW:
        // Patient can only STOP in this state - other messages get generic response
        await sendSMS(phoneNumber, 'A scheduling coordinator will be in contact with you soon. Reply STOP to opt out of SMS notifications.');
        return { success: true, action: 'COORDINATOR_REVIEW_ACKNOWLEDGED' };

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

  // Update conversation with selected location and start tracking slot request
  await pool.query(
    `UPDATE sms_conversations
     SET selected_location_id = $1,
         state = $2,
         slot_request_sent_at = CURRENT_TIMESTAMP,
         slot_retry_count = 0,
         updated_at = CURRENT_TIMESTAMP
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
    state: STATES.CHOOSING_TIME,
    order_data: orderData
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


  // Parse availableSlots if it's a string (double-serialized from JSONB)
  let availableSlots = orderData.availableSlots;
  if (typeof availableSlots === 'string') {
    availableSlots = JSON.parse(availableSlots);
  }

  const selectedSlot = availableSlots[selection - 1];

  if (!selectedSlot) {
    await sendSMS(phoneNumber, 'Invalid selection. Please choose a number from the list.');
    return { success: false, error: 'SLOT_NOT_FOUND' };
  }

  try {
    // Collect ALL order IDs that need to be booked together
    const orderIds = [];

    // Always include the primary order (the one that created the conversation)
    orderIds.push(orderData.orderId);

    // Add any additional pending orders (from multi-procedure groups)
    if (orderData.pendingOrders && orderData.pendingOrders.length > 0) {
      orderData.pendingOrders.forEach(order => {
        orderIds.push(order.orderId);
      });
    }

    logger.info('Booking ONE appointment for multiple orders', {
      conversationId: conversation.id,
      orderCount: orderIds.length,
      orderIds
    });

    // Book ONE appointment for ALL orders
    const booking = await risClient.bookAppointment({
      orderIds,  // Pass array of all order IDs
      patientId: orderData.patientId,
      patientMrn: orderData.patientMrn,  // Pass MRN from orderData
      locationId: conversation.selected_location_id,
      modality: orderData.modality,
      slotId: selectedSlot.resourceId || selectedSlot.id || selectedSlot.slotId,  // Try multiple field names
      appointmentTime: selectedSlot.dateTime || selectedSlot.startTime,  // Slots have dateTime field
      phoneNumber
    });

    logger.info('Single appointment booked for all orders', {
      orderIds,
      orderCount: orderIds.length,
      confirmationNumber: booking.confirmationNumber,
      appointmentId: booking.appointmentId
    });

    // Update conversation
    await pool.query(
      `UPDATE sms_conversations
       SET selected_slot_time = $1, state = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [selectedSlot.startTime, STATES.CONFIRMED, conversation.id]
    );

    // NOTE: Confirmation SMS is sent by the SIU webhook (hl7-webhooks.js)
    // when Mock RIS sends the appointment notification message.
    // This prevents duplicate SMS and ensures the real appointment data is shown.

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

    return {
      success: true,
      action: 'APPOINTMENT_BOOKED',
      booking,
      orderCount: orderIds.length
    };
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

/**
 * Resend consent request when additional orders arrive before patient responds
 * Updates the message to reflect multiple pending orders
 */
async function resendConsentWithMultipleOrders(conversation) {
  try {
    // Decrypt phone number from conversation
    const phoneNumber = decryptPhoneNumber(conversation.encrypted_phone);

    if (!phoneNumber) {
      logger.error('Cannot resend consent - phone decryption failed', {
        conversationId: conversation.id
      });
      return;
    }

    // Parse order data to get order count
    const orderData = typeof conversation.order_data === 'string'
      ? JSON.parse(conversation.order_data)
      : conversation.order_data;

    // Count total orders (primary + pending)
    const pendingCount = orderData.pendingOrders?.length || 0;
    const totalOrders = 1 + pendingCount;

    const practiceName = orderData.orderingPractice || 'Your healthcare provider';

    // Construct message with order count
    const orderText = totalOrders === 1
      ? 'a new imaging order'
      : `${totalOrders} imaging orders`;

    const message = `${practiceName} has ${orderText} for you. Would you like to schedule your appointment${totalOrders > 1 ? 's' : ''} via text message? Reply YES to continue or STOP to opt out.`;

    await sendSMS(phoneNumber, message);

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_CONSENT,
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.PENDING,
      sessionId: conversation.id.toString()
    });

    logger.info('Resent consent request with multiple orders', {
      conversationId: conversation.id,
      totalOrders,
      phoneHash: hashPhoneNumber(phoneNumber)
    });
  } catch (error) {
    logger.error('Failed to resend consent with multiple orders', {
      error: error.message,
      conversationId: conversation.id
    });
    throw error;
  }
}

/**
 * Get conversations in COORDINATOR_REVIEW state
 * For admin API to query pending reviews
 */
async function getConversationsNeedingReview() {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, phone_hash, order_data, created_at, updated_at
     FROM sms_conversations
     WHERE state = $1
       AND expires_at > CURRENT_TIMESTAMP
     ORDER BY created_at ASC`,
    [STATES.COORDINATOR_REVIEW]
  );

  return result.rows;
}

module.exports = {
  startConversation,
  handleInboundMessage,
  getActiveConversation,
  getActiveConversationByPhone,
  addOrderToConversation,
  resendConsentWithMultipleOrders,
  sendLocationOptions,
  sendTimeSlotOptions,
  transitionToCoordinatorReview,
  getConversationsNeedingReview,
  STATES
};
