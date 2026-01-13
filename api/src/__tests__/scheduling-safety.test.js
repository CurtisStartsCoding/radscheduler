/**
 * Tests for scheduling-safety.js
 * Tests safety checks for contrast allergies, renal function, and recent contrast
 */

const {
  checkSchedulingSafety,
  orderRequiresContrast,
  daysSince,
  addDays
} = require('../services/scheduling-safety');

describe('orderRequiresContrast', () => {
  test('should detect "WITH CONTRAST"', () => {
    expect(orderRequiresContrast({ orderDescription: 'CT Chest with Contrast' })).toBe(true);
    expect(orderRequiresContrast({ orderDescription: 'CT Chest WITH IV CONTRAST' })).toBe(true);
  });

  test('should detect "W/ CONTRAST" variations', () => {
    expect(orderRequiresContrast({ orderDescription: 'CT Abdomen w/ contrast' })).toBe(true);
    expect(orderRequiresContrast({ orderDescription: 'CT Pelvis w/contrast' })).toBe(true);
  });

  test('should detect CTA (always requires contrast)', () => {
    expect(orderRequiresContrast({ orderDescription: 'CTA Head and Neck' })).toBe(true);
    expect(orderRequiresContrast({ orderDescription: 'CT Angiography Chest' })).toBe(true);
  });

  test('should detect MRA', () => {
    expect(orderRequiresContrast({ orderDescription: 'MRA Brain' })).toBe(true);
  });

  test('should return false for non-contrast studies', () => {
    expect(orderRequiresContrast({ orderDescription: 'CT Head without Contrast' })).toBe(false);
    expect(orderRequiresContrast({ orderDescription: 'MRI Brain' })).toBe(false);
    expect(orderRequiresContrast({ orderDescription: 'X-Ray Chest' })).toBe(false);
  });

  test('should handle "WITHOUT CONTRAST" override', () => {
    expect(orderRequiresContrast({ orderDescription: 'CT Abdomen without contrast' })).toBe(false);
    expect(orderRequiresContrast({ orderDescription: 'CT Chest W/O Contrast' })).toBe(false);
  });
});

describe('checkSchedulingSafety - Contrast Allergies', () => {
  test('should block severe contrast allergy', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-001',
      orderDescription: 'CT Abdomen with Contrast',
      patientContext: {
        allergies: [{
          allergen: 'Iodinated contrast',
          type: 'MC',
          severity: 'SV',
          reaction: 'Anaphylaxis'
        }]
      }
    });

    expect(result.canProceed).toBe(false);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].reason).toBe('CONTRAST_ALLERGY_SEVERE');
  });

  test('should warn for mild contrast allergy', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-002',
      orderDescription: 'CT Chest with Contrast',
      patientContext: {
        allergies: [{
          allergen: 'Contrast dye',
          type: 'MC',
          severity: 'MI',
          reaction: 'Hives'
        }]
      }
    });

    expect(result.canProceed).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe('CONTRAST_ALLERGY');
  });

  test('should warn for moderate contrast allergy', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-003',
      orderDescription: 'CT with Contrast',
      patientContext: {
        allergies: [{
          allergen: 'Iodine',
          severity: 'MO'
        }]
      }
    });

    expect(result.canProceed).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].reason).toBe('CONTRAST_ALLERGY');
  });

  test('should not flag allergy for non-contrast study', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-004',
      orderDescription: 'CT Head without Contrast',
      patientContext: {
        allergies: [{
          allergen: 'Iodinated contrast',
          type: 'MC',
          severity: 'SV'
        }]
      }
    });

    expect(result.canProceed).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
  });
});

