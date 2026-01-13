/**
 * Duration Calculator Service
 *
 * Calculates realistic exam duration based on multiple factors:
 *   - Base duration from order/procedure
 *   - Equipment modifier (faster equipment = shorter time)
 *   - Patient factors (special needs = longer time)
 *
 * Formula: Total = Base * Equipment_Modifier + Patient_Additions
 */

const logger = require('../utils/logger');

/**
 * Default base durations by modality (in minutes)
 * Used when order doesn't specify duration
 */
const DEFAULT_DURATIONS = {
  CT: 30,
  MRI: 45,
  MAMMO: 20,
  US: 30,
  XRAY: 15,
  FLUORO: 30,
  PET: 60,
  DEFAULT: 30
};

/**
 * Equipment efficiency modifiers
 * Values < 1.0 reduce duration, > 1.0 increase duration
 */
const EQUIPMENT_MODIFIERS = {
  // CT modifiers based on slice count
  CT_256_PLUS: 0.75,      // 256+ slice CT is very fast
  CT_128_PLUS: 0.80,      // 128+ slice CT
  CT_64_PLUS: 0.85,       // 64+ slice CT
  CT_STANDARD: 1.0,       // 16-40 slice CT

  // MRI modifiers based on field strength
  MRI_3T: 0.70,           // 3T MRI is significantly faster
  MRI_1_5T: 1.0,          // Standard 1.5T

  // Wide-bore MRI (slightly longer due to positioning)
  MRI_WIDE_BORE: 1.05
};

/**
 * Patient factor additions (in minutes)
 * These are additive, not multiplicative
 */
const PATIENT_MODIFIERS = {
  CLAUSTROPHOBIC: 15,     // Extra time for anxiety management
  MOBILITY_ISSUES: 10,    // Extra time for positioning
  BARIATRIC: 10,          // Extra time for setup/positioning
  PEDIATRIC: 10,          // Extra time for cooperation
  ELDERLY: 5,             // Extra time for assistance
  HEARING_IMPAIRED: 5,    // Extra time for communication
  NON_ENGLISH: 5          // Extra time for interpreter needs
};

/**
 * Calculate exam duration for a specific order and location
 * @param {Object} order - Order with estimatedDuration, modality
 * @param {Object} equipment - Equipment specs from scheduling_equipment
 * @param {Object} patientContext - Patient context with flags for special needs
 * @returns {Object} - { totalDuration, breakdown }
 */
