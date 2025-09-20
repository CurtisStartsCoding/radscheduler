/**
 * Voice AI Check Availability Lambda
 * SEPARATE from RadScheduler - communicates via API only
 * Includes PHI redaction for HIPAA compliance
 */

const AWS = require('aws-sdk');
const axios = require('axios');

// AWS Services
const secretsManager = new AWS.SecretsManager();
const comprehendMedical = new AWS.ComprehendMedical();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Configuration
const SYSTEM_PREFIX = 'voice-ai';
let apiConfig = null;

exports.handler = async (event) => {
    const callSid = event.Details?.ContactData?.ContactId || 'unknown';
    const startTime = Date.now();

    try {
        // Load API configuration
        if (!apiConfig) {
            apiConfig = await loadApiConfig();
        }

        // Extract Lex intent and slots
        const { currentIntent, sessionAttributes } = event;
        const slots = currentIntent.slots;

        // Log call (redacted)
        await logVoiceInteraction(callSid, 'CHECK_AVAILABILITY', {
            intent: currentIntent.name,
            slots: redactPHI(slots),
            sessionId: event.sessionId
        });

        // Get organization from session
        const organizationId = await getOrganizationFromPhone(
            sessionAttributes?.phoneNumber || event.Details?.ContactData?.CustomerEndpoint?.Address
        );

        if (!organizationId) {
            return buildLexResponse(
                "I need to verify which clinic you're calling about. Can you provide your clinic code?"
            );
        }

        // Validate procedure type
        if (!slots.ProcedureType) {
            return buildElicitSlotResponse(
                'ProcedureType',
                'What type of scan would you like to check availability for?'
            );
        }

        // Call RadScheduler API
        const availability = await callRadSchedulerAPI(
            '/voice/check-availability',
            {
                organizationId,
                modality: mapProcedureToModality(slots.ProcedureType),
                startDate: slots.DateRange || new Date().toISOString(),
                endDate: getEndDate(slots.DateRange)
            }
        );

        // Format voice response
        const response = formatAvailabilityForVoice(
            slots.ProcedureType,
            availability.slots
        );

        // Log successful check
        await updateCallLog(callSid, {
            availableSlotsFound: availability.slots?.length || 0,
            responseTime: Date.now() - startTime
        });

        return buildLexResponse(response);

    } catch (error) {
        console.error('Error in voice-check-availability:', error);

        // Log error (without PHI)
        await logError(callSid, 'CHECK_AVAILABILITY_ERROR', error);

        return buildLexResponse(
            "I'm having trouble checking availability. Let me transfer you to someone who can help."
        );
    }
};

/**
 * Call RadScheduler API
 * This is the ONLY connection between systems
 */
async function callRadSchedulerAPI(endpoint, data) {
    try {
        const response = await axios({
            method: 'POST',
            url: `${apiConfig.endpoint}/api${endpoint}`,
            headers: {
                'Authorization': `Bearer ${apiConfig.apiKey}`,
                'X-Source': 'voice-ai-system',
                'X-Request-ID': AWS.util.uuid.v4()
            },
            data,
            timeout: apiConfig.timeout || 5000
        });

        return response.data;
    } catch (error) {
        console.error('RadScheduler API error:', error.message);
        throw new Error('API_CALL_FAILED');
    }
}

/**
 * Get organization from phone number mapping
 */
async function getOrganizationFromPhone(phoneNumber) {
    if (!phoneNumber) return null;

    try {
        const result = await dynamoDB.get({
            TableName: `${SYSTEM_PREFIX}-phone-org-mapping`,
            Key: { phoneNumber: phoneNumber.replace(/\D/g, '') }
        }).promise();

        return result.Item?.organizationId;
    } catch (error) {
        console.error('Error fetching org mapping:', error);
        return null;
    }
}

/**
 * PHI Redaction using Comprehend Medical
 */