describe('checkSchedulingSafety - Renal Function', () => {
  test('should block eGFR < 30', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-005',
      orderDescription: 'CT with Contrast',
      patientContext: {
        labs: [{
          name: 'eGFR',
          code: '33914-3',
          value: '25',
          date: '2026-01-10'
        }]
      }
    });

    expect(result.canProceed).toBe(false);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].reason).toBe('RENAL_FUNCTION_CRITICAL');
  });

  test('should warn for eGFR 30-45', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-006',
      orderDescription: 'CT with Contrast',
      patientContext: {
        labs: [{
          name: 'eGFR',
          code: '33914-3',
          value: '40',
          date: '2026-01-10'
        }]
      }
    });

    expect(result.canProceed).toBe(true);
    expect(result.warnings.some(w => w.reason === 'RENAL_FUNCTION_LOW')).toBe(true);
  });

  test('should not flag normal eGFR', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-007',
      orderDescription: 'CT with Contrast',
      patientContext: {
        labs: [{
          name: 'eGFR',
          value: '85',
          date: '2026-01-10'
        }]
      }
    });

    expect(result.canProceed).toBe(true);
    expect(result.warnings.filter(w => w.reason.includes('RENAL'))).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
  });
});

describe('checkSchedulingSafety - Recent Contrast', () => {
  test('should warn for contrast < 7 days ago', () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const result = checkSchedulingSafety({
      orderId: 'TEST-008',
      orderDescription: 'CT Abdomen with Contrast',
      patientContext: {
        priorImaging: [{
          modality: 'CT',
          date: threeDaysAgo.toISOString(),
          hadContrast: true
        }]
      }
    });

    expect(result.canProceed).toBe(true);
    expect(result.warnings.some(w => w.reason === 'RECENT_CONTRAST')).toBe(true);
    expect(result.minScheduleDate).not.toBeNull();
  });

  test('should set minScheduleDate to 7 days after prior contrast', () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const result = checkSchedulingSafety({
      orderId: 'TEST-009',
      orderDescription: 'CT with Contrast',
      patientContext: {
        priorImaging: [{
          modality: 'CT',
          date: fiveDaysAgo.toISOString(),
          hadContrast: true
        }]
      }
    });

    // Should be at least 2 days from now (7 - 5 = 2)
    const minDate = new Date(result.minScheduleDate);
    const today = new Date();
    const daysDiff = Math.ceil((minDate - today) / (1000 * 60 * 60 * 24));

    expect(daysDiff).toBeGreaterThanOrEqual(1);
  });

  test('should not flag contrast > 7 days ago', () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const result = checkSchedulingSafety({
      orderId: 'TEST-010',
      orderDescription: 'CT with Contrast',
      patientContext: {
        priorImaging: [{
          modality: 'CT',
          date: tenDaysAgo.toISOString(),
          hadContrast: true
        }]
      }
    });

    expect(result.warnings.filter(w => w.reason === 'RECENT_CONTRAST')).toHaveLength(0);
    expect(result.minScheduleDate).toBeNull();
  });
});

describe('checkSchedulingSafety - No Patient Context', () => {
  test('should proceed when no patientContext provided', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-011',
      orderDescription: 'CT with Contrast'
    });

    expect(result.canProceed).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.blocks).toHaveLength(0);
  });

  test('should proceed with empty patientContext', () => {
    const result = checkSchedulingSafety({
      orderId: 'TEST-012',
      orderDescription: 'CT with Contrast',
      patientContext: {}
    });

    expect(result.canProceed).toBe(true);
  });
});

describe('Helper Functions', () => {
  test('daysSince should calculate correctly', () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const days = daysSince(twoDaysAgo.toISOString());
    expect(days).toBe(2);
  });

  test('addDays should add days correctly', () => {
    const today = new Date();
    const result = addDays(today, 5);

    const expected = new Date(today);
    expected.setDate(expected.getDate() + 5);

    expect(result.toDateString()).toBe(expected.toDateString());
  });
});

// Run tests
if (require.main === module) {
  const { describe: d, test: t, expect: e } = require('./test-utils');
  console.log('Running scheduling-safety tests...');
}
