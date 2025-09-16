// Test patient self-scheduling with all modalities
const testBooking = {
  patientName: "John Doe",
  patientPhone: "+1234567890",
  patientEmail: "john.doe@example.com",
  modality: "MRI",
  studyType: "Brain",
  preferredDate: "2025-01-15",
  preferredTime: "09:00",
  urgency: "routine",
  notes: "Test booking for all modalities"
};

async function testPatientBooking() {
  console.log('=== Testing Patient Self-Scheduling ===\n');
  
  try {
    // Test 1: Check if patient scheduling is enabled
    console.log('1. Testing patient scheduling endpoint...');
    const response = await fetch('http://localhost:3010/api/patient/book-appointment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testBooking)
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Patient booking successful!');
      console.log(`   Appointment ID: ${data.appointmentId}`);
      console.log(`   Status: ${data.confirmation.status}`);
      console.log(`   Requires Approval: ${data.requiresApproval}`);
      console.log(`   Message: ${data.message}`);
    } else {
      console.log('❌ Patient booking failed:');
      console.log(`   Error: ${data.error}`);
    }
    
  } catch (error) {
    console.log('❌ Test failed with error:', error.message);
  }
  
  console.log('\n=== Test Complete ===');
}

testPatientBooking(); 