const express = require('express');
const router = express.Router();
const { 
  getAppointments, 
  getAppointment, 
  updateAppointment,
  getStats 
} = require('../db/queries');
const logger = require('../utils/logger');

// Get all appointments with filters
router.get('/', async (req, res) => {
  try {
    const { date, modality, status } = req.query;
    const appointments = await getAppointments({ date, modality, status });
    
    res.json({
      success: true,
      count: appointments.length,
      appointments
    });
  } catch (error) {
    logger.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get single appointment
router.get('/:id', async (req, res) => {
  try {
    const appointment = await getAppointment(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    
    res.json({
      success: true,
      appointment
    });
  } catch (error) {
    logger.error('Error fetching appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update appointment
router.patch('/:id', async (req, res) => {
  try {
    const { status, notes, datetime } = req.body;
    const updates = {};
    
    if (status) updates.status = status;
    if (notes) updates.notes = notes;
    if (datetime) updates.datetime = datetime;
    
    const appointment = await updateAppointment(req.params.id, updates);
    
    res.json({
      success: true,
      appointment
    });
  } catch (error) {
    logger.error('Error updating appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get latest appointment for live demo
router.get('/latest', async (req, res) => {
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
});

// Get today's stats
router.get('/stats/today', async (req, res) => {
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
});

module.exports = router;