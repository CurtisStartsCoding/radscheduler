/**
 * Tests for equipment-rules.js
 * Tests equipment requirement rules for CT, MRI, Mammography
 */

const {
  getEquipmentRequirements,
  buildEquipmentWhereClause,
  describeRequirements,
  EQUIPMENT_RULES
} = require('../services/equipment-rules');

describe('getEquipmentRequirements - CT Rules', () => {
  test('CT with Contrast requires injector', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'CT Chest with Contrast',
      modality: 'CT'
    });

    expect(result).not.toBeNull();
    expect(result.ct_has_contrast_injector).toBe(true);
  });

  test('CT w/ contrast variations', () => {
    expect(getEquipmentRequirements({
      orderDescription: 'CT Abdomen w/ contrast',
      modality: 'CT'
    }).ct_has_contrast_injector).toBe(true);

    expect(getEquipmentRequirements({
      orderDescription: 'CT w/contrast enhanced',
      modality: 'CT'
    }).ct_has_contrast_injector).toBe(true);
  });

  test('Cardiac CT requires cardiac capability and 64+ slices', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'Cardiac CT Calcium Score',
      modality: 'CT'
    });

    expect(result.ct_has_cardiac).toBe(true);
    expect(result.ct_slice_count).toEqual({ min: 64 });
  });

  test('CTA requires injector and 64+ slices', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'CTA Head and Neck',
      modality: 'CT'
    });

    expect(result.ct_has_contrast_injector).toBe(true);
    expect(result.ct_slice_count).toEqual({ min: 64 });
  });

  test('Basic CT has no special requirements', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'CT Head without Contrast',
      modality: 'CT'
    });

    expect(result).toBeNull();
  });
});

describe('getEquipmentRequirements - MRI Rules', () => {
  test('Cardiac MRI requires cardiac capability', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'Cardiac MRI',
      modality: 'MRI'
    });

    expect(result.mri_has_cardiac).toBe(true);
  });

  test('3T MRI requires field strength >= 3.0', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'MRI Brain 3T',
      modality: 'MRI'
    });

    expect(result.mri_field_strength).toEqual({ min: 3.0 });
  });

  test('Claustrophobic patient requires wide-bore', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'MRI Lumbar - patient is claustrophobic',
      modality: 'MRI'
    });

    expect(result.mri_wide_bore).toBe(true);
  });

  test('Bariatric patient requires wide-bore', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'MRI Abdomen - bariatric patient',
      modality: 'MRI'
    });

    expect(result.mri_wide_bore).toBe(true);
  });

  test('Basic MRI has no special requirements', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'MRI Brain',
      modality: 'MRI'
    });

    expect(result).toBeNull();
  });
});

describe('getEquipmentRequirements - Mammography Rules', () => {
  test('3D Mammography requires tomosynthesis', () => {
    const result = getEquipmentRequirements({
      orderDescription: '3D Mammogram Screening',
      modality: 'MAMMO'
    });

    expect(result.mammo_3d_tomo).toBe(true);
  });

  test('Tomosynthesis mammography', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'Mammography with Tomosynthesis',
      modality: 'MAMMO'
    });

    expect(result.mammo_3d_tomo).toBe(true);
  });

  test('Stereotactic biopsy requires biopsy capability', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'Stereotactic Biopsy',
      modality: 'MAMMO'
    });

    expect(result.mammo_stereo_biopsy).toBe(true);
  });
});

describe('buildEquipmentWhereClause', () => {
  test('should build basic WHERE clause', () => {
    const { conditions, params } = buildEquipmentWhereClause(null, 'CT');

    expect(conditions).toContain('equipment_type = $1');
    expect(conditions).toContain('active = TRUE');
    expect(params).toEqual(['CT']);
  });

  test('should add boolean requirements', () => {
    const requirements = { ct_has_contrast_injector: true };
    const { conditions, params } = buildEquipmentWhereClause(requirements, 'CT');

    expect(conditions).toContain('ct_has_contrast_injector = $2');
    expect(params).toContain(true);
  });

  test('should add min requirements', () => {
    const requirements = { ct_slice_count: { min: 64 } };
    const { conditions, params } = buildEquipmentWhereClause(requirements, 'CT');

    expect(conditions.some(c => c.includes('ct_slice_count >= '))).toBe(true);
    expect(params).toContain(64);
  });

  test('should combine multiple requirements', () => {
    const requirements = {
      ct_has_contrast_injector: true,
      ct_slice_count: { min: 64 },
      ct_has_cardiac: true
    };
    const { conditions, params } = buildEquipmentWhereClause(requirements, 'CT');

    expect(params.length).toBe(4); // modality + 3 requirements
  });
});

describe('describeRequirements', () => {
  test('should describe standard equipment for null', () => {
    expect(describeRequirements(null)).toBe('Standard equipment');
  });

  test('should describe contrast injector', () => {
    expect(describeRequirements({ ct_has_contrast_injector: true }))
      .toContain('contrast injector');
  });

  test('should describe slice count', () => {
    expect(describeRequirements({ ct_slice_count: { min: 64 } }))
      .toContain('64+ slice CT');
  });

  test('should describe MRI field strength', () => {
    expect(describeRequirements({ mri_field_strength: { min: 3.0 } }))
      .toContain('3T+ MRI');
  });

  test('should describe wide-bore MRI', () => {
    expect(describeRequirements({ mri_wide_bore: true }))
      .toContain('wide-bore MRI');
  });

  test('should combine multiple descriptions', () => {
    const desc = describeRequirements({
      ct_has_contrast_injector: true,
      ct_slice_count: { min: 64 }
    });

    expect(desc).toContain('contrast injector');
    expect(desc).toContain('64+ slice CT');
  });
});

describe('Modality Matching', () => {
  test('should not match CT rules for MRI', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'CT with Contrast',
      modality: 'MRI'  // Wrong modality
    });

    expect(result).toBeNull();
  });

  test('should not match MRI rules for CT', () => {
    const result = getEquipmentRequirements({
      orderDescription: 'MRI Brain 3T',
      modality: 'CT'  // Wrong modality
    });

    expect(result).toBeNull();
  });
});

// Run tests
if (require.main === module) {
  console.log('Running equipment-rules tests...');
}