function calculateDuration(order, equipment, patientContext) {
  const modality = (order.modality || '').toUpperCase();

  // 1. Get base duration
  const baseDuration = order.estimatedDuration ||
                       DEFAULT_DURATIONS[modality] ||
                       DEFAULT_DURATIONS.DEFAULT;

  // 2. Calculate equipment modifier
  let equipmentModifier = 1.0;
  let equipmentNote = 'standard';

  if (equipment) {
    if (modality === 'CT' && equipment.ct_slice_count) {
      if (equipment.ct_slice_count >= 256) {
        equipmentModifier = EQUIPMENT_MODIFIERS.CT_256_PLUS;
        equipmentNote = `${equipment.ct_slice_count}-slice CT`;
      } else if (equipment.ct_slice_count >= 128) {
        equipmentModifier = EQUIPMENT_MODIFIERS.CT_128_PLUS;
        equipmentNote = `${equipment.ct_slice_count}-slice CT`;
      } else if (equipment.ct_slice_count >= 64) {
        equipmentModifier = EQUIPMENT_MODIFIERS.CT_64_PLUS;
        equipmentNote = `${equipment.ct_slice_count}-slice CT`;
      }
    }

    if (modality === 'MRI' && equipment.mri_field_strength) {
      if (equipment.mri_field_strength >= 3.0) {
        equipmentModifier = EQUIPMENT_MODIFIERS.MRI_3T;
        equipmentNote = `${equipment.mri_field_strength}T MRI`;
      }

      // Wide-bore modifier stacks with field strength
      if (equipment.mri_wide_bore) {
        equipmentModifier *= EQUIPMENT_MODIFIERS.MRI_WIDE_BORE;
        equipmentNote += ' wide-bore';
      }
    }
  }

  // Apply equipment modifier to base duration
  let duration = Math.round(baseDuration * equipmentModifier);

  // 3. Calculate patient modifiers (additive)
  const patientModifiers = [];
  let patientAddition = 0;

  if (patientContext) {
    // Check order description for claustrophobia
    const orderDesc = (order.orderDescription || '').toUpperCase();
    if (orderDesc.includes('CLAUSTROPHOB') || patientContext.claustrophobic) {
      patientAddition += PATIENT_MODIFIERS.CLAUSTROPHOBIC;
      patientModifiers.push({ factor: 'claustrophobic', minutes: PATIENT_MODIFIERS.CLAUSTROPHOBIC });
    }

    // Check for mobility issues
    if (patientContext.mobilityIssues || patientContext.wheelchair || patientContext.walker) {
      patientAddition += PATIENT_MODIFIERS.MOBILITY_ISSUES;
      patientModifiers.push({ factor: 'mobility', minutes: PATIENT_MODIFIERS.MOBILITY_ISSUES });
    }

    // Check for bariatric needs
    if (patientContext.bariatric || orderDesc.includes('BARIATRIC')) {
      patientAddition += PATIENT_MODIFIERS.BARIATRIC;
      patientModifiers.push({ factor: 'bariatric', minutes: PATIENT_MODIFIERS.BARIATRIC });
    }

    // Check for pediatric patient
    if (patientContext.pediatric) {
      patientAddition += PATIENT_MODIFIERS.PEDIATRIC;
      patientModifiers.push({ factor: 'pediatric', minutes: PATIENT_MODIFIERS.PEDIATRIC });
    }

    // Check for elderly patient
    if (patientContext.elderly || patientContext.age >= 80) {
      patientAddition += PATIENT_MODIFIERS.ELDERLY;
      patientModifiers.push({ factor: 'elderly', minutes: PATIENT_MODIFIERS.ELDERLY });
    }

    // Check for communication needs
    if (patientContext.hearingImpaired) {
      patientAddition += PATIENT_MODIFIERS.HEARING_IMPAIRED;
      patientModifiers.push({ factor: 'hearing_impaired', minutes: PATIENT_MODIFIERS.HEARING_IMPAIRED });
    }

    if (patientContext.interpreter || patientContext.nonEnglish) {
      patientAddition += PATIENT_MODIFIERS.NON_ENGLISH;
      patientModifiers.push({ factor: 'interpreter_needed', minutes: PATIENT_MODIFIERS.NON_ENGLISH });
    }
  }

  // Calculate total
  const totalDuration = duration + patientAddition;

  const result = {
    totalDuration,
    breakdown: {
      base: baseDuration,
      afterEquipment: duration,
      equipmentModifier,
      equipmentNote,
      patientModifiers,
      patientAddition
    }
  };

  logger.debug('Duration calculated', {
    modality,
    baseDuration,
    equipmentModifier,
    patientAddition,
    totalDuration
  });

  return result;
}

/**
 * Format duration for display in SMS
 * @param {number} minutes - Duration in minutes
 * @returns {string} - Formatted string like "45 min" or "1 hr 15 min"
 */
function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${mins} min`;
}

/**
 * Get a brief equipment description for display
 * @param {Object} equipment - Equipment specs
 * @param {string} modality - Imaging modality
 * @returns {string} - Brief description like "3T" or "64-slice"
 */
function getEquipmentLabel(equipment, modality) {
  if (!equipment) return '';

  if (modality === 'MRI' && equipment.mri_field_strength) {
    let label = `${equipment.mri_field_strength}T`;
    if (equipment.mri_wide_bore) {
      label += ' Wide';
    }
    return label;
  }

  if (modality === 'CT' && equipment.ct_slice_count) {
    return `${equipment.ct_slice_count}-slice`;
  }

  return '';
}

module.exports = {
  calculateDuration,
  formatDuration,
  getEquipmentLabel,
  DEFAULT_DURATIONS,
  EQUIPMENT_MODIFIERS,
  PATIENT_MODIFIERS
};
