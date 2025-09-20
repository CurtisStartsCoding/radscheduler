const twilio = require('twilio');
require('dotenv').config({ path: '../api/.env' });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

const webhookUrl = 'http://50.19.63.140:3010/voice/incoming';
const statusCallbackUrl = 'http://50.19.63.140:3010/voice/status';

async function configureTwilioNumber() {
  try {
    console.log('Configuring Twilio phone number:', phoneNumber);
    console.log('Webhook URL:', webhookUrl);

    // Fetch the phone number SID
    const numbers = await client.incomingPhoneNumbers
      .list({ phoneNumber: phoneNumber });

    if (numbers.length === 0) {
      console.error('Phone number not found in your Twilio account');
      return;
    }

    const numberSid = numbers[0].sid;

    // Update the voice URL
    const number = await client.incomingPhoneNumbers(numberSid)
      .update({
        voiceUrl: webhookUrl,
        voiceMethod: 'POST',
        statusCallback: statusCallbackUrl,
        statusCallbackMethod: 'POST',
        voiceFallbackUrl: webhookUrl,
        voiceFallbackMethod: 'POST'
      });

    console.log('✅ Twilio number configured successfully!');
    console.log('Voice URL:', number.voiceUrl);
    console.log('Phone number:', number.phoneNumber);
    console.log('');
    console.log('🎉 Ready to test! Call', phoneNumber, 'to test the AI booking system');

  } catch (error) {
    console.error('Error configuring Twilio:', error);
  }
}

configureTwilioNumber();