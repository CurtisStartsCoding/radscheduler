/**
 * Equipment Rules Service
 *
 * Rules-based engine that maps procedure descriptions to equipment requirements.
 * This enables filtering imaging locations by their capability to perform
 * specific procedures.
 */

const logger = require('../utils/logger');

/**
 * Equipment requirement rules based on order description patterns
 * Each rule defines:
 *   - pattern: RegExp to match against order description
 *   - modality: Which imaging modality this applies to
 *   - requires: Equipment capabilities needed
 */
const EQUIPMENT_RULES = {
  // CT rules
  CT_WITH_CONTRAST: {
    pattern: /WITH\s*(IV\s*)?CONTRAST|W\/?\s*CONTRAST|CONTRAST\s*ENHANCED/i,
    modality: 'CT',
    requires: { ct_has_contrast_injector: true }
  },
  CARDIAC_CT: {
    pattern: /CARDIAC|CTA\s*CORONARY|CORONARY\s*CTA|CALCIUM\s*SCORE/i,
    modality: 'CT',
    requires: { ct_has_cardiac: true, ct_slice_count: { min: 64 } }
  },
  CT_ANGIOGRAPHY: {
    pattern: /\bCTA\b|CT\s*ANGIO|ANGIOGRAPHY/i,
    modality: 'CT',
    requires: { ct_has_contrast_injector: true, ct_slice_count: { min: 64 } }
  },
  CT_DUAL_ENERGY: {
    pattern: /DUAL\s*ENERGY|DECT/i,
    modality: 'CT',
    requires: { ct_dual_energy: true }
  },

  // MRI rules
  CARDIAC_MRI: {
    pattern: /CARDIAC\s*MRI|MRI\s*HEART|MRI\s*CARDIAC|CMR/i,
    modality: 'MRI',
    requires: { mri_has_cardiac: true }
  },
  MRI_3T: {
    pattern: /3\s*T(ESLA)?|HIGH\s*FIELD/i,
    modality: 'MRI',
    requires: { mri_field_strength: { min: 3.0 } }
  },
  MRI_WIDE_BORE: {
    pattern: /WIDE\s*BORE|CLAUSTROPHOB|BARIATRIC/i,
    modality: 'MRI',
    requires: { mri_wide_bore: true }
  },

  // Mammography rules
  MAMMO_3D: {
    pattern: /3D|TOMO(SYNTHESIS)?|DBT/i,
    modality: 'MAMMO',
    requires: { mammo_3d_tomo: true }
  },
  MAMMO_BIOPSY: {
    pattern: /STEREO(TACTIC)?\s*BIOPSY/i,
    modality: 'MAMMO',
    requires: { mammo_stereo_biopsy: true }
  },

  // Bariatric/weight rules (apply to multiple modalities)
  BARIATRIC_PATIENT: {
    pattern: /BARIATRIC|WEIGHT\s*>\s*\d+|OVER\s*\d+\s*(KG|LB)/i,
    modality: '*',  // Applies to all modalities
    requires: { has_bariatric_table: true }
  }
};

/**
 * Get equipment requirements for an order based on procedure description
 * @param {Object} order - Order object with orderDescription and modality
 * @returns {Object|null} - Equipment requirements or null if no special requirements
 */
function getEquipmentRequirements(order) {
  const desc = order.orderDescription || '';
  const modality = (order.modality || '').toUpperCase();

  // Collect all matching requirements
  let requirements = null;

  for (const [ruleName, rule] of Object.entries(EQUIPMENT_RULES)) {
    // Check if rule applies to this modality
    const modalityMatches = rule.modality === '*' || rule.modality === modality;

    if (modalityMatches && rule.pattern.test(desc)) {
      if (!requirements) {
        requirements = { ruleName };
      } else {
        // Multiple rules match - combine requirements
        requirements.ruleName = `${requirements.ruleName}+${ruleName}`;
      }

      // Merge in requirements from this rule
      for (const [key, value] of Object.entries(rule.requires)) {
        if (typeof value === 'object' && value.min) {
          // For min requirements, use the highest minimum
          if (!requirements[key] || requirements[key].min < value.min) {
            requirements[key] = value;
          }
        } else {
          // Boolean requirements are additive
          requirements[key] = value;
        }
      }
    }
  }

  if (requirements) {
    logger.debug('Equipment requirements determined', {
      orderDescription: desc.substring(0, 100),
      modality,
      requirements
    });
  }

  return requirements;
}

/**
 * Build SQL WHERE clause components for equipment requirements
 * @param {Object} requirements - Equipment requirements from getEquipmentRequirements
 * @param {string} modality - The imaging modality (CT, MRI, etc.)
 * @returns {Object} - { conditions: string[], params: any[] }
 */
function buildEquipmentWhereClause(requirements, modality) {
  const conditions = ['equipment_type = $1', 'active = TRUE'];
  const params = [modality];
  let paramIndex = 2;

  if (!requirements) {
    return { conditions, params };
  }

  for (const [key, value] of Object.entries(requirements)) {
    // Skip metadata fields
    if (key === 'ruleName') continue;

    if (typeof value === 'boolean') {
      conditions.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    } else if (typeof value === 'object' && value.min !== undefined) {
      conditions.push(`${key} >= $${paramIndex}`);
      params.push(value.min);
      paramIndex++;
    }
  }

  return { conditions, params };
}

/**
 * Get human-readable description of equipment requirements
 * @param {Object} requirements - Equipment requirements object
 * @returns {string} - Human-readable description
 */
function describeRequirements(requirements) {
  if (!requirements) {
    return 'Standard equipment';
  }

  const descriptions = [];

  if (requirements.ct_has_contrast_injector) {
    descriptions.push('contrast injector');
  }
  if (requirements.ct_has_cardiac) {
    descriptions.push('cardiac CT capability');
  }
  if (requirements.ct_slice_count?.min) {
    descriptions.push(`${requirements.ct_slice_count.min}+ slice CT`);
  }
  if (requirements.ct_dual_energy) {
    descriptions.push('dual-energy CT');
  }
  if (requirements.mri_has_cardiac) {
    descriptions.push('cardiac MRI capability');
  }
  if (requirements.mri_field_strength?.min) {
    descriptions.push(`${requirements.mri_field_strength.min}T+ MRI`);
  }
  if (requirements.mri_wide_bore) {
    descriptions.push('wide-bore MRI');
  }
  if (requirements.mammo_3d_tomo) {
    descriptions.push('3D mammography');
  }
  if (requirements.mammo_stereo_biopsy) {
    descriptions.push('stereotactic biopsy');
  }
  if (requirements.has_bariatric_table) {
    descriptions.push('bariatric table');
  }

  return descriptions.length > 0 ? descriptions.join(', ') : 'Standard equipment';
}

module.exports = {
  EQUIPMENT_RULES,
  getEquipmentRequirements,
  buildEquipmentWhereClause,
  describeRequirements
};
