const express = require('express');
const router = express.Router();
const Retell = require('retell-sdk').Retell;
const twilio = require('twilio');
const logger = require('../utils/logger');

// Initialize Retell client
const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

// Initialize Twilio client for SMS
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Store call sessions
const callSessions = {};

// Create or update Retell agent
async function setupRetellAgent() {
  try {
    const agentConfig = {
      agent_name: 'RadScheduler Assistant',
      voice_id: '11labs-rachel', // Superior quality 11labs professional female voice
      voice_speed: 1.0,
      voice_temperature: 0.3, // Lower temperature for more consistent voice
      responsiveness: 0.8, // High responsiveness for natural conversation
      interruption_sensitivity: 0.7, // Allow natural interruptions
      ambient_sound: 'off',
      backchannel_frequency: 0.6, // Natural "mm-hmm" responses
      backchannel_words: ['Got it', 'I see', 'Understood'],
      reminder_max_count: 2, // Remind user twice if no response
      reminder_trigger_ms: 8000, // Wait 8 seconds before reminding

      llm_websocket_url: `${process.env.BASE_URL || 'https://radscheduler.io'}/api/retell/llm-websocket`,

      prompt: `You are a professional medical scheduling assistant for RadScheduler. You help schedule ultrasound, X-ray, and mammogram appointments. Your voice should be warm, professional, and efficient.

## Your Responsibilities:
1. Schedule ONLY these types of appointments: Ultrasound, X-ray, and Mammogram
2. If someone asks for MRI, CT, PET, or other scans, politely explain you currently only schedule ultrasounds, X-rays, and mammograms
3. Gather necessary information: type of scan, body part (for X-rays), urgency level, preferred timing
4. Provide available appointment slots based on the current time
5. Confirm bookings and ensure patient has all needed information

## Current Time Context:
The system will provide you with the current date and time. Use this to offer appropriate appointment slots.

## Available Appointments:
- For urgent/same-day: Check if before 2 PM, offer 3:30 PM or 4:30 PM today
- Tomorrow: 9:00 AM, 11:00 AM, 2:00 PM, 4:00 PM
- Day after tomorrow: 8:00 AM, 10:00 AM, 1:00 PM, 3:00 PM
- Next week: Multiple slots available

## Conversation Guidelines:
- Start with: "Good [morning/afternoon], thank you for calling RadScheduler. I can help you schedule ultrasound, X-ray, or mammogram appointments. How can I assist you today?"
- Be conversational but efficient - this is a phone call
- For X-rays, always ask what body part needs to be X-rayed
- For ultrasounds, ask if it's abdominal, pelvic, or other
- For mammograms, mention it's for breast screening
- Confirm the appointment details before finalizing
- Mention that an SMS confirmation will be sent
- Only end the call after confirming the booking or if the caller declines

## Information to Collect:
1. Type of scan (ultrasound, X-ray, or mammogram)
2. Body part (for X-rays) or type (for ultrasounds)
3. Urgency (routine, urgent, or same-day if available)
4. Preferred day/time
5. Patient's full name (for booking)

## Example Flow:
You: "Good morning, thank you for calling RadScheduler. I can help you schedule ultrasound, X-ray, or mammogram appointments. How can I assist you today?"
Caller: "I need an X-ray"
You: "I can help you schedule an X-ray. What part of your body needs to be X-rayed?"
Caller: "My wrist"
You: "Got it, an X-ray for your wrist. Is this urgent or can we schedule it for later this week?"
[Continue with available times and booking]

Remember: Be natural, helpful, and professional. Only offer the three services we currently provide.`,

      general_tools: [
        {
          type: 'end_call',
          name: 'end_call',
          description: 'End the call after appointment is confirmed or caller requests to end'
        }
      ],

      custom_tools: [
        {
          type: 'function',
          name: 'book_appointment',
          description: 'Book a radiology appointment in the system',
          speak_during_execution: true,
          speak_after_execution: true,
          execution_message: 'Let me book that appointment for you',
          parameters: {
            type: 'object',
            properties: {
              scan_type: {
                type: 'string',
                enum: ['ultrasound', 'xray', 'mammogram'],
                description: 'Type of radiology scan'
              },
              body_part: {
                type: 'string',
                description: 'Body part to be scanned (mainly for X-rays)'
              },
              patient_name: {
                type: 'string',
                description: 'Patient full name'
              },
              appointment_date: {
                type: 'string',
                description: 'Date of appointment (e.g., tomorrow, Monday, December 25)'
              },
              appointment_time: {
                type: 'string',
                description: 'Time of appointment (e.g., 2:00 PM, 9:00 AM)'
              },
              urgency: {
                type: 'string',
                enum: ['routine', 'urgent', 'same-day'],
                description: 'Urgency level of the appointment'
              }
            },
            required: ['scan_type', 'patient_name', 'appointment_date', 'appointment_time']
          }
        },
        {
          type: 'function',
          name: 'check_availability',
          description: 'Check available appointment slots',
          speak_during_execution: true,
          execution_message: 'Let me check what times are available',
          parameters: {
            type: 'object',
            properties: {
              scan_type: {
                type: 'string',
                enum: ['ultrasound', 'xray', 'mammogram'],
                description: 'Type of scan to check availability for'
              },
              date_range: {
                type: 'string',
                enum: ['today', 'tomorrow', 'this_week', 'next_week'],
                description: 'When to check for availability'
              }
            },
            required: ['scan_type', 'date_range']
          }
        }
      ]
    };

    // Create or update agent
    const response = await retellClient.agent.create(agentConfig);
    logger.info('Retell agent configured', {
      agentId: response.agent_id,
      agentName: response.agent_name
    });

    return response.agent_id;
  } catch (error) {
    logger.error('Failed to setup Retell agent:', error);
    throw error;
  }
}

