// Demonstrate the modular scheduling configuration
const schedulingConfig = require('./api/src/config/scheduling');

console.log('🧪 RadScheduler Modular Scheduling Configuration\n');

// Show current configuration
console.log('📋 CURRENT CONFIGURATION:');
console.log('=' .repeat(50));
console.log('Patient Self-Scheduling Enabled:', schedulingConfig.isPatientSelfSchedulingEnabled());
console.log('Current RIS Type:', process.env.RIS_TYPE || 'avreo (default)');
console.log('Global Self-Scheduling:', process.env.ENABLE_PATIENT_SCHEDULING || 'false (default)');

// Show RIS-specific configurations
console.log('\n🔧 RIS-SPECIFIC CONFIGURATIONS:');
console.log('=' .repeat(50));

Object.entries(schedulingConfig.risConfig).forEach(([risType, config]) => {
  console.log(`\n${risType.toUpperCase()} RIS:`);
  console.log(`  Name: ${config.name}`);
  console.log(`  Self-Scheduling Enabled: ${config.selfSchedulingEnabled}`);
  console.log(`  Sync Enabled: ${config.syncEnabled}`);
  console.log(`  Sync Interval: ${config.syncInterval} minutes`);
  console.log(`  Allowed for Self-Scheduling: ${config.allowedForSelfScheduling.join(', ') || 'None'}`);
  console.log(`  Requires Approval: ${config.requiresApproval.join(', ') || 'None'}`);
});

// Show how to enable different configurations
console.log('\n🎯 HOW TO ENABLE PATIENT SELF-SCHEDULING:');
console.log('=' .repeat(50));

console.log('\n1️⃣ For Avreo RIS (Recommended):');
console.log('   export ENABLE_PATIENT_SCHEDULING=true');
console.log('   export RIS_TYPE=avreo');
console.log('   Result: Patients can self-schedule X-Ray, Ultrasound, Mammography');
console.log('   MRI and CT require approval');

console.log('\n2️⃣ For Epic RIS:');
console.log('   export ENABLE_PATIENT_SCHEDULING=true');
console.log('   export RIS_TYPE=epic');
console.log('   Result: Self-scheduling disabled (Epic handles scheduling)');
console.log('   Only sync appointments from Epic');

console.log('\n3️⃣ For Cerner RIS:');
console.log('   export ENABLE_PATIENT_SCHEDULING=true');
console.log('   export RIS_TYPE=cerner');
console.log('   Result: Self-scheduling disabled (Cerner handles scheduling)');
console.log('   Only sync appointments from Cerner');

console.log('\n4️⃣ For Custom RIS:');
console.log('   export ENABLE_PATIENT_SCHEDULING=true');
console.log('   export RIS_TYPE=custom');
console.log('   export CUSTOM_SELF_SCHEDULING=true');
console.log('   export CUSTOM_ALLOWED_MODALITIES=X-Ray,Ultrasound');
console.log('   export CUSTOM_REQUIRES_APPROVAL=MRI,CT');
console.log('   Result: Custom configuration based on environment variables');

// Show dual scheduling workflow
console.log('\n🔄 DUAL SCHEDULING WORKFLOW:');
console.log('=' .repeat(50));
console.log('1. Pull appointments from RIS (Avreo/Epic/Cerner)');
console.log('2. Allow patients to self-schedule (if enabled for RIS)');
console.log('3. AI conflict detection on all appointments');
console.log('4. SMS notifications for all appointments');
console.log('5. Approval workflow for complex procedures');
console.log('6. Complete audit trail for compliance');

// Show benefits
console.log('\n💡 KEY BENEFITS:');
console.log('=' .repeat(50));
console.log('✅ Modular: Turn features on/off per RIS type');
console.log('✅ Flexible: Configure allowed modalities per hospital');
console.log('✅ Secure: Approval workflow for complex procedures');
console.log('✅ Integrated: Works with existing RIS systems');
console.log('✅ Compliant: Full audit trail and HIPAA compliance');
console.log('✅ Scalable: Easy to add new RIS types');

console.log('\n🚀 READY TO DEPLOY:');
console.log('=' .repeat(50));
console.log('The system is ready to be configured for any RIS type.');
console.log('Simply set the appropriate environment variables and restart.');
console.log('No code changes required - pure configuration-based approach.'); 