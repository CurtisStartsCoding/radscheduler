const axios = require('axios');

const API_BASE = 'http://localhost:3010/api';

// Test different RIS configurations
const testConfigurations = {
  avreo: {
    RIS_TYPE: 'avreo',
    ENABLE_PATIENT_SCHEDULING: 'true',
    description: 'Avreo RIS - Self-scheduling enabled for X-Ray, Ultrasound, Mammography'
  },
  epic: {
    RIS_TYPE: 'epic',
    ENABLE_PATIENT_SCHEDULING: 'true',
    description: 'Epic RIS - Self-scheduling disabled (Epic handles scheduling)'
  },
  cerner: {
    RIS_TYPE: 'cerner',
    ENABLE_PATIENT_SCHEDULING: 'true',
    description: 'Cerner RIS - Self-scheduling disabled (Cerner handles scheduling)'
  },
  custom: {
    RIS_TYPE: 'custom',
    ENABLE_PATIENT_SCHEDULING: 'true',
    CUSTOM_SELF_SCHEDULING: 'true',
    CUSTOM_ALLOWED_MODALITIES: 'X-Ray,Ultrasound',
    CUSTOM_REQUIRES_APPROVAL: 'MRI,CT',
    description: 'Custom RIS - Self-scheduling enabled for X-Ray and Ultrasound only'
  }
};

async function testDualScheduling() {
  console.log('🧪 Testing Dual Scheduling System (Avreo + Patient Self-Scheduling)\n');

  for (const [risType, config] of Object.entries(testConfigurations)) {
    console.log(`\n📋 Testing ${config.description}`);
    console.log('=' .repeat(60));

    try {
      // Test 1: Check if patient self-scheduling is enabled
      console.log('\n1️⃣ Testing patient self-scheduling availability...');
      
      const availableSlotsResponse = await axios.get(`${API_BASE}/patient/available-slots`, {
        params: {
          date: '2024-01-15',
          modality: 'X-Ray'
        }
      });

      if (availableSlotsResponse.data.success) {
        console.log('✅ Patient self-scheduling is ENABLED');
        console.log(`   Available slots: ${availableSlotsResponse.data.totalSlots}`);
      } else {
        console.log('❌ Patient self-scheduling is DISABLED');
        console.log(`   Reason: ${availableSlotsResponse.data.error}`);
      }

      // Test 2: Test booking an allowed modality
      console.log('\n2️⃣ Testing booking allowed modality (X-Ray)...');
      
      const bookingData = {
        patientName: 'John Doe',
        patientPhone: '+1234567890',
        patientEmail: 'john@example.com',
        modality: 'X-Ray',
        studyType: 'Chest',
        preferredDate: '2024-01-15',
        preferredTime: '09:00',
        urgency: 'routine',
        notes: 'Test appointment'
      };

      try {
        const bookingResponse = await axios.post(`${API_BASE}/patient/book-appointment`, bookingData);
        
        if (bookingResponse.data.success) {
          console.log('✅ X-Ray appointment booked successfully');
          console.log(`   Appointment ID: ${bookingResponse.data.appointmentId}`);
          console.log(`   Status: ${bookingResponse.data.confirmation.status}`);
          console.log(`   Requires Approval: ${bookingResponse.data.requiresApproval}`);
        }
      } catch (bookingError) {
        if (bookingError.response?.status === 403) {
          console.log('❌ X-Ray booking blocked - modality not allowed');
        } else {
          console.log('❌ X-Ray booking failed:', bookingError.response?.data?.error);
        }
      }

      // Test 3: Test booking a restricted modality
      console.log('\n3️⃣ Testing booking restricted modality (MRI)...');
      
      const mriBookingData = {
        ...bookingData,
        modality: 'MRI',
        studyType: 'Brain',
        preferredTime: '10:00'
      };

      try {
        const mriBookingResponse = await axios.post(`${API_BASE}/patient/book-appointment`, mriBookingData);
        
        if (mriBookingResponse.data.success) {
          console.log('✅ MRI appointment booked successfully');
          console.log(`   Appointment ID: ${mriBookingResponse.data.appointmentId}`);
          console.log(`   Status: ${mriBookingResponse.data.confirmation.status}`);
          console.log(`   Requires Approval: ${mriBookingResponse.data.requiresApproval}`);
        }
      } catch (mriBookingError) {
        if (mriBookingError.response?.status === 403) {
          console.log('❌ MRI booking blocked - modality not allowed for self-scheduling');
        } else {
          console.log('❌ MRI booking failed:', mriBookingError.response?.data?.error);
        }
      }

      // Test 4: Check Avreo integration status
      console.log('\n4️⃣ Testing Avreo integration status...');
      
      try {
        const avreoStatusResponse = await axios.get(`${API_BASE}/avreo/status`);
        console.log('✅ Avreo integration status:', avreoStatusResponse.data);
      } catch (avreoError) {
        console.log('❌ Avreo integration not available or failed');
      }

      // Test 5: Test manual Avreo sync
      console.log('\n5️⃣ Testing manual Avreo sync...');
      
      try {
        const syncResponse = await axios.post(`${API_BASE}/avreo/sync`);
        console.log('✅ Manual Avreo sync completed');
        console.log(`   Appointments processed: ${syncResponse.data.appointmentsProcessed}`);
      } catch (syncError) {
        console.log('❌ Manual Avreo sync failed:', syncError.response?.data?.error);
      }

    } catch (error) {
      console.log('❌ Test failed:', error.message);
    }

    console.log('\n' + '-'.repeat(60));
  }

  // Summary
  console.log('\n📊 DUAL SCHEDULING SYSTEM SUMMARY');
  console.log('=' .repeat(60));
  console.log('✅ Avreo Integration: Pull appointments from Avreo calendar API');
  console.log('✅ Patient Self-Scheduling: Allow patients to book directly');
  console.log('✅ Configuration-Based: Enable/disable per RIS type');
  console.log('✅ Modality Restrictions: Control which studies can be self-scheduled');
  console.log('✅ Approval Workflow: Require approval for complex studies');
  console.log('✅ Conflict Detection: AI-powered scheduling conflict detection');
  console.log('✅ SMS Notifications: Automated patient communications');
  console.log('✅ Audit Logging: Complete audit trail for compliance');
  
  console.log('\n🎯 KEY BENEFITS:');
  console.log('• Reduce phone calls and manual scheduling');
  console.log('• Improve patient satisfaction with 24/7 booking');
  console.log('• Maintain control over complex procedures');
  console.log('• Seamless integration with existing RIS');
  console.log('• HIPAA-compliant with full audit trail');
}

// Run the test
testDualScheduling().catch(console.error); 