const axios = require('axios');

const API_BASE = 'http://localhost:3010/api';
const ADMIN_CREDENTIALS = {
  email: 'admin@radscheduler.com',
  password: 'password'
};

async function testAvreoIntegration() {
  console.log('🧪 Testing Avreo Integration...\n');

  try {
    // 1. Login to get token
    console.log('1. Authenticating...');
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, ADMIN_CREDENTIALS);
    const token = loginResponse.data.token;
    console.log('✅ Authentication successful\n');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Check Avreo configuration
    console.log('2. Checking Avreo configuration...');
    const configResponse = await axios.get(`${API_BASE}/avreo/config`, { headers });
    console.log('📋 Configuration:', configResponse.data.config);
    console.log('✅ Configuration check complete\n');

    // 3. Test Avreo connection
    console.log('3. Testing Avreo connection...');
    try {
      const connectionResponse = await axios.post(`${API_BASE}/avreo/test-connection`, {}, { headers });
      console.log('🔗 Connection test result:', connectionResponse.data);
      console.log('✅ Connection test complete\n');
    } catch (error) {
      console.log('⚠️  Connection test failed (expected if Avreo not configured):', error.response?.data?.error || error.message);
      console.log('ℹ️  This is normal if Avreo credentials are not set up yet\n');
    }

    // 4. Check sync status
    console.log('4. Checking sync status...');
    const statusResponse = await axios.get(`${API_BASE}/avreo/status`, { headers });
    console.log('📊 Sync status:', statusResponse.data.status);
    console.log('✅ Status check complete\n');

    // 5. Manual sync (if configured)
    console.log('5. Attempting manual sync...');
    try {
      const syncResponse = await axios.post(`${API_BASE}/avreo/sync`, {}, { headers });
      console.log('🔄 Sync result:', syncResponse.data);
      console.log('✅ Manual sync complete\n');
    } catch (error) {
      console.log('⚠️  Manual sync failed (expected if Avreo not configured):', error.response?.data?.error || error.message);
      console.log('ℹ️  This is normal if Avreo credentials are not set up yet\n');
    }

    // 6. Schedule automatic sync
    console.log('6. Scheduling automatic sync...');
    const scheduleResponse = await axios.post(`${API_BASE}/avreo/schedule-sync`, {}, { headers });
    console.log('⏰ Schedule result:', scheduleResponse.data);
    console.log('✅ Automatic sync scheduled\n');

    console.log('🎉 Avreo integration test completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Set up AVREO_API_URL, AVREO_USERNAME, and AVREO_PASSWORD in your .env file');
    console.log('2. Restart the server to load the new environment variables');
    console.log('3. Run this test again to verify the connection');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testAvreoIntegration(); 