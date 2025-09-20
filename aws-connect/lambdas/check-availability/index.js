/**
 * Lambda Function: Check Appointment Availability
 * Single Responsibility: Check available slots for radiology procedures
 * Used by: Amazon Lex Bot via AWS Connect
 */

const AWS = require('aws-sdk');
const axios = require('axios');

// AWS services
const comprehendMedical = new AWS.ComprehendMedical();
const secretsManager = new AWS.SecretsManager();

// RadScheduler API configuration
let apiConfig = null;

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));

    try {
        // Load API configuration
        if (!apiConfig) {
            apiConfig = await loadApiConfig();
        }

        // Extract intent and slots from Lex event
        const { currentIntent, sessionAttributes } = event;
        const slots = currentIntent.slots;

        // Validate required slots
        if (!slots.ProcedureType) {
            return buildValidationResponse(
                false,
                'ProcedureType',
                'What type of scan are you checking availability for?'
            );
        }

        // Determine organization from session
        const organizationId = sessionAttributes?.organizationId ||
                              process.env.DEFAULT_ORG_ID;

        // Get date range to check
        const startDate = slots.DateRange ?
            new Date(slots.DateRange) :
            new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7); // Check 1 week ahead

        // Check availability via RadScheduler API
        const availability = await checkAvailability(
            organizationId,
            slots.ProcedureType,
            startDate,
            endDate
        );

        // Format response for Lex
        if (availability.slots && availability.slots.length > 0) {
            const responseText = formatAvailabilityResponse(
                slots.ProcedureType,
                availability.slots
            );

            return buildFulfillmentResponse(responseText);
        } else {
            return buildFulfillmentResponse(
                `I'm sorry, we don't have any ${slots.ProcedureType} appointments available in that timeframe. Would you like to check a different date?`
            );
        }

    } catch (error) {
        console.error('Error checking availability:', error);

        // Log to CloudWatch for HIPAA audit
        await logAuditEvent('AVAILABILITY_CHECK_ERROR', event, error);

        return buildFulfillmentResponse(
            "I'm having trouble checking availability right now. Let me transfer you to a scheduling specialist."
        );
    }
};

/**
 * Check availability via RadScheduler API
 */
async function checkAvailability(orgId, procedureType, startDate, endDate) {
    try {
        const response = await axios.get(
            `${apiConfig.apiUrl}/api/appointments/availability`,
            {
                headers: {
                    'Authorization': `Bearer ${apiConfig.apiToken}`,
                    'X-Organization-Id': orgId
                },
                params: {
                    modality: mapProcedureToModality(procedureType),
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString()
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

/**
 * Map procedure types to modality codes
 */
function mapProcedureToModality(procedureType) {
    const mapping = {
        'MRI': 'MR',
        'CT': 'CT',
        'X-ray': 'DX',
        'Ultrasound': 'US',
        'Mammogram': 'MG',
        'PET': 'PT',
        'Nuclear': 'NM',
        'Fluoroscopy': 'RF'
    };

    return mapping[procedureType] || procedureType;
}

/**
 * Format availability response for voice
 */
function formatAvailabilityResponse(procedureType, slots) {
    const available = slots.slice(0, 3); // Show first 3 slots

    let response = `I have the following ${procedureType} appointments available: `;

    available.forEach((slot, index) => {
        const date = new Date(slot.datetime);
        const dateStr = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        if (index === available.length - 1 && available.length > 1) {
            response += `and `;
        }

        response += `${dateStr} at ${timeStr}`;

        if (index < available.length - 1) {
            response += ', ';
        }
    });

    response += '. Would you like to book one of these times?';

    return response;
}

/**
 * Load API configuration from AWS Secrets Manager
 */
async function loadApiConfig() {
    try {
        const secretName = process.env.API_SECRET_NAME || 'radscheduler/api';
        const secret = await secretsManager.getSecretValue({
            SecretId: secretName
        }).promise();

        return JSON.parse(secret.SecretString);
    } catch (error) {
        console.error('Failed to load API config:', error);
        // Fallback to environment variables
        return {
            apiUrl: process.env.API_URL || 'http://localhost:3010',
            apiToken: process.env.API_TOKEN
        };
    }
}

/**
 * Log audit event for HIPAA compliance
 */
async function logAuditEvent(eventType, data, error = null) {
    const auditLog = {
        timestamp: new Date().toISOString(),
        eventType,
        sessionId: data.sessionId,
        userId: data.userId,
        organizationId: data.sessionAttributes?.organizationId,
        intent: data.currentIntent?.name,
        slots: data.currentIntent?.slots,
        error: error ? error.message : null
    };

    // Remove any PHI from logs
    delete auditLog.slots?.PatientPhone;

    console.log('AUDIT:', JSON.stringify(auditLog));
}

/**
 * Build Lex validation response
 */
function buildValidationResponse(isValid, violatedSlot, message) {
    return {
        sessionAttributes: {},
        dialogAction: {
            type: isValid ? 'Delegate' : 'ElicitSlot',
            slotToElicit: violatedSlot,
            message: {
                contentType: 'PlainText',
                content: message
            }
        }
    };
}

/**
 * Build Lex fulfillment response
 */
function buildFulfillmentResponse(message) {
    return {
        sessionAttributes: {},
        dialogAction: {
            type: 'Close',
            fulfillmentState: 'Fulfilled',
            message: {
                contentType: 'PlainText',
                content: message
            }
        }
    };
}