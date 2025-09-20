const express = require('express');
const router = express.Router();
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const twilio = require('twilio');
const logger = require('../utils/logger');

// Initialize Twilio client for SMS
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Store conversation state (in production, use Redis or database)
const conversations = {};

// Enhanced NLP for understanding various phrases
function detectIntent(speech) {
  const lower = speech.toLowerCase();

  // Scan types and variations
  const scanTypes = {
    mri: ['mri', 'magnetic resonance', 'm.r.i', 'emri', 'mr scan'],
    ct: ['ct', 'cat scan', 'computed tomography', 'c.t', 'cat', 'ct scan'],
    xray: ['x-ray', 'xray', 'x ray', 'radiograph'],
    ultrasound: ['ultrasound', 'ultra sound', 'sonogram', 'echo'],
    pet: ['pet scan', 'pet', 'positron emission'],
    mammogram: ['mammogram', 'mammo', 'breast scan'],
    dexa: ['dexa', 'bone density', 'dxa scan'],
    fluoroscopy: ['fluoroscopy', 'fluoro']
  };

  // Time preferences
  const timePreferences = {
    morning: ['morning', 'am', 'before noon', 'early'],
    afternoon: ['afternoon', 'pm', 'after lunch', 'later'],
    asap: ['as soon as', 'asap', 'urgent', 'emergency', 'quickly', 'today', 'right away'],
    nextWeek: ['next week', 'following week'],
    thisWeek: ['this week', 'coming days']
  };

  // Body parts mentioned
  const bodyParts = ['head', 'brain', 'chest', 'abdomen', 'spine', 'back', 'knee', 'shoulder',
                     'hip', 'ankle', 'wrist', 'lung', 'heart', 'liver', 'kidney'];

  // Detect what scan type they want
  let detectedScan = null;
  for (const [scanKey, keywords] of Object.entries(scanTypes)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      detectedScan = scanKey;
      break;
    }
  }

  // Detect time preference
  let timePreference = null;
  for (const [timeKey, keywords] of Object.entries(timePreferences)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      timePreference = timeKey;
      break;
    }
  }

  // Detect body part
  const mentionedBodyPart = bodyParts.find(part => lower.includes(part));

  // Detect confirmation
  const isConfirmation = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'confirm', 'book', 'that works', 'perfect', 'sounds good'].some(word => lower.includes(word));
  const isDenial = ['no', 'nope', 'cancel', 'nevermind', 'different', 'not'].some(word => lower.includes(word));

  return {
    scanType: detectedScan,
    timePreference,
    bodyPart: mentionedBodyPart,
    isConfirmation,
    isDenial,
    rawSpeech: speech
  };
}

// Generate appropriate appointment times based on preferences
function generateAppointmentOptions(timePreference, scanType) {
  const now = new Date();
  const options = [];

  if (timePreference === 'asap') {
    // Urgent - offer today or tomorrow
    options.push({
      day: 'today',
      time: '3:30 PM',
      available: true
    });
    options.push({
      day: 'tomorrow',
      time: '8:00 AM',
      available: true
    });
  } else if (timePreference === 'morning') {
    options.push({
      day: 'tomorrow',
      time: '9:00 AM',
      available: true
    });
    options.push({
      day: 'Thursday',
      time: '10:30 AM',
      available: true
    });
  } else if (timePreference === 'afternoon') {
    options.push({
      day: 'Wednesday',
      time: '2:00 PM',
      available: true
    });
    options.push({
      day: 'Friday',
      time: '3:30 PM',
      available: true
    });
  } else {
    // Default options
    options.push({
      day: 'tomorrow',
      time: '2:00 PM',
      available: true
    });
    options.push({
      day: 'Friday',
      time: '10:00 AM',
      available: true
    });
  }

  return options;
}

// Send SMS confirmation
async function sendSMSConfirmation(phoneNumber, appointmentDetails) {
  try {
    const message = await twilioClient.messages.create({
      body: `RadScheduler Confirmation:\n\n` +
            `✅ Your ${appointmentDetails.scanType} is confirmed for ${appointmentDetails.day} at ${appointmentDetails.time}\n\n` +
            `Location: Radiology Department, Main Hospital\n` +
            `Please arrive 15 minutes early with your insurance card.\n\n` +
            `To cancel or reschedule, call (239) 382-5683`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    logger.info('SMS confirmation sent', { messageId: message.sid, to: phoneNumber });
    return true;
  } catch (error) {
    logger.error('Failed to send SMS', error);
    return false;
  }
}

// Handle incoming calls
router.post('/incoming', (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const fromNumber = req.body.From;

  // Initialize conversation state
  conversations[callSid] = {
    phoneNumber: fromNumber,
    startTime: new Date()
  };

  const gather = twiml.gather({
    input: 'speech',
    timeout: 3,
    language: 'en-US',
    action: '/voice/process',
    method: 'POST',
    speechTimeout: 'auto',
    enhanced: true, // Enable enhanced speech model
    speechModel: 'phone_call' // Optimized for phone audio
  });

  gather.say({
    voice: 'Polly.Joanna',
    language: 'en-US'
  }, 'Welcome to RadScheduler. How can I help you today?');

  // If no input, ask again
  twiml.redirect('/voice/incoming');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Process speech input with better understanding
router.post('/process', async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  const confidence = req.body.Confidence || 0;
  const callSid = req.body.CallSid;

  logger.info('Processing speech', { speech: speechResult, confidence });

  // Analyze the speech
  const intent = detectIntent(speechResult);

  // Store intent in conversation
  if (conversations[callSid]) {
    conversations[callSid].lastIntent = intent;
  }

  // Handle based on detected intent
  if (intent.scanType) {
    // They mentioned a specific scan type
    const options = generateAppointmentOptions(intent.timePreference, intent.scanType);

    conversations[callSid].scanType = intent.scanType;
    conversations[callSid].bodyPart = intent.bodyPart;
    conversations[callSid].appointmentOptions = options;

    let response = `I can help you schedule a ${intent.scanType.toUpperCase()}`;
    if (intent.bodyPart) {
      response += ` for your ${intent.bodyPart}`;
    }

    if (intent.timePreference === 'asap') {
      response += `. Since this is urgent, I have an opening ${options[0].day} at ${options[0].time}. Would that work?`;
    } else {
      response += `. I have availability ${options[0].day} at ${options[0].time}, or ${options[1].day} at ${options[1].time}. Which would you prefer?`;
    }

    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/confirm',
      method: 'POST',
      speechTimeout: 'auto'
    });

    gather.say({ voice: 'Polly.Joanna' }, response);

  } else if (speechResult.length > 0) {
    // They said something but we couldn't detect a scan type
    // Try to be more helpful
    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/process',
      method: 'POST',
      speechTimeout: 'auto'
    });

    gather.say({
      voice: 'Polly.Joanna'
    }, 'I can help schedule various imaging appointments including MRI, CT scans, X-rays, ultrasounds, and more. What type of scan do you need?');

  } else {
    // No speech detected
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'I didn\'t hear anything. Please tell me what type of appointment you need.');
    twiml.redirect('/voice/incoming');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Confirm appointment
router.post('/confirm', async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  const callSid = req.body.CallSid;
  const fromNumber = req.body.From;

  const intent = detectIntent(speechResult);
  const conversation = conversations[callSid];

  if (intent.isConfirmation || speechResult.toLowerCase().includes('first') || speechResult.toLowerCase().includes('1')) {
    // Book the appointment
    const appointment = conversation.appointmentOptions[0];
    appointment.scanType = conversation.scanType;

    // Send SMS confirmation
    const smsSent = await sendSMSConfirmation(fromNumber, appointment);

    twiml.say({
      voice: 'Polly.Joanna'
    }, `Perfect! Your ${conversation.scanType.toUpperCase()} is confirmed for ${appointment.day} at ${appointment.time}. ${smsSent ? 'You will receive a text confirmation shortly.' : ''} Thank you for choosing RadScheduler.`);

    // Log the booking
    logger.info('Appointment booked', {
      callSid,
      phoneNumber: fromNumber,
      scanType: conversation.scanType,
      appointment
    });

    // Clean up conversation
    delete conversations[callSid];

  } else if (speechResult.toLowerCase().includes('second') || speechResult.toLowerCase().includes('2')) {
    // Book the second option
    const appointment = conversation.appointmentOptions[1];
    appointment.scanType = conversation.scanType;

    const smsSent = await sendSMSConfirmation(fromNumber, appointment);

    twiml.say({
      voice: 'Polly.Joanna'
    }, `Great! Your ${conversation.scanType.toUpperCase()} is confirmed for ${appointment.day} at ${appointment.time}. ${smsSent ? 'You will receive a text confirmation shortly.' : ''} Thank you.`);

    delete conversations[callSid];

  } else if (intent.isDenial) {
    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/process',
      method: 'POST'
    });

    gather.say({
      voice: 'Polly.Joanna'
    }, 'No problem. Would you like to hear other available times, or schedule a different type of scan?');

  } else {
    // Didn't understand
    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/confirm',
      method: 'POST'
    });

    gather.say({
      voice: 'Polly.Joanna'
    }, 'Please say yes to confirm the first time slot, or tell me which option you prefer.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Status callback for debugging
router.post('/status', (req, res) => {
  logger.info('Call status update', req.body);

  // Clean up conversation on call end
  if (req.body.CallStatus === 'completed') {
    delete conversations[req.body.CallSid];
  }

  res.sendStatus(200);
});

module.exports = router;