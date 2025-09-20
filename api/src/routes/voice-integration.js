/**
 * Voice Integration API Endpoints
 * This is the ONLY file in RadScheduler that knows about the voice system
 * Provides voice-optimized endpoints for the separate Voice AI system
 */

const express = require('express');
const router = express.Router();
const { getAppointments, createAppointment } = require('../db/queries');
const configurationProvider = require('../services/configuration-provider');
const organizationService = require('../services/organization.service');
const logger = require('../utils/logger');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');

// Separate rate limiter for voice system
const voiceLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Voice system rate limit exceeded',
    standardHeaders: true,
    legacyHeaders: false
});

// Voice system authentication middleware
const authenticateVoiceSystem = (req, res, next) => {
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    const expectedKey = process.env.VOICE_SYSTEM_API_KEY;

    if (!apiKey || apiKey !== expectedKey) {
        logger.warn('Unauthorized voice system access attempt', {
            ip: req.ip,
            headers: req.headers['x-source']
        });

        return res.status(401).json({
            success: false,
            error: 'Invalid voice system credentials'
        });
    }

    // Log voice system access
    logger.info('Voice system API access', {
        endpoint: req.path,
        requestId: req.headers['x-request-id'],
        organizationId: req.body.organizationId
    });

    next();
};

// Apply rate limiting and auth to all voice endpoints
router.use(voiceLimiter);
router.use(authenticateVoiceSystem);

/**
 * Check availability - Voice optimized
 * Returns simplified format for voice responses
 */
router.post('/check-availability', async (req, res) => {
    try {
        const schema = Joi.object({
            organizationId: Joi.string().required(),
            modality: Joi.string().required(),
            startDate: Joi.string().isoDate().required(),
            endDate: Joi.string().isoDate().required()
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }

        // Get organization-specific configuration
        const scheduling = await configurationProvider.getSchedulingConfig(value.organizationId);

        // Check if modality is allowed for voice booking
        if (scheduling.restricted_modalities?.includes(value.modality)) {
            return res.json({
                success: false,
                requiresHuman: true,
                message: `${value.modality} appointments require staff assistance`
            });
        }

        // Get available slots
        const appointments = await getAppointments({
            organization_id: value.organizationId,
            date_range: [value.startDate, value.endDate],
            status: 'AVAILABLE'
        });

        // Format for voice (simplified)
        const voiceSlots = appointments
            .filter(apt => apt.modality === value.modality)
            .slice(0, 10) // Limit for voice reading
            .map(apt => ({
                datetime: apt.datetime,
                duration: apt.duration || 30
            }));

        res.json({
            success: true,
            slots: voiceSlots,
            totalAvailable: appointments.length,
            nextAvailable: voiceSlots[0]?.datetime
        });

    } catch (error) {
        logger.error('Voice check availability error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check availability'
        });
    }
});

/**
 * Book appointment - Voice optimized
 * Simplified booking for voice confirmation
 */
router.post('/book-appointment', async (req, res) => {
    try {
        const schema = Joi.object({
            organizationId: Joi.string().required(),
            patientPhone: Joi.string().required(),
            modality: Joi.string().required(),
            datetime: Joi.string().isoDate().required(),
            duration: Joi.number().min(15).max(120).default(30),
            source: Joi.string().default('voice-ai')
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }

        // Create appointment with voice source tracking
        const appointment = await createAppointment({
            ...value,
            organization_id: value.organizationId,
            patient_phone: value.patientPhone,
            status: 'SCHEDULED',
            source: 'voice-ai',
            booking_method: 'phone',
            created_by: 'voice-system'
        });

        // Generate simple confirmation code for voice
        const confirmationCode = `RAD${appointment.id.toString().padStart(6, '0')}`;

        res.json({
            success: true,
            confirmationCode,
            appointment: {
                id: appointment.id,
                datetime: appointment.datetime,
                modality: appointment.modality
            },
            voiceResponse: `Your appointment is confirmed. Your confirmation code is ${confirmationCode.split('').join(' ')}`
        });

    } catch (error) {
        logger.error('Voice booking error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to book appointment'
        });
    }
});

/**
 * Cancel appointment - Voice system
 */
router.post('/cancel-appointment', async (req, res) => {
    try {
        const schema = Joi.object({
            confirmationCode: Joi.string().required(),
            organizationId: Joi.string().required()
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }

        // Extract appointment ID from confirmation code
        const appointmentId = parseInt(value.confirmationCode.replace('RAD', ''), 10);

        // Cancel appointment
        await updateAppointment(appointmentId, {
            status: 'CANCELLED',
            cancelled_by: 'voice-system',
            cancelled_at: new Date().toISOString(),
            cancellation_source: 'phone'
        });

        res.json({
            success: true,
            voiceResponse: 'Your appointment has been cancelled successfully'
        });

    } catch (error) {
        logger.error('Voice cancellation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cancel appointment'
        });
    }
});

/**
 * Get organization info for voice greeting
 */
router.get('/organization-info/:phoneNumber', async (req, res) => {
    try {
        // This would normally look up org by phone
        // For now, return default
        const org = await organizationService.getOrganization('default');

        res.json({
            success: true,
            organization: {
                name: org.name,
                greeting: `Thank you for calling ${org.name} scheduling`,
                businessHours: org.settings?.scheduling?.business_hours
            }
        });

    } catch (error) {
        logger.error('Voice org lookup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get organization info'
        });
    }
});

/**
 * Health check for voice system
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'voice-integration',
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;