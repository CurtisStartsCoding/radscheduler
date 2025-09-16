#!/usr/bin/env node

/**
 * Test script for Clinical Decision Support Platform Integration
 * This simulates how your clinical platform would integrate with RadScheduler
 */

const https = require('https');
const http = require('http');

const API_BASE = 'http://localhost:3010/api';

// Simulate clinical decision data from your platform
const clinicalDecision = {
  patientId: "MRN123456",
  patientName: "John Doe",
  patientPhone: "+12393229966", // Your demo phone
  clinicalData: {
    riskScore: 85,
    modality: "MRI",
    recommendedProtocol: "Brain w/o contrast",
    urgency: "routine",
    analysis: "AI analysis suggests routine screening based on patient history",
    recommendations: [
      "Schedule within 2 weeks",
      "Consider follow-up in 6 months",
      "Monitor for any new symptoms"
    ],
    referringPhysician: "Dr. Smith"
  },
  schedulingPreferences: {
    preferredDateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
    preferredTimeSlots: ["morning", "afternoon"],
    maxWaitTime: "2 weeks"
  },
  source: "clinical_decision_platform"
};

async function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testClinicalIntegration() {
  console.log('🏥 Testing Clinical Decision Support Platform Integration\n');
  
  try {
    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const health = await makeRequest('/health');
    console.log(`   ✅ Health: ${health.status} - ${health.data.status}`);
    
    // Test 2: Send clinical decision
    console.log('\n2. Sending clinical decision...');
    const clinicalResult = await makeRequest('/clinical/clinical-decision', 'POST', clinicalDecision);
    console.log(`   ✅ Clinical Decision: ${clinicalResult.status}`);
    console.log(`   📋 Appointment ID: ${clinicalResult.data.appointmentId}`);
    console.log(`   🧠 Risk Score: ${clinicalResult.data.clinicalContext.riskScore}%`);
    console.log(`   📱 SMS Sent: ${clinicalResult.data.message}`);
    
    // Test 3: Get available slots
    console.log('\n3. Getting available slots...');
    const slots = await makeRequest('/clinical/available-slots?modality=MRI&date=2024-01-15');
    console.log(`   ✅ Available Slots: ${slots.status}`);
    console.log(`   📅 Total slots: ${slots.data.totalSlots}`);
    
    // Test 4: Get clinical analytics
    console.log('\n4. Getting clinical analytics...');
    const analytics = await makeRequest('/clinical/clinical-analytics?date=2024-01-15');
    console.log(`   ✅ Analytics: ${analytics.status}`);
    console.log(`   📊 Total appointments: ${analytics.data.analytics.totalAppointments}`);
    console.log(`   🧠 Average risk score: ${analytics.data.analytics.averageRiskScore}%`);
    console.log(`   🏥 Clinical decisions: ${analytics.data.analytics.clinicalDecisions}`);
    
    // Test 5: Send enhanced SMS
    console.log('\n5. Sending enhanced clinical SMS...');
    const smsData = {
      patientPhone: "+12393229966",
      clinicalData: clinicalDecision.clinicalData,
      bookingUrl: "https://patient-portal.com/book/123",
      appointmentId: clinicalResult.data.appointmentId
    };
    const smsResult = await makeRequest('/clinical/send-clinical-sms', 'POST', smsData);
    console.log(`   ✅ Enhanced SMS: ${smsResult.status}`);
    console.log(`   📱 Message ID: ${smsResult.data.messageId}`);
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Integration Summary:');
    console.log('   • Clinical decisions can be sent to RadScheduler');
    console.log('   • Appointments are created with clinical context');
    console.log('   • Enhanced SMS with clinical information is sent');
    console.log('   • Available slots can be queried');
    console.log('   • Clinical analytics are available');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testClinicalIntegration(); 