// Handle incoming Twilio calls - redirect to Retell
router.post('/incoming-call', async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const fromNumber = req.body.From;
    const toNumber = req.body.To;

    logger.info('Incoming call via Twilio', {
      callSid,
      from: fromNumber,
      to: toNumber
    });

    // Get or create agent
    const agentId = process.env.RETELL_AGENT_ID || await setupRetellAgent();

    // Register the call with Retell
    const retellCall = await retellClient.call.registerPhoneCall({
      agent_id: agentId,
      from_number: toNumber, // The number Retell will appear to call from
      to_number: fromNumber, // The number to call (the caller)
      metadata: {
        twilio_call_sid: callSid,
        original_caller: fromNumber,
        call_time: new Date().toISOString()
      },
      // Optional: Set max call duration (in seconds)
      max_duration: 600, // 10 minutes max
    });

    // Store session info
    callSessions[callSid] = {
      retellCallId: retellCall.call_id,
      phoneNumber: fromNumber,
      startTime: new Date()
    };

    logger.info('Call registered with Retell', {
      retellCallId: retellCall.call_id
    });

    // Create TwiML to connect Twilio to Retell's WebSocket
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Connect>
        <Stream url="wss://api.retellai.com/audio-websocket/${retellCall.call_id}" />
      </Connect>
    </Response>`;

    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    logger.error('Failed to handle incoming call:', error);

    // Fallback TwiML response
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say voice="Polly.Joanna">
        We're experiencing technical difficulties with our scheduling system.
        Please call back in a few minutes or visit our website to book your appointment.
        We apologize for the inconvenience.
      </Say>
    </Response>`;

    res.type('text/xml');
    res.send(fallbackTwiml);
  }
});

