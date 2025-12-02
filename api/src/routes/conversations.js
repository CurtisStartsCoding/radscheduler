const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { authenticate, authorize } = require('../middleware/auth');
const conversationAdmin = require('../services/conversation-admin');

/**
 * Conversation Management Routes
 * Admin dashboard endpoints for managing SMS conversations
 */

/**
 * GET /api/conversations
 * List conversations with optional filters
 */
router.get('/', authenticate, authorize(['read:conversations']), async (req, res) => {
  try {
    const { state, startDate, endDate, stuck, limit, offset } = req.query;

    const filters = {
      state,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      stuck: stuck === 'true',
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    };

    const result = await conversationAdmin.getConversations(filters);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error listing conversations', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list conversations' });
  }
});

/**
 * GET /api/conversations/analytics/stats
 * Get conversation statistics
 */
router.get('/analytics/stats', authenticate, authorize(['read:conversations']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await conversationAdmin.getConversationStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Error getting stats', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get statistics' });
  }
});

/**
 * GET /api/conversations/analytics/state-duration
 * Get average time in each state
 */
router.get('/analytics/state-duration', authenticate, authorize(['read:conversations']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const durations = await conversationAdmin.getStateDurationAnalytics(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json({
      success: true,
      durations
    });
  } catch (error) {
    logger.error('Error getting state durations', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get state durations' });
  }
});

/**
 * GET /api/conversations/analytics/timeseries
 * Get conversation counts over time for charting
 */
router.get('/analytics/timeseries', authenticate, authorize(['read:conversations']), async (req, res) => {
  try {
    const { startDate, endDate, interval } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const data = await conversationAdmin.getTimeseriesData(
      new Date(startDate),
      new Date(endDate),
      interval || 'day'
    );

    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error getting timeseries', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get timeseries data' });
  }
});

/**
 * GET /api/conversations/analytics/sms-volume
 * Get SMS send/receive counts
 */
router.get('/analytics/sms-volume', authenticate, authorize(['read:conversations']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const volume = await conversationAdmin.getSMSVolume(
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      volume
    });
  } catch (error) {
    logger.error('Error getting SMS volume', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get SMS volume' });
  }
});

/**
 * GET /api/conversations/:id
 * Get a single conversation
 */
router.get('/:id', authenticate, authorize(['read:conversations']), async (req, res) => {
  try {
    const conversation = await conversationAdmin.getConversationById(req.params.id);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      });
    }

    res.json({
      success: true,
      conversation
    });
  } catch (error) {
    logger.error('Error getting conversation', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to get conversation' });
  }
});

/**
 * DELETE /api/conversations/:id
 * Delete a conversation (ADMIN only)
 */
router.delete('/:id', authenticate, authorize(['delete:conversations']), async (req, res) => {
  try {
    const result = await conversationAdmin.deleteConversation(
      req.params.id,
      req.user.id
    );

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('Error deleting conversation', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

/**
 * PATCH /api/conversations/:id/state
 * Force state transition (ADMIN only)
 */
router.patch('/:id/state', authenticate, authorize(['write:conversations']), async (req, res) => {
  try {
    const { newState, reason } = req.body;

    if (!newState || !reason) {
      return res.status(400).json({
        success: false,
        error: 'newState and reason are required'
      });
    }

    // Only allow ADMIN to force state changes
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can force state transitions'
      });
    }

    const result = await conversationAdmin.forceStateTransition(
      req.params.id,
      newState,
      req.user.id,
      reason
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('Error forcing state', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to force state transition' });
  }
});

/**
 * POST /api/conversations/:id/retry
 * Retry a step (location or timeslots)
 */
router.post('/:id/retry', authenticate, authorize(['write:conversations']), async (req, res) => {
  try {
    const { step } = req.body;

    if (!step || !['location', 'timeslots'].includes(step)) {
      return res.status(400).json({
        success: false,
        error: 'step is required and must be "location" or "timeslots"'
      });
    }

    const result = await conversationAdmin.retryStep(
      req.params.id,
      step,
      req.user.id
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('Error retrying step', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to retry step' });
  }
});

/**
 * POST /api/conversations/:id/send-sms
 * Send manual SMS (ADMIN only)
 */
router.post('/:id/send-sms', authenticate, authorize(['write:conversations']), async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    // Only allow ADMIN to send manual SMS
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can send manual SMS'
      });
    }

    const result = await conversationAdmin.sendManualSMS(
      req.params.id,
      message,
      req.user.id
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    logger.error('Error sending manual SMS', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to send SMS' });
  }
});

/**
 * DELETE /api/conversations/bulk/expired
 * Bulk delete expired conversations (ADMIN only)
 */
router.delete('/bulk/expired', authenticate, authorize(['delete:conversations']), async (req, res) => {
  try {
    const { olderThanDays } = req.query;

    const result = await conversationAdmin.bulkDeleteExpired(
      olderThanDays ? parseInt(olderThanDays) : 7,
      req.user.id
    );

    res.json(result);
  } catch (error) {
    logger.error('Error bulk deleting', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to bulk delete' });
  }
});

module.exports = router;
