const { getPool } = require('../db/connection');
const logger = require('../utils/logger');
const { decryptPhoneNumber, hashPhoneNumber, getPhoneLast4 } = require('../utils/phone-hash');
const { sendSMS } = require('./notifications');
const { sendLocationOptions, sendTimeSlotOptions, STATES } = require('./sms-conversation');
const { logSMSInteraction, MESSAGE_TYPES, CONSENT_STATUS } = require('./sms-audit');

/**
 * Conversation Admin Service
 * Business logic for admin dashboard operations
 */

// Default threshold for stuck conversations (4 hours without activity)
const STUCK_THRESHOLD_HOURS = parseInt(process.env.STUCK_THRESHOLD_HOURS) || 4;

/**
 * Get conversations with filters
 */
async function getConversations(filters = {}) {
  const pool = getPool();
  const { state, startDate, endDate, stuck, limit = 50, offset = 0 } = filters;

  try {
    let query = `
      SELECT
        id,
        phone_hash,
        state,
        selected_location_id,
        selected_slot_time,
        expires_at,
        started_at,
        completed_at,
        created_at,
        updated_at,
        slot_request_sent_at,
        slot_retry_count,
        slot_request_failed_at,
        order_data->>'orderId' as order_id,
        order_data->>'modality' as modality,
        order_data->>'orderingPractice' as ordering_practice,
        CASE
          WHEN state NOT IN ('CONFIRMED', 'EXPIRED', 'CANCELLED')
            AND expires_at > CURRENT_TIMESTAMP
            AND updated_at < CURRENT_TIMESTAMP - INTERVAL '${STUCK_THRESHOLD_HOURS} hours'
          THEN true
          ELSE false
        END as is_stuck
      FROM sms_conversations
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (state) {
      query += ` AND state = $${paramIndex++}`;
      params.push(state);
    }

    if (startDate) {
      query += ` AND started_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND started_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (stuck === true) {
      query += ` AND state NOT IN ('CONFIRMED', 'EXPIRED', 'CANCELLED')
                 AND expires_at > CURRENT_TIMESTAMP
                 AND updated_at < CURRENT_TIMESTAMP - INTERVAL '${STUCK_THRESHOLD_HOURS} hours'`;
    }

    query += ` ORDER BY started_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM sms_conversations WHERE 1=1`;
    const countParams = [];
    let countIndex = 1;

    if (state) {
      countQuery += ` AND state = $${countIndex++}`;
      countParams.push(state);
    }
    if (startDate) {
      countQuery += ` AND started_at >= $${countIndex++}`;
      countParams.push(startDate);
    }
    if (endDate) {
      countQuery += ` AND started_at <= $${countIndex++}`;
      countParams.push(endDate);
    }
    if (stuck === true) {
      countQuery += ` AND state NOT IN ('CONFIRMED', 'EXPIRED', 'CANCELLED')
                      AND expires_at > CURRENT_TIMESTAMP
                      AND updated_at < CURRENT_TIMESTAMP - INTERVAL '${STUCK_THRESHOLD_HOURS} hours'`;
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return {
      conversations: result.rows,
      total,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to get conversations', { error: error.message, filters });
    throw error;
  }
}

/**
 * Get a single conversation by ID
 */
async function getConversationById(id) {
  const pool = getPool();

  try {
    const result = await pool.query(
      `SELECT
        id,
        phone_hash,
        encrypted_phone,
        state,
        order_data,
        selected_location_id,
        selected_slot_time,
        expires_at,
        started_at,
        completed_at,
        created_at,
        updated_at,
        slot_request_sent_at,
        slot_retry_count,
        slot_request_failed_at
      FROM sms_conversations
      WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to get conversation by ID', { error: error.message, id });
    throw error;
  }
}

/**
 * Delete a conversation
 */
async function deleteConversation(id, userId) {
  const pool = getPool();

  try {
    // Get conversation first for audit
    const conversation = await getConversationById(id);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    await pool.query('DELETE FROM sms_conversations WHERE id = $1', [id]);

    logger.info('Conversation deleted by admin', {
      conversationId: id,
      userId,
      phoneHash: conversation.phone_hash,
      state: conversation.state
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete conversation', { error: error.message, id, userId });
    throw error;
  }
}

/**
 * Force a state transition
 */
async function forceStateTransition(id, newState, userId, reason) {
  const pool = getPool();

  try {
    const conversation = await getConversationById(id);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    const validStates = ['CANCELLED', 'EXPIRED'];
    if (!validStates.includes(newState)) {
      return { success: false, error: `Invalid state. Allowed: ${validStates.join(', ')}` };
    }

    await pool.query(
      `UPDATE sms_conversations
       SET state = $1,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newState, id]
    );

    logger.info('Conversation state forced by admin', {
      conversationId: id,
      userId,
      previousState: conversation.state,
      newState,
      reason
    });

    return { success: true, previousState: conversation.state, newState };
  } catch (error) {
    logger.error('Failed to force state transition', { error: error.message, id, newState, userId });
    throw error;
  }
}

/**
 * Retry a step (location or timeslots)
 */
async function retryStep(id, step, userId) {
  const pool = getPool();

  try {
    const conversation = await getConversationById(id);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    const phoneNumber = decryptPhoneNumber(conversation.encrypted_phone);
    if (!phoneNumber) {
      return { success: false, error: 'Could not decrypt phone number' };
    }

    if (step === 'location') {
      // Update state to CHOOSING_LOCATION
      await pool.query(
        `UPDATE sms_conversations
         SET state = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [STATES.CHOOSING_LOCATION, id]
      );
      await sendLocationOptions(phoneNumber, conversation);
    } else if (step === 'timeslots') {
      // Update state and reset tracking
      await pool.query(
        `UPDATE sms_conversations
         SET state = $1,
             slot_request_sent_at = CURRENT_TIMESTAMP,
             slot_retry_count = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [STATES.CHOOSING_TIME, id]
      );
      await sendTimeSlotOptions(phoneNumber, conversation);
    } else {
      return { success: false, error: 'Invalid step. Allowed: location, timeslots' };
    }

    logger.info('Conversation step retried by admin', {
      conversationId: id,
      userId,
      step
    });

    return { success: true, step };
  } catch (error) {
    logger.error('Failed to retry step', { error: error.message, id, step, userId });
    throw error;
  }
}

/**
 * Send a manual SMS to a conversation
 */
async function sendManualSMS(id, message, userId) {
  const pool = getPool();

  try {
    const conversation = await getConversationById(id);
    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    const phoneNumber = decryptPhoneNumber(conversation.encrypted_phone);
    if (!phoneNumber) {
      return { success: false, error: 'Could not decrypt phone number' };
    }

    // Validate message length
    if (message.length > 320) {
      return { success: false, error: 'Message too long (max 320 characters)' };
    }

    await sendSMS(phoneNumber, message);

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_ERROR, // Using ERROR type for admin messages
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: id.toString()
    });

    logger.info('Manual SMS sent by admin', {
      conversationId: id,
      userId,
      messageLength: message.length
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to send manual SMS', { error: error.message, id, userId });
    throw error;
  }
}

/**
 * Bulk delete expired conversations
 */
async function bulkDeleteExpired(olderThanDays = 7, userId) {
  const pool = getPool();

  try {
    const result = await pool.query(
      `DELETE FROM sms_conversations
       WHERE state IN ('EXPIRED', 'CANCELLED')
         AND completed_at < CURRENT_TIMESTAMP - INTERVAL '${olderThanDays} days'
       RETURNING id`
    );

    const deletedCount = result.rows.length;

    logger.info('Bulk delete expired conversations by admin', {
      userId,
      olderThanDays,
      deletedCount
    });

    return { success: true, deletedCount };
  } catch (error) {
    logger.error('Failed to bulk delete expired', { error: error.message, olderThanDays, userId });
    throw error;
  }
}

/**
 * Get conversation statistics
 */
async function getConversationStats(startDate, endDate) {
  const pool = getPool();

  try {
    const params = [];
    let dateFilter = '';

    if (startDate && endDate) {
      dateFilter = ' AND started_at BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    }

    // Get counts by state
    const stateResult = await pool.query(
      `SELECT state, COUNT(*) as count
       FROM sms_conversations
       WHERE 1=1 ${dateFilter}
       GROUP BY state`,
      params
    );

    // Get stuck count
    const stuckResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM sms_conversations
       WHERE state NOT IN ('CONFIRMED', 'EXPIRED', 'CANCELLED')
         AND expires_at > CURRENT_TIMESTAMP
         AND updated_at < CURRENT_TIMESTAMP - INTERVAL '${STUCK_THRESHOLD_HOURS} hours'`
    );

    // Get success rate
    const successResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE state = 'CONFIRMED') as confirmed,
        COUNT(*) FILTER (WHERE state IN ('EXPIRED', 'CANCELLED')) as failed,
        COUNT(*) as total
       FROM sms_conversations
       WHERE state IN ('CONFIRMED', 'EXPIRED', 'CANCELLED')
       ${dateFilter}`,
      params
    );

    const byState = {};
    stateResult.rows.forEach(row => {
      byState[row.state] = parseInt(row.count);
    });

    const total = Object.values(byState).reduce((a, b) => a + b, 0);
    const confirmed = successResult.rows[0]?.confirmed || 0;
    const failed = successResult.rows[0]?.failed || 0;
    const completed = parseInt(confirmed) + parseInt(failed);

    return {
      total,
      byState,
      stuck: parseInt(stuckResult.rows[0]?.count || 0),
      successRate: completed > 0 ? (parseInt(confirmed) / completed) : 0,
      completedCount: completed
    };
  } catch (error) {
    logger.error('Failed to get conversation stats', { error: error.message });
    throw error;
  }
}

/**
 * Get average time spent in each state
 */
async function getStateDurationAnalytics(startDate, endDate) {
  const pool = getPool();

  try {
    const params = [];
    let dateFilter = '';

    if (startDate && endDate) {
      dateFilter = ' WHERE started_at BETWEEN $1 AND $2';
      params.push(startDate, endDate);
    }

    const result = await pool.query(
      `SELECT
        state,
        AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, CURRENT_TIMESTAMP) - started_at)) / 60) as avg_minutes,
        COUNT(*) as count
       FROM sms_conversations
       ${dateFilter}
       GROUP BY state`,
      params
    );

    const durations = {};
    result.rows.forEach(row => {
      durations[row.state] = {
        avgMinutes: parseFloat(row.avg_minutes).toFixed(2),
        count: parseInt(row.count)
      };
    });

    return durations;
  } catch (error) {
    logger.error('Failed to get state duration analytics', { error: error.message });
    throw error;
  }
}

/**
 * Get timeseries data for charting
 */
async function getTimeseriesData(startDate, endDate, interval = 'day') {
  const pool = getPool();

  try {
    const validIntervals = ['hour', 'day', 'week'];
    if (!validIntervals.includes(interval)) {
      interval = 'day';
    }

    const result = await pool.query(
      `SELECT
        date_trunc($3, started_at) as period,
        state,
        COUNT(*) as count
       FROM sms_conversations
       WHERE started_at BETWEEN $1 AND $2
       GROUP BY period, state
       ORDER BY period`,
      [startDate, endDate, interval]
    );

    return result.rows;
  } catch (error) {
    logger.error('Failed to get timeseries data', { error: error.message });
    throw error;
  }
}

/**
 * Get SMS volume statistics
 */
async function getSMSVolume(startDate, endDate) {
  const pool = getPool();

  try {
    const result = await pool.query(
      `SELECT
        message_direction,
        COUNT(*) as count
       FROM sms_audit_log
       WHERE timestamp BETWEEN $1 AND $2
       GROUP BY message_direction`,
      [startDate, endDate]
    );

    let inbound = 0;
    let outbound = 0;

    result.rows.forEach(row => {
      if (row.message_direction === 'INBOUND') {
        inbound = parseInt(row.count);
      } else if (row.message_direction === 'OUTBOUND') {
        outbound = parseInt(row.count);
      }
    });

    return { inbound, outbound, total: inbound + outbound };
  } catch (error) {
    logger.error('Failed to get SMS volume', { error: error.message });
    throw error;
  }
}

module.exports = {
  getConversations,
  getConversationById,
  deleteConversation,
  forceStateTransition,
  retryStep,
  sendManualSMS,
  bulkDeleteExpired,
  getConversationStats,
  getStateDurationAnalytics,
  getTimeseriesData,
  getSMSVolume
};
