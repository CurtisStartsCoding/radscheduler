const express = require('express');
const router = express.Router();
const hl7Processor = require('../services/hl7-processor');
const { createAppointment, getAppointments } = require('../db/queries');
const { sendSMS } = require('../services/notifications');
const logger = require('../utils/logger');

// Clinical Decision Support Platform Integration
// This endpoint receives clinical decisions and creates appointments

router.post('/clinical-decision', async (req, res) => {
  try {
    const {
      patientId,
      patientName,
      patientPhone,
      clinicalData,
      schedulingPreferences,
      source = 'clinical_decision_platform'
    } = req.body;

    logger.info('Clinical decision received', {
      patientId,
      clinicalData: clinicalData?.riskScore,
      modality: clinicalData?.modality,
      source
    });

    // Create appointment from clinical decision
    const appointmentData = {
      patientId: patientId || `P${Date.now()}`,
      patientName: patientName || 'Clinical Patient',
      patientPhone: patientPhone || process.env.DEMO_PHONE,
      modality: clinicalData?.modality || 'MRI',
      studyType: clinicalData?.recommendedProtocol || 'Clinical Study',
      datetime: schedulingPreferences?.preferredDateTime || new Date(Date.now() + 3600000).toISOString(),
      referringPhysician: clinicalData?.referringPhysician || 'Dr. Clinical',
      urgency: clinicalData?.urgency || 'routine',
      notes: `Clinical Decision: ${clinicalData?.analysis || 'AI analysis completed'}`,
      source: source,
      clinicalData: {
        riskScore: clinicalData?.riskScore,
        analysis: clinicalData?.analysis,
        recommendations: clinicalData?.recommendations,
        protocol: clinicalData?.recommendedProtocol
      }
    };

    // Process appointment through HL7 processor
    const result = await hl7Processor.processMessage(appointmentData);

    // Send enhanced SMS with clinical context
    if (patientPhone) {
      const clinicalMessage = `Your ${clinicalData?.modality} appointment is ready to book.
      
Clinical Summary:
- Risk Score: ${clinicalData?.riskScore}%
- Recommended: ${clinicalData?.recommendedProtocol}
- Urgency: ${clinicalData?.urgency}

Book now: https://patient-portal.com/book/${result.appointment.id}`;

      await sendSMS(patientPhone, clinicalMessage);
    }

    res.status(201).json({
      success: true,
      appointmentId: result.appointment.id,
      clinicalContext: {
        riskScore: clinicalData?.riskScore,
        analysis: clinicalData?.analysis,
        recommendations: clinicalData?.recommendations
      },
      schedulingOptions: result.conflicts?.alternativeSlots || [],
      message: 'Clinical decision processed and appointment created'
    });

  } catch (error) {
    logger.error('Clinical decision processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available slots for clinical scheduling
router.get('/available-slots', async (req, res) => {
  try {
    const { modality, date, duration = 30 } = req.query;
    
    // Get existing appointments for the date
    const existingAppointments = await getAppointments({
      date: date,
      modality: modality
    });

    // Generate available slots (simplified - in production, use more sophisticated logic)
    const slots = generateAvailableSlots(date, duration, existingAppointments);

    res.json({
      success: true,
      availableSlots: slots,
      totalSlots: slots.length
    });

  } catch (error) {
    logger.error('Error getting available slots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enhanced SMS with clinical context
router.post('/send-clinical-sms', async (req, res) => {
  try {
    const {
      patientPhone,
      clinicalData,
      bookingUrl,
      appointmentId
    } = req.body;

    const message = `Your ${clinicalData?.modality} appointment is ready to book.

Clinical Summary:
- Risk Score: ${clinicalData?.riskScore}%
- Recommended: ${clinicalData?.recommendedProtocol}
- Urgency: ${clinicalData?.urgency}

Book now: ${bookingUrl}

Questions? Call us at ${process.env.DEMO_PHONE}`;

    const result = await sendSMS(patientPhone, message);

    res.json({
      success: true,
      messageId: result.sid,
      clinicalContext: clinicalData
    });

  } catch (error) {
    logger.error('Error sending clinical SMS:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get clinical analytics
router.get('/clinical-analytics', async (req, res) => {
  try {
    const { date, modality } = req.query;
    
    const appointments = await getAppointments({
      date: date,
      modality: modality
    });

    // Calculate clinical metrics
    const analytics = {
      totalAppointments: appointments.length,
      averageRiskScore: calculateAverageRiskScore(appointments),
      modalityDistribution: calculateModalityDistribution(appointments),
      urgencyBreakdown: calculateUrgencyBreakdown(appointments),
      clinicalDecisions: appointments.filter(apt => apt.source === 'clinical_decision_platform').length
    };

    res.json({
      success: true,
      analytics: analytics
    });

  } catch (error) {
    logger.error('Error getting clinical analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper functions
function generateAvailableSlots(date, duration, existingAppointments) {
  const slots = [];
  const startHour = 8; // 8 AM
  const endHour = 18; // 6 PM
  
  const targetDate = new Date(date);
  
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const slotTime = new Date(targetDate);
      slotTime.setHours(hour, minute, 0, 0);
      
      // Check if slot conflicts with existing appointments
      const hasConflict = existingAppointments.some(apt => {
        const aptTime = new Date(apt.datetime);
        const timeDiff = Math.abs(slotTime - aptTime);
        return timeDiff < (duration * 60 * 1000); // Convert minutes to milliseconds
      });
      
      if (!hasConflict && slotTime > new Date()) {
        slots.push({
          datetime: slotTime.toISOString(),
          available: true,
          duration: duration
        });
      }
    }
  }
  
  return slots.slice(0, 20); // Return first 20 available slots
}

function calculateAverageRiskScore(appointments) {
  const clinicalAppointments = appointments.filter(apt => apt.clinicalData?.riskScore);
  if (clinicalAppointments.length === 0) return 0;
  
  const totalScore = clinicalAppointments.reduce((sum, apt) => 
    sum + (apt.clinicalData.riskScore || 0), 0);
  return Math.round(totalScore / clinicalAppointments.length);
}

function calculateModalityDistribution(appointments) {
  const distribution = {};
  appointments.forEach(apt => {
    distribution[apt.modality] = (distribution[apt.modality] || 0) + 1;
  });
  return distribution;
}

function calculateUrgencyBreakdown(appointments) {
  const breakdown = {};
  appointments.forEach(apt => {
    breakdown[apt.urgency] = (breakdown[apt.urgency] || 0) + 1;
  });
  return breakdown;
}

module.exports = router; 