async function redactPHI(data) {
    if (!data || typeof data !== 'object') return data;

    const text = JSON.stringify(data);

    try {
        const result = await comprehendMedical.detectPHI({
            Text: text
        }).promise();

        let redactedText = text;

        // Replace PHI entities with [REDACTED]
        result.Entities?.forEach(entity => {
            if (entity.Category === 'PROTECTED_HEALTH_INFORMATION') {
                redactedText = redactedText.replace(entity.Text, '[REDACTED]');
            }
        });

        return JSON.parse(redactedText);
    } catch (error) {
        // If redaction fails, return generic redaction
        return { redacted: true };
    }
}

/**
 * Log voice interaction to DynamoDB
 */
async function logVoiceInteraction(callSid, action, details) {
    try {
        await dynamoDB.put({
            TableName: `${SYSTEM_PREFIX}-call-logs`,
            Item: {
                callSid,
                timestamp: Date.now(),
                action,
                details: await redactPHI(details),
                ttl: Math.floor(Date.now() / 1000) + (7 * 365 * 24 * 60 * 60) // 7 year retention
            }
        }).promise();
    } catch (error) {
        console.error('Failed to log interaction:', error);
    }
}

/**
 * Update call log
 */
async function updateCallLog(callSid, updates) {
    try {
        await dynamoDB.update({
            TableName: `${SYSTEM_PREFIX}-call-logs`,
            Key: { callSid, timestamp: Date.now() },
            UpdateExpression: 'SET #u = :updates',
            ExpressionAttributeNames: { '#u': 'updates' },
            ExpressionAttributeValues: { ':updates': updates }
        }).promise();
    } catch (error) {
        console.error('Failed to update call log:', error);
    }
}

/**
 * Log errors without PHI
 */
async function logError(callSid, errorType, error) {
    await logVoiceInteraction(callSid, 'ERROR', {
        type: errorType,
        message: error.message?.replace(/[0-9]{3,}/g, '[REDACTED]'), // Redact numbers
        timestamp: new Date().toISOString()
    });
}

/**
 * Load API configuration from Secrets Manager
 */
async function loadApiConfig() {
    try {
        const secret = await secretsManager.getSecretValue({
            SecretId: `${SYSTEM_PREFIX}/radscheduler-api`
        }).promise();

        return JSON.parse(secret.SecretString);
    } catch (error) {
        console.error('Failed to load API config:', error);
        throw new Error('CONFIG_LOAD_FAILED');
    }
}

/**
 * Map procedure types to modality codes
 */
function mapProcedureToModality(procedure) {
    const mapping = {
        'MRI': 'MR',
        'CT': 'CT',
        'X-ray': 'DX',
        'Ultrasound': 'US',
        'Mammogram': 'MG'
    };
    return mapping[procedure] || procedure;
}

/**
 * Format availability for voice output
 */
function formatAvailabilityForVoice(procedure, slots) {
    if (!slots || slots.length === 0) {
        return `I'm sorry, I don't see any ${procedure} appointments available this week. Would you like me to check next week?`;
    }

    const topSlots = slots.slice(0, 3);
    let response = `I have ${slots.length} ${procedure} appointments available. The next available times are: `;

    topSlots.forEach((slot, index) => {
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

        if (index > 0) response += ', ';
        if (index === topSlots.length - 1 && topSlots.length > 1) response += 'and ';

        response += `${dateStr} at ${timeStr}`;
    });

    response += '. Would you like to book one of these times?';
    return response;
}

/**
 * Get end date for availability check
 */
function getEndDate(startDate) {
    const date = startDate ? new Date(startDate) : new Date();
    date.setDate(date.getDate() + 7);
    return date.toISOString();
}

/**
 * Build Lex response
 */
function buildLexResponse(message) {
    return {
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

/**
 * Build elicit slot response
 */
function buildElicitSlotResponse(slotToElicit, message) {
    return {
        dialogAction: {
            type: 'ElicitSlot',
            slotToElicit,
            message: {
                contentType: 'PlainText',
                content: message
            }
        }
    };
}