// Handle LLM WebSocket endpoint for custom functions
router.post('/llm-websocket', async (req, res) => {
  const { function_name, function_args, call } = req.body;

  logger.info('Retell function call received', {
    function_name,
    args: function_args
  });

  try {
    if (function_name === 'book_appointment') {
      const {
        scan_type,
        body_part,
        patient_name,
        appointment_date,
        appointment_time,
        urgency
      } = function_args;

      // Create appointment object
      const appointment = {
        scan_type,
        body_part,
        patient_name,
        date: appointment_date,
        time: appointment_time,
        urgency,
        phone_number: call.metadata?.original_caller,
        created_at: new Date(),
        confirmation_number: `RAD${Date.now().toString().slice(-6)}`
      };

      // TODO: Save to database
      logger.info('Appointment booked', appointment);

      // Send SMS confirmation if we have the phone number
      if (appointment.phone_number) {
        await sendSMSConfirmation(appointment.phone_number, appointment);
      }

      // Format scan type for response
      const scanTypeDisplay = scan_type === 'xray' ? 'X-ray' :
                             scan_type === 'ultrasound' ? 'ultrasound' :
                             'mammogram';

      // Return success response
      res.json({
        success: true,
        result: `Perfect! I've scheduled your ${scanTypeDisplay}${body_part ? ` for your ${body_part}` : ''} on ${appointment_date} at ${appointment_time}. Your confirmation number is ${appointment.confirmation_number}. You'll receive a text message with all the details shortly.`
      });

    } else if (function_name === 'check_availability') {
      const { scan_type, date_range } = function_args;

      // Generate available slots based on date range
      const slots = generateAvailableSlots(scan_type, date_range);

      res.json({
        success: true,
        result: slots
      });

    } else {
      res.json({
        success: false,
        error: 'Unknown function'
      });
    }
  } catch (error) {
    logger.error('Function execution error:', error);
    res.json({
      success: false,
      error: 'Failed to execute function'
    });
  }
});

// Handle call status updates from Retell
router.post('/call-status', async (req, res) => {
  const { call_id, status, metadata } = req.body;

  logger.info('Retell call status update', {
    callId: call_id,
    status
  });

  // Clean up session when call ends
  if (status === 'ended' || status === 'failed') {
    const twilioSid = metadata?.twilio_call_sid;
    if (twilioSid && callSessions[twilioSid]) {
      delete callSessions[twilioSid];
    }
  }

  res.json({ received: true });
});

// Generate available appointment slots
function generateAvailableSlots(scanType, dateRange) {
  const now = new Date();
  const hour = now.getHours();

  // Format scan type for display
  const scanTypeDisplay = scanType === 'xray' ? 'X-ray' :
                         scanType === 'ultrasound' ? 'ultrasound' :
                         'mammogram';

  let message = '';

  if (dateRange === 'today') {
    if (hour < 14) {
      message = `For ${scanTypeDisplay} today, I have 3:30 PM and 4:30 PM available.`;
    } else {
      message = `Unfortunately, we don't have any more ${scanTypeDisplay} slots today. I can schedule you for tomorrow morning.`;
    }
  } else if (dateRange === 'tomorrow') {
    message = `For ${scanTypeDisplay} tomorrow, I have 9:00 AM, 11:00 AM, 2:00 PM, and 4:00 PM available.`;
  } else if (dateRange === 'this_week') {
    message = `This week for ${scanTypeDisplay}, I have multiple slots available Tuesday through Friday, both morning and afternoon.`;
  } else {
    message = `Next week, we have good availability for ${scanTypeDisplay} appointments throughout the week.`;
  }

  return message;
}

// Send SMS confirmation
async function sendSMSConfirmation(phoneNumber, appointment) {
  try {
    // Format scan type for display
    const scanTypeDisplay = appointment.scan_type === 'xray' ? 'X-RAY' :
                           appointment.scan_type.toUpperCase();

    const messageBody = `RadScheduler Confirmation

✅ ${scanTypeDisplay}${appointment.body_part ? ` - ${appointment.body_part}` : ''}
📅 ${appointment.date} at ${appointment.time}
🏥 Radiology Department, Main Hospital
📋 Confirmation: ${appointment.confirmation_number}
👤 Patient: ${appointment.patient_name}

Please arrive 15 minutes early with:
• Photo ID
• Insurance card
• Any relevant medical records

To cancel or reschedule: (239) 382-5683

Thank you for choosing RadScheduler!`;

    const message = await twilioClient.messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });

    logger.info('SMS confirmation sent', {
      messageId: message.sid,
      to: phoneNumber
    });
    return true;
  } catch (error) {
    logger.error('Failed to send SMS:', error);
    return false;
  }
}

// Initialize agent on startup if API key exists
if (process.env.RETELL_API_KEY && !process.env.RETELL_AGENT_ID) {
  setupRetellAgent()
    .then(agentId => {
      logger.info('Retell agent initialized on startup', { agentId });
      // You might want to save this agent ID to use it later
      process.env.RETELL_AGENT_ID = agentId;
    })
    .catch(err => {
      logger.error('Failed to initialize Retell agent on startup:', err);
    });
}

module.exports = router;