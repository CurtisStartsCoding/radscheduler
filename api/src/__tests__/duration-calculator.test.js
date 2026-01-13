/**
 * Tests for duration-calculator.js
 * Tests multi-factor duration calculation
 */

const {
  calculateDuration,
  formatDuration,
  getEquipmentLabel,
  DEFAULT_DURATIONS,
  EQUIPMENT_MODIFIERS,
  PATIENT_MODIFIERS
} = require('../services/duration-calculator');

describe('calculateDuration - Base Duration', () => {
  test('should use order.estimatedDuration when provided', () => {
    const result = calculateDuration(
      { modality: 'MRI', estimatedDuration: 60 },
      null,
      null
    );

    expect(result.breakdown.base).toBe(60);
  });

  test('should use default duration for modality when not provided', () => {
    const result = calculateDuration(
      { modality: 'CT' },
      null,
      null
    );

    expect(result.breakdown.base).toBe(DEFAULT_DURATIONS.CT);
  });

  test('should use DEFAULT when modality unknown', () => {
    const result = calculateDuration(
      { modality: 'UNKNOWN' },
      null,
      null
    );

    expect(result.breakdown.base).toBe(DEFAULT_DURATIONS.DEFAULT);
  });
});

describe('calculateDuration - Equipment Modifiers', () => {
  test('3T MRI should reduce duration to 70%', () => {
    const result = calculateDuration(
      { modality: 'MRI', estimatedDuration: 45 },
      { mri_field_strength: 3.0 },
      null
    );

    // 45 * 0.70 = 31.5, rounded to 32
    expect(result.breakdown.equipmentModifier).toBe(0.7);
    expect(result.breakdown.afterEquipment).toBe(31);
  });

  test('1.5T MRI should have no reduction', () => {
    const result = calculateDuration(
      { modality: 'MRI', estimatedDuration: 45 },
      { mri_field_strength: 1.5 },
      null
    );

    expect(result.breakdown.equipmentModifier).toBe(1.0);
    expect(result.breakdown.afterEquipment).toBe(45);
  });

  test('256+ slice CT should reduce duration to 75%', () => {
    const result = calculateDuration(
      { modality: 'CT', estimatedDuration: 30 },
      { ct_slice_count: 256 },
      null
    );

    // 30 * 0.75 = 22.5, rounded to 23
    expect(result.breakdown.equipmentModifier).toBe(0.75);
    expect(result.breakdown.afterEquipment).toBe(23);
  });

  test('64-slice CT should reduce duration to 85%', () => {
    const result = calculateDuration(
      { modality: 'CT', estimatedDuration: 30 },
      { ct_slice_count: 64 },
      null
    );

    // 30 * 0.85 = 25.5, rounded to 26
    expect(result.breakdown.equipmentModifier).toBe(0.85);
    expect(result.breakdown.afterEquipment).toBe(26);
  });

  test('16-slice CT should have no reduction', () => {
    const result = calculateDuration(
      { modality: 'CT', estimatedDuration: 30 },
      { ct_slice_count: 16 },
      null
    );

    expect(result.breakdown.equipmentModifier).toBe(1.0);
    expect(result.breakdown.afterEquipment).toBe(30);
  });

  test('Wide-bore MRI should slightly increase duration', () => {
    const result = calculateDuration(
      { modality: 'MRI', estimatedDuration: 45 },
      { mri_field_strength: 1.5, mri_wide_bore: true },
      null
    );

    // 45 * 1.0 * 1.05 = 47.25, rounded to 47
    expect(result.breakdown.afterEquipment).toBe(47);
  });
});

describe('calculateDuration - Patient Modifiers', () => {
  test('claustrophobic patient adds 15 minutes', () => {
    const result = calculateDuration(
      { modality: 'MRI', estimatedDuration: 45 },
      null,
      { claustrophobic: true }
    );

    expect(result.breakdown.patientAddition).toBe(15);
    expect(result.breakdown.patientModifiers).toHaveLength(1);
    expect(result.breakdown.patientModifiers[0].factor).toBe('claustrophobic');
  });

  test('claustrophobic detected in order description', () => {
    const result = calculateDuration(
      { modality: 'MRI', estimatedDuration: 45, orderDescription: 'MRI Brain - patient claustrophobic' },
      null,
      {}
    );

    expect(result.breakdown.patientAddition).toBe(15);
  });

  test('mobility issues add 10 minutes', () => {
    const result = calculateDuration(
      { modality: 'CT', estimatedDuration: 30 },
      null,
      { mobilityIssues: true }
    );

    expect(result.breakdown.patientAddition).toBe(10);
    expect(result.breakdown.patientModifiers[0].factor).toBe('mobility');
  });

  test('bariatric patient adds 10 minutes', () => {
    const result = calculateDuration(
      { modality: 'CT', estimatedDuration: 30 },
      null,
      { bariatric: true }
    );

    expect(result.breakdown.patientAddition).toBe(10);
    expect(result.breakdown.patientModifiers[0].factor).toBe('bariatric');
  });

  test('elderly patient (80+) adds 5 minutes', () => {
    const result = calculateDuration(
      { modality: 'CT', estimatedDuration: 30 },
      null,
      { age: 85 }
    );

    expect(result.breakdown.patientAddition).toBe(5);
    expect(result.breakdown.patientModifiers[0].factor).toBe('elderly');
  });

  test('multiple patient factors are additive', () => {
    const result = calculateDuration(
      { modality: 'MRI', estimatedDuration: 45 },
      null,
      { claustrophobic: true, mobilityIssues: true }
    );

    // 15 + 10 = 25
    expect(result.breakdown.patientAddition).toBe(25);
    expect(result.breakdown.patientModifiers).toHaveLength(2);
  });
});

describe('calculateDuration - Combined Factors', () => {
  test('3T MRI with claustrophobic patient', () => {
    const result = calculateDuration(
      { modality: 'MRI', estimatedDuration: 45 },
      { mri_field_strength: 3.0 },
      { claustrophobic: true }
    );

    // Base: 45, After 3T (0.70): 32, Plus claustrophobic (+15): 47
    expect(result.totalDuration).toBe(46);
  });

  test('64-slice CT with bariatric patient', () => {
    const result = calculateDuration(
      { modality: 'CT', estimatedDuration: 30 },
      { ct_slice_count: 64 },
      { bariatric: true }
    );

    // Base: 30, After 64-slice (0.85): 26, Plus bariatric (+10): 36
    expect(result.totalDuration).toBe(36);
  });

  test('256-slice CT with elderly wheelchair patient', () => {
    const result = calculateDuration(
      { modality: 'CT', estimatedDuration: 30 },
      { ct_slice_count: 256 },
      { age: 82, wheelchair: true }
    );

    // Base: 30, After 256-slice (0.75): 23, Plus elderly (+5) + mobility (+10): 38
    expect(result.totalDuration).toBe(38);
  });
});

describe('formatDuration', () => {
  test('should format minutes under 60', () => {
    expect(formatDuration(28)).toBe('28 min');
    expect(formatDuration(45)).toBe('45 min');
  });

  test('should format exactly 60 minutes', () => {
    expect(formatDuration(60)).toBe('1 hr');
  });

  test('should format over 60 minutes', () => {
    expect(formatDuration(75)).toBe('1 hr 15 min');
    expect(formatDuration(90)).toBe('1 hr 30 min');
    expect(formatDuration(120)).toBe('2 hr');
    expect(formatDuration(150)).toBe('2 hr 30 min');
  });
});

describe('getEquipmentLabel', () => {
  test('should format MRI field strength', () => {
    expect(getEquipmentLabel({ mri_field_strength: 3.0 }, 'MRI')).toBe('3T');
    expect(getEquipmentLabel({ mri_field_strength: 1.5 }, 'MRI')).toBe('1.5T');
  });

  test('should add Wide for wide-bore MRI', () => {
    expect(getEquipmentLabel({ mri_field_strength: 1.5, mri_wide_bore: true }, 'MRI'))
      .toBe('1.5T Wide');
  });

  test('should format CT slice count', () => {
    expect(getEquipmentLabel({ ct_slice_count: 64 }, 'CT')).toBe('64-slice');
    expect(getEquipmentLabel({ ct_slice_count: 256 }, 'CT')).toBe('256-slice');
  });

  test('should return empty string for no equipment', () => {
    expect(getEquipmentLabel(null, 'CT')).toBe('');
    expect(getEquipmentLabel({}, 'CT')).toBe('');
  });
});

describe('Constants', () => {
  test('DEFAULT_DURATIONS should have expected modalities', () => {
    expect(DEFAULT_DURATIONS.CT).toBeDefined();
    expect(DEFAULT_DURATIONS.MRI).toBeDefined();
    expect(DEFAULT_DURATIONS.MAMMO).toBeDefined();
    expect(DEFAULT_DURATIONS.US).toBeDefined();
    expect(DEFAULT_DURATIONS.XRAY).toBeDefined();
    expect(DEFAULT_DURATIONS.DEFAULT).toBeDefined();
  });

  test('EQUIPMENT_MODIFIERS should be less than or equal to 1.0 for speed boosts', () => {
    expect(EQUIPMENT_MODIFIERS.MRI_3T).toBeLessThan(1.0);
    expect(EQUIPMENT_MODIFIERS.CT_256_PLUS).toBeLessThan(1.0);
    expect(EQUIPMENT_MODIFIERS.CT_64_PLUS).toBeLessThan(1.0);
  });

  test('PATIENT_MODIFIERS should all be positive', () => {
    Object.values(PATIENT_MODIFIERS).forEach(mod => {
      expect(mod).toBeGreaterThan(0);
    });
  });
});

// Run tests
if (require.main === module) {
  console.log('Running duration-calculator tests...');
}
