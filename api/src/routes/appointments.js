const express = require('express');
const router = express.Router();
const { 
  getAppointments, 
  getAppointment, 
  updateAppointment,
  getStats 
} = require('../db/queries');
const logger = require('../utils/logger');
const Joi = require('joi');
const { authenticate, authorize } = require('../middleware/auth');
const { auditMiddleware, hipaaLog } = require('../middleware/audit');

// Validation schemas
const querySchema = Joi.object({
  date: Joi.string().isoDate().optional(),
  modality: Joi.string().optional(),
  status: Joi.string().valid('SCHEDULED', 'COMPLETED', 'CANCELLED').optional()
});
const idSchema = Joi.string().alphanum().min(1).required();
const patchSchema = Joi.object({
  status: Joi.string().valid('SCHEDULED', 'COMPLETED', 'CANCELLED').optional(),
  notes: Joi.string().allow('').optional(),
  datetime: Joi.string().isoDate().optional()
});

// Get all appointments with filters
router.get('/', 
  authenticate, 
  authorize(['read:appointments']), 
  auditMiddleware.list,
  hipaaLog('appointment_list'),
  async (req, res) => {
    const { error } = querySchema.validate(req.query);
    if (error) return res.status(400).json({ success: false, error: error.message });
    try {
      const { date, modality, status } = req.query;
      const appointments = await getAppointments({ date, modality, status });
      res.json({ success: true, count: appointments.length, appointments });
    } catch (error) {
      logger.error('Error fetching appointments:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get single appointment
router.get('/:id', 
  authenticate, 
  authorize(['read:appointments']), 
  auditMiddleware.read,
  hipaaLog('appointment_detail'),
  async (req, res) => {
    const { error } = idSchema.validate(req.params.id);
    if (error) return res.status(400).json({ success: false, error: error.message });
    try {
      const appointment = await getAppointment(req.params.id);
      if (!appointment) {
        return res.status(404).json({ success: false, error: 'Appointment not found' });
      }
      res.json({ success: true, appointment });
    } catch (error) {
      logger.error('Error fetching appointment:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Update appointment
router.patch('/:id', 
  authenticate, 
  authorize(['write:appointments']), 
  auditMiddleware.update,
  hipaaLog('appointment_update'),
  async (req, res) => {
    const { error: idError } = idSchema.validate(req.params.id);
    if (idError) return res.status(400).json({ success: false, error: idError.message });
    const { error: bodyError } = patchSchema.validate(req.body);
    if (bodyError) return res.status(400).json({ success: false, error: bodyError.message });
    try {
      const { status, notes, datetime } = req.body;
      const updates = {};
      if (status) updates.status = status;
      if (notes) updates.notes = notes;
      if (datetime) updates.datetime = datetime;
      const appointment = await updateAppointment(req.params.id, updates);
      res.json({ success: true, appointment });
    } catch (error) {
      logger.error('Error updating appointment:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Get latest appointment for live demo
router.get('/latest', 
  authenticate, 
  authorize(['read:appointments']), 
  auditMiddleware.read,
  hipaaLog('appointment_latest'),
  async (req, res) => {
    try {
      const appointments = await getAppointments({
        date: new Date().toISOString().split('T')[0]
      });
      
      const latest = appointments[appointments.length - 1];
      
      res.json({
        success: true,
        appointment: latest
      });
    } catch (error) {
      logger.error('Error fetching latest appointment:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get today's stats
router.get('/stats/today', 
  authenticate, 
  authorize(['read:appointments']), 
  auditMiddleware.read,
  async (req, res) => {
    try {
      const stats = await getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Error fetching stats:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;