const twilio = require('twilio');
require('dotenv').config({ path: '../.env' });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

// Your EC2 instance URL or ngrok URL for local testing
const BASE_URL = process.env.BASE_URL || 'http://50.19.63.140:3010';

async function updatePhoneNumber() {
  try {
    // Get the phone number SID
    const phoneNumbers = await client.incomingPhoneNumbers.list({
      phoneNumber: phoneNumber
    });

    if (phoneNumbers.length === 0) {
      console.error('Phone number not found:', phoneNumber);
      return;
    }

    const phoneNumberSid = phoneNumbers[0].sid;
    console.log('Found phone number:', phoneNumber, 'SID:', phoneNumberSid);

    // Update the voice webhook URL to use Retell
    const updatedNumber = await client.incomingPhoneNumbers(phoneNumberSid)
      .update({
        voiceUrl: `${BASE_URL}/api/retell/incoming-call`,
        voiceMethod: 'POST',
        statusCallback: `${BASE_URL}/api/retell/call-status`,
        statusCallbackMethod: 'POST'
      });

    console.log('\n✅ Phone number configured for Retell AI!');
    console.log('Voice URL:', updatedNumber.voiceUrl);
    console.log('Status Callback:', updatedNumber.statusCallback);
    console.log('\nTest your configuration by calling:', phoneNumber);

  } catch (error) {
    console.error('Error updating phone number:', error.message);
    if (error.code === 20003) {
      console.error('\n❌ Authentication failed. Please check your Twilio credentials in .env file.');
    }
  }
}

// Run the update
updatePhoneNumber();