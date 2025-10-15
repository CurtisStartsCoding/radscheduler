// Scheduling configuration stub
// Patient self-scheduling is disabled by default

const config = {
  patientSelfScheduling: {
    enabled: false,
    allowedModalities: [],
    requiresApprovalModalities: [],
    businessHours: {
      start: 8,
      end: 17
    }
  }
};

function isPatientSelfSchedulingEnabled() {
  return config.patientSelfScheduling.enabled;
}

function isModalityAllowedForSelfScheduling(modality) {
  return config.patientSelfScheduling.allowedModalities.includes(modality);
}

function doesModalityRequireApproval(modality) {
  return config.patientSelfScheduling.requiresApprovalModalities.includes(modality);
}

module.exports = {
  ...config,
  isPatientSelfSchedulingEnabled,
  isModalityAllowedForSelfScheduling,
  doesModalityRequireApproval
};
