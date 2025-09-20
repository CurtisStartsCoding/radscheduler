/**
 * Voice AI Booking - Book Appointment Lambda
 * Handles appointment booking from AWS Connect/Lex
 */

const https = require('https');
const AWS = require('aws-sdk');

// Initialize AWS services
const secretsManager = new AWS.SecretsManager();
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Cache for secrets
let apiCredentials = null;

/**
 * Get API credentials from Secrets Manager
 */
async function getApiCredentials() {
    if (apiCredentials) return apiCredentials;

    try {
        const secret = await secretsManager.getSecretValue({
            SecretId: 'voice-ai/radscheduler-api'
        }).promise();

        apiCredentials = JSON.parse(secret.SecretString);
        return apiCredentials;
    } catch (error) {
        console.error('Failed to get API credentials:', error);
        throw error;
    }
}

/**
 * Call RadScheduler API
 */
async function callRadSchedulerAPI(endpoint, method, data) {
    const creds = await getApiCredentials();

    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);

        const options = {
            hostname: creds.apiHost || 'localhost',
            port: creds.apiPort || 3010,
            path: `/api/voice${endpoint}`,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Authorization': `Bearer ${creds.apiKey}`,
                'X-Organization-Slug': data.organizationSlug || 'default'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({ message: body });
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

/**
 * Log call to DynamoDB for audit
 */
async function logCall(callSid, action, details) {
    try {
        await dynamodb.put({
            TableName: 'voice-ai-call-logs',
            Item: {
                callSid: callSid,
                timestamp: Date.now(),
                action: action,
                details: details,
                ttl: Math.floor(Date.now() / 1000) + (365 * 7 * 24 * 60 * 60) // 7 years
            }
        }).promise();
    } catch (error) {
        console.error('Failed to log call:', error);
    }
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));

    const intent = event.currentIntent.name;
    const slots = event.currentIntent.slots;
    const sessionAttributes = event.sessionAttributes || {};
    const callSid = sessionAttributes.callSid || 'unknown';

    try {
        // Extract appointment details from slots
        const appointmentData = {
            procedureType: slots.ProcedureType,
            preferredDate: slots.PreferredDate,
            preferredTime: slots.PreferredTime,
            patientPhone: slots.PhoneNumber || sessionAttributes.phoneNumber,
            organizationSlug: sessionAttributes.organizationSlug || 'default',
            urgency: slots.Urgency || 'routine',
            notes: slots.Notes || ''
        };

        // Log the booking attempt
        await logCall(callSid, 'book_appointment', appointmentData);

        // Call RadScheduler API to create appointment
        const result = await callRadSchedulerAPI('/appointments', 'POST', appointmentData);

        if (result.success) {
            // Successful booking
            const response = {
                dialogAction: {
                    type: 'Close',
                    fulfillmentState: 'Fulfilled',
                    message: {
                        contentType: 'PlainText',
                        content: `Great! I've booked your ${appointmentData.procedureType} appointment for ${appointmentData.preferredDate} at ${appointmentData.preferredTime}. You'll receive a confirmation text message shortly with all the details.`
                    }
                },
                sessionAttributes: {
                    ...sessionAttributes,
                    appointmentId: result.appointmentId
                }
            };

            return response;
        } else {
            // Booking failed
            return {
                dialogAction: {
                    type: 'ElicitSlot',
                    intentName: intent,
                    slots: slots,
                    slotToElicit: 'PreferredTime',
                    message: {
                        contentType: 'PlainText',
                        content: `I'm sorry, that time slot is not available. Could you please choose a different time? We have availability at ${result.availableSlots ? result.availableSlots.join(', ') : '9 AM, 2 PM, or 4 PM'}.`
                    }
                },
                sessionAttributes
            };
        }
    } catch (error) {
        console.error('Error processing booking:', error);

        // Log the error
        await logCall(callSid, 'book_error', { error: error.message });

        // Return error response
        return {
            dialogAction: {
                type: 'Close',
                fulfillmentState: 'Failed',
                message: {
                    contentType: 'PlainText',
                    content: 'I apologize, but I encountered an error while booking your appointment. Please hold while I transfer you to a scheduling specialist who can assist you.'
                }
            },
            sessionAttributes
        };
    }
};