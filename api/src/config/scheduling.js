// Scheduling configuration based on RIS type
const schedulingConfig = {
  // Enable/disable patient self-scheduling globally
  patientSelfScheduling: {
    enabled: process.env.ENABLE_PATIENT_SCHEDULING === 'true' || false,
    allowedModalities: process.env.ALLOWED_MODALITIES?.split(',') || ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography'],
    restrictedModalities: process.env.RESTRICTED_MODALITIES?.split(',') || [],
    maxAdvanceBooking: parseInt(process.env.MAX_ADVANCE_BOOKING_DAYS) || 30,
    minAdvanceBooking: parseInt(process.env.MIN_ADVANCE_BOOKING_HOURS) || 24,
    businessHours: {
      start: parseInt(process.env.BUSINESS_HOURS_START) || 8,
      end: parseInt(process.env.BUSINESS_HOURS_END) || 18
    }
  },

  // RIS-specific configurations
  risConfig: {
    // Avreo RIS
    avreo: {
      name: 'Avreo',
      selfSchedulingEnabled: true,
      syncEnabled: true,
      syncInterval: 5, // minutes
      allowedForSelfScheduling: ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography'],
      requiresApproval: []
    },

    // Epic RIS
    epic: {
      name: 'Epic',
      selfSchedulingEnabled: true, // Enable for Epic with high pre-auth success
      syncEnabled: true,
      syncInterval: 10,
      allowedForSelfScheduling: ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography'],
      requiresApproval: []
    },

    // Cerner RIS
    cerner: {
      name: 'Cerner',
      selfSchedulingEnabled: true, // Enable for Cerner with high pre-auth success
      syncEnabled: true,
      syncInterval: 15,
      allowedForSelfScheduling: ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography'],
      requiresApproval: []
    },

    // Custom/Other RIS
    custom: {
      name: 'Custom',
      selfSchedulingEnabled: process.env.CUSTOM_SELF_SCHEDULING === 'true' || true,
      syncEnabled: process.env.CUSTOM_SYNC_ENABLED === 'true' || false,
      syncInterval: parseInt(process.env.CUSTOM_SYNC_INTERVAL) || 5,
      allowedForSelfScheduling: process.env.CUSTOM_ALLOWED_MODALITIES?.split(',') || ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography'],
      requiresApproval: process.env.CUSTOM_REQUIRES_APPROVAL?.split(',') || []
    }
  },

  // Get current RIS configuration
  getCurrentRISConfig() {
    const risType = process.env.RIS_TYPE?.toLowerCase() || 'avreo';
    return this.risConfig[risType] || this.risConfig.custom;
  },

  // Check if patient self-scheduling is enabled
  isPatientSelfSchedulingEnabled() {
    const risConfig = this.getCurrentRISConfig();
    return this.patientSelfScheduling.enabled && risConfig.selfSchedulingEnabled;
  },

  // Check if modality is allowed for self-scheduling
  isModalityAllowedForSelfScheduling(modality) {
    if (!this.isPatientSelfSchedulingEnabled()) return false;
    
    const risConfig = this.getCurrentRISConfig();
    return risConfig.allowedForSelfScheduling.includes(modality);
  },

  // Check if modality requires approval
  doesModalityRequireApproval(modality) {
    const risConfig = this.getCurrentRISConfig();
    return risConfig.requiresApproval.includes(modality);
  },

  // Get sync configuration
  getSyncConfig() {
    const risConfig = this.getCurrentRISConfig();
    return {
      enabled: risConfig.syncEnabled,
      interval: risConfig.syncInterval * 60 * 1000 // convert to milliseconds
    };
  }
};

module.exports = schedulingConfig; 