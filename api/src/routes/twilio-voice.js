const express = require('express');
const router = express.Router();
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Handle incoming voice calls
router.post('/incoming', (req, res) => {
  const twiml = new VoiceResponse();

  // Gather input with speech recognition
  const gather = twiml.gather({
    input: 'speech',
    timeout: 5,
    language: 'en-US',
    action: '/voice/process',
    method: 'POST',
    speechTimeout: 'auto'
  });

  gather.say({
    voice: 'alice',
    language: 'en-US'
  }, 'Welcome to RadScheduler AI booking system. How can I help you schedule your radiology appointment today? You can say things like: I need an MRI, or I want to schedule a CT scan.');

  // If no input, repeat
  twiml.redirect('/voice/incoming');

  res.type('text/xml');
  res.send(twiml.toString());
});

// Process the speech input
router.post('/process', async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  const confidence = req.body.Confidence || 0;

  console.log('Speech input:', speechResult, 'Confidence:', confidence);

  // Simple keyword detection for demo
  const lowerSpeech = speechResult.toLowerCase();

  if (lowerSpeech.includes('mri') || lowerSpeech.includes('magnetic')) {
    twiml.say({
      voice: 'alice'
    }, 'I can help you schedule an MRI. We have an opening tomorrow at 2 PM. Would you like me to book that for you?');

    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/confirm',
      method: 'POST'
    });

  } else if (lowerSpeech.includes('ct') || lowerSpeech.includes('cat scan')) {
    twiml.say({
      voice: 'alice'
    }, 'I can schedule a CT scan for you. We have availability this Friday at 10 AM. Would that work for you?');

    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/confirm',
      method: 'POST'
    });

  } else if (lowerSpeech.includes('ultrasound')) {
    twiml.say({
      voice: 'alice'
    }, 'For ultrasound appointments, we have openings tomorrow at 9 AM or Thursday at 3 PM. Which would you prefer?');

    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/confirm',
      method: 'POST'
    });

  } else {
    twiml.say({
      voice: 'alice'
    }, 'I can help you schedule radiology appointments. Please tell me what type of scan you need. For example, say MRI, CT scan, or ultrasound.');
    twiml.redirect('/voice/incoming');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Confirm booking
router.post('/confirm', async (req, res) => {
  const twiml = new VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  const lowerSpeech = speechResult.toLowerCase();

  if (lowerSpeech.includes('yes') || lowerSpeech.includes('book') || lowerSpeech.includes('confirm')) {
    twiml.say({
      voice: 'alice'
    }, 'Perfect! Your appointment has been scheduled. You will receive a confirmation text message shortly. Thank you for using RadScheduler. Have a great day!');

    // TODO: Actually create appointment and send SMS

  } else if (lowerSpeech.includes('no') || lowerSpeech.includes('cancel')) {
    twiml.say({
      voice: 'alice'
    }, 'No problem. Feel free to call back anytime to schedule your appointment. Have a great day!');
  } else {
    twiml.say({
      voice: 'alice'
    }, 'I didn\'t understand that. Please say yes to confirm or no to cancel.');
    twiml.redirect('/voice/process');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Status callback for debugging
router.post('/status', (req, res) => {
  console.log('Call status:', req.body);
  res.sendStatus(200);
});

module.exports = router;