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
    voice: 'Polly.Joanna',
    language: 'en-US'
  }, 'Welcome to RadScheduler. I can help you book your radiology appointment. Just tell me what type of scan you need, like MRI, CT scan, or ultrasound.');

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
      voice: 'Polly.Joanna'
    }, 'I can help you schedule an MRI. We have an opening tomorrow at 2 PM. Would you like to book that?');

    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/confirm',
      method: 'POST'
    });

  } else if (lowerSpeech.includes('ct') || lowerSpeech.includes('cat scan')) {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'I can schedule a CT scan for you. We have availability this Friday at 10 AM. Would that work?');

    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/confirm',
      method: 'POST'
    });

  } else if (lowerSpeech.includes('ultrasound')) {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'For ultrasound appointments, we have openings tomorrow at 9 AM or Thursday at 3 PM. Which would you prefer?');

    const gather = twiml.gather({
      input: 'speech',
      timeout: 5,
      action: '/voice/confirm',
      method: 'POST'
    });

  } else {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'I can help you schedule radiology appointments. Please tell me what type of scan you need.');
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
      voice: 'Polly.Joanna'
    }, 'Perfect! Your appointment has been scheduled. You will receive a confirmation text shortly. Thank you for using RadScheduler.');

    // TODO: Actually create appointment and send SMS

  } else if (lowerSpeech.includes('no') || lowerSpeech.includes('cancel')) {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'No problem. Feel free to call back anytime to schedule your appointment. Goodbye!');
  } else {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'I did not catch that. Please say yes to confirm or no to cancel.');
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