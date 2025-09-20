const express = require('express');
const router = express.Router();
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

// Initialize clients
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Store conversation context
const conversations = {};

// Get AI response from Claude
async function getAIResponse(userInput, conversationHistory = []) {
  try {
    // Generate fresh timestamp for each call
    const currentTime = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });

    const systemPrompt = `You are a helpful medical scheduling assistant for RadScheduler, a radiology department booking system.

Your role:
- Schedule radiology appointments (MRI, CT scan, X-ray, ultrasound, PET scan, mammogram, etc.)
- Be conversational but concise - responses will be spoken aloud
- Gather necessary information: type of scan, urgency, preferred time
- Provide available appointment slots
- Confirm bookings

Current time: ${currentTime}

Available appointment slots:
- Tomorrow morning: 9:00 AM, 11:00 AM
- Tomorrow afternoon: 2:00 PM, 4:00 PM
- Day after tomorrow: 8:00 AM, 10:00 AM, 1:00 PM, 3:00 PM
- This week: Multiple slots available

For urgent/emergency cases, mention the next available slot tomorrow morning.

Keep responses under 2 sentences when possible. Be warm and professional.
Only end the call if:
1. An appointment is successfully booked and confirmed
2. The caller explicitly says goodbye, hangs up, or wants to end the call
3. The caller declines to book an appointment after being asked

Do NOT end the call just because you mentioned scheduling or booking in your response.`;

    const messages = [
      ...conversationHistory,
      { role: 'user', content: userInput }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Fast, cost-effective for voice
      system: systemPrompt,
      messages: messages,
      max_tokens: 150, // Keep responses concise for voice
      temperature: 0.7,
    });

    return response.content[0].text;
  } catch (error) {
    logger.error('Claude API error:', error);
    return "I'm having trouble understanding. Could you please repeat what type of scan you need?";
  }
}

// Handle incoming calls
router.post('/incoming', (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const fromNumber = req.body.From;

  // Initialize conversation
  conversations[callSid] = {
    phoneNumber: fromNumber,
    history: [],
    startTime: new Date()
  };

  const gather = twiml.gather({
    input: 'speech',
    timeout: 10,  // Increased from 3 to 10 seconds for longer responses
    language: 'en-US',
    action: '/voice/process-ai',
    method: 'POST',
    speechTimeout: 2,  // Wait 2 seconds of silence before processing
    enhanced: true,
    speechModel: 'phone_call'
  });

  gather.say({
    voice: 'Polly.Joanna',
    language: 'en-US'
  }, 'Welcome to RadScheduler. How can I help you with your radiology appointment today?');

  twiml.redirect('/voice/incoming');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Process speech with AI
router.post('/process-ai', async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  const callSid = req.body.CallSid;

  logger.info('Speech input:', { callSid, speech: speechResult });

  if (!speechResult) {
    // Check if we're waiting for important info like name
    const conversation = conversations[callSid];
    const lastResponse = conversation?.history?.slice(-1)[0]?.content || '';

    if (lastResponse.toLowerCase().includes('name') ||
        lastResponse.toLowerCase().includes('spell')) {
      // Give them more time for names
      const gather = twiml.gather({
        input: 'speech',
        timeout: 15,
        action: '/voice/process-ai',
        method: 'POST',
        speechTimeout: 3
      });

      gather.say({
        voice: 'Polly.Joanna'
      }, 'Please take your time. What is your name?');
    } else {
      twiml.say({
        voice: 'Polly.Joanna'
      }, 'I didn\'t hear anything. Please tell me what type of appointment you need.');
      twiml.redirect('/voice/incoming');
    }
    res.type('text/xml');
    res.send(twiml.toString());
    return;
  }

  // Get conversation context
  const conversation = conversations[callSid] || { history: [] };

  // Get AI response
  const aiResponse = await getAIResponse(speechResult, conversation.history);

  // Update conversation history
  conversation.history.push(
    { role: 'user', content: speechResult },
    { role: 'assistant', content: aiResponse }
  );
  conversations[callSid] = conversation;

  // Check if booking is EXPLICITLY confirmed (not just mentioned)
  const confirmPhrases = [
    'appointment has been scheduled',
    'appointment is confirmed',
    'booked your appointment',
    'successfully scheduled',
    'all set for',
    'see you on'
  ];

  const isBookingConfirmed = confirmPhrases.some(phrase =>
    aiResponse.toLowerCase().includes(phrase)
  );

  // Also check if caller is ending the call
  const isEndingCall = speechResult.toLowerCase().includes('goodbye') ||
                       speechResult.toLowerCase().includes('bye') ||
                       speechResult.toLowerCase().includes('thank you') &&
                       speechResult.toLowerCase().includes('done');

  if (isBookingConfirmed) {
    // Send SMS confirmation if booking is confirmed
    const fromNumber = req.body.From;
    await sendSMSConfirmation(fromNumber, aiResponse);

    // Say the response and end call
    twiml.say({
      voice: 'Polly.Joanna'
    }, aiResponse);

    // Add a pause before goodbye
    twiml.pause({ length: 1 });

    twiml.say({
      voice: 'Polly.Joanna'
    }, 'Thank you for using RadScheduler. Have a great day!');

    // Clean up conversation
    delete conversations[callSid];

  } else {
    // Continue conversation
    const gather = twiml.gather({
      input: 'speech',
      timeout: 10,  // Increased for longer responses like names
      action: '/voice/process-ai',
      method: 'POST',
      speechTimeout: 2,  // Wait for pause in speech
      enhanced: true,
      speechModel: 'phone_call'
    });

    gather.say({
      voice: 'Polly.Joanna'
    }, aiResponse);

    // Redirect back to continue conversation if no input
    twiml.redirect('/voice/process-ai');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Send SMS confirmation
async function sendSMSConfirmation(phoneNumber, bookingDetails) {
  try {
    const message = await twilioClient.messages.create({
      body: `RadScheduler Confirmation:\n\n${bookingDetails}\n\nTo cancel or reschedule, call (239) 382-5683`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    logger.info('SMS sent', { messageId: message.sid });
    return true;
  } catch (error) {
    logger.error('SMS error:', error);
    return false;
  }
}

// Handle call status updates
router.post('/status', (req, res) => {
  const callSid = req.body.CallSid;
  logger.info('Call status:', req.body);

  // Clean up on call end
  if (req.body.CallStatus === 'completed') {
    delete conversations[callSid];
  }

  res.sendStatus(200);
});

module.exports = router;