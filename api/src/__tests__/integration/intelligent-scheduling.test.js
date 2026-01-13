/**
 * Integration Tests for Intelligent Scheduling
 *
 * Tests the complete flow from webhook to SMS with safety and equipment filtering.
 * These tests verify the integration of all scheduling components:
 *   - Scheduling Safety Service
 *   - Equipment Rules Service
 *   - Equipment Service (database queries)
 *   - Duration Calculator
 *   - SMS Conversation Service
 *
 * NOTE: These tests require database connectivity for full integration testing.
 * Without a database, they document expected behavior and test non-DB components.
 */

const { checkSchedulingSafety, formatSafetyMessages } = require('../../services/scheduling-safety');
const { getEquipmentRequirements, buildEquipmentWhereClause, describeRequirements } = require('../../services/equipment-rules');
const { calculateDuration, formatDuration, getEquipmentLabel } = require('../../services/duration-calculator');

// Test data simulating real order scenarios
const TEST_ORDERS = {
  // Order with severe contrast allergy - should BLOCK
  SEVERE_ALLERGY: {
    orderId: 'INT-001',
    orderDescription: 'CT Abdomen with Contrast',
    modality: 'CT',
    patientContext: {
      allergies: [{
        allergen: 'Iodinated contrast media',
        type: 'MC',
        severity: 'SV',
        reaction: 'Anaphylaxis requiring hospitalization'
      }]
    }
  },

  // Order with mild contrast allergy - should WARN and continue
  MILD_ALLERGY: {
    orderId: 'INT-002',
    orderDescription: 'CT Chest with Contrast',
    modality: 'CT',
    patientContext: {
      allergies: [{
        allergen: 'Contrast dye',
        type: 'MC',
        severity: 'MI',
        reaction: 'Hives'
      }]
    }
  },

  // Order with low eGFR - should BLOCK
  LOW_EGFR: {
    orderId: 'INT-003',
    orderDescription: 'CTA Head and Neck',
    modality: 'CT',
    patientContext: {
      labs: [{
        name: 'eGFR',
        code: '33914-3',
        value: '22',
        units: 'mL/min/1.73m2',
        date: '2026-01-10'
      }]
    }
  },

  // Order with borderline eGFR - should WARN
  BORDERLINE_EGFR: {
    orderId: 'INT-004',
    orderDescription: 'CT with Contrast',
    modality: 'CT',
    patientContext: {
      labs: [{
        name: 'eGFR',
        code: '33914-3',
        value: '38',
        units: 'mL/min/1.73m2',
        date: '2026-01-10'
      }]
    }
  },

  // Order with recent contrast - should WARN with minScheduleDate
  RECENT_CONTRAST: {
    orderId: 'INT-005',
    orderDescription: 'CT Abdomen with Contrast',
    modality: 'CT',
    patientContext: {
      priorImaging: [{
        modality: 'CT',
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
        hadContrast: true
      }]
    }
  },

  // Cardiac CT requiring specialized equipment
  CARDIAC_CT: {
    orderId: 'INT-006',
    orderDescription: 'Cardiac CT Calcium Score',
    modality: 'CT',
    estimatedDuration: 30
  },

  // Claustrophobic patient needing wide-bore MRI
  CLAUSTROPHOBIC_MRI: {
    orderId: 'INT-007',
    orderDescription: 'MRI Lumbar Spine - patient very claustrophobic',
    modality: 'MRI',
    estimatedDuration: 45,
    patientContext: {
      claustrophobic: true
    }
  },

  // 3T MRI request
  MRI_3T: {
    orderId: 'INT-008',
    orderDescription: 'MRI Brain 3T',
    modality: 'MRI',
    estimatedDuration: 45
  },

  // Bariatric patient
  BARIATRIC_PATIENT: {
    orderId: 'INT-009',
    orderDescription: 'CT Abdomen',
    modality: 'CT',
    estimatedDuration: 30,
    patientContext: {
      bariatric: true
    }
  },

  // Stereotactic biopsy
  STEREO_BIOPSY: {
    orderId: 'INT-010',
    orderDescription: 'Stereotactic Biopsy Right Breast',
    modality: 'MAMMO'
  }
};

// Mock equipment data (matching seed data)
const MOCK_EQUIPMENT = {
  'LOC-001': { // Downtown
    CT: { ct_slice_count: 64, ct_has_cardiac: true, ct_has_contrast_injector: true },
    MRI: { mri_field_strength: 3.0, mri_has_cardiac: true, mri_wide_bore: false },
    MAMMO: { mammo_3d_tomo: true, mammo_stereo_biopsy: true }
  },
  'LOC-002': { // Northside
    CT: { ct_slice_count: 16, ct_has_cardiac: false, ct_has_contrast_injector: false },
    MRI: { mri_field_strength: 1.5, mri_has_cardiac: false, mri_wide_bore: true, has_bariatric_table: true }
  },
  'LOC-003': { // Regional
    CT: { ct_slice_count: 256, ct_has_cardiac: true, ct_has_contrast_injector: true, has_bariatric_table: true },
    MRI: { mri_field_strength: 3.0, mri_has_cardiac: true, mri_wide_bore: false },
    MAMMO: { mammo_3d_tomo: true, mammo_stereo_biopsy: false }
  },
  'LOC-004': { // Eastside
    CT: { ct_slice_count: 40, ct_has_cardiac: false, ct_has_contrast_injector: true },
    MRI: { mri_field_strength: 1.5, mri_has_cardiac: false, mri_wide_bore: false },
    MAMMO: { mammo_3d_tomo: false, mammo_stereo_biopsy: false }
  }
};

describe('Integration: Safety Checks Flow', () => {
  describe('Contrast Allergy Blocking', () => {
    test('severe contrast allergy blocks scheduling and routes to coordinator', () => {
      const order = TEST_ORDERS.SEVERE_ALLERGY;
      const safetyCheck = checkSchedulingSafety(order);

      expect(safetyCheck.canProceed).toBe(false);
      expect(safetyCheck.blocks).toHaveLength(1);
      expect(safetyCheck.blocks[0].reason).toBe('CONTRAST_ALLERGY_SEVERE');

      // In real flow, this would trigger COORDINATOR_REVIEW state
      const message = formatSafetyMessages(safetyCheck);
      expect(message).toContain('severe contrast allergy');
      expect(message).toContain('coordinator');
    });

    test('mild contrast allergy warns but allows scheduling', () => {
      const order = TEST_ORDERS.MILD_ALLERGY;
      const safetyCheck = checkSchedulingSafety(order);

      expect(safetyCheck.canProceed).toBe(true);
      expect(safetyCheck.warnings).toHaveLength(1);
      expect(safetyCheck.warnings[0].reason).toBe('CONTRAST_ALLERGY');

      // Warning message should mention pre-medication
      expect(safetyCheck.warnings[0].message).toContain('Pre-medication');
    });
  });

  describe('Renal Function Blocking', () => {
    test('eGFR < 30 blocks scheduling', () => {
      const order = TEST_ORDERS.LOW_EGFR;
      const safetyCheck = checkSchedulingSafety(order);

      expect(safetyCheck.canProceed).toBe(false);
      expect(safetyCheck.blocks[0].reason).toBe('RENAL_FUNCTION_CRITICAL');
      expect(safetyCheck.blocks[0].details.eGFR).toBe(22);
    });

    test('eGFR 30-45 warns but allows scheduling', () => {
      const order = TEST_ORDERS.BORDERLINE_EGFR;
      const safetyCheck = checkSchedulingSafety(order);

      expect(safetyCheck.canProceed).toBe(true);
      expect(safetyCheck.warnings.some(w => w.reason === 'RENAL_FUNCTION_LOW')).toBe(true);
    });
  });

  describe('Recent Contrast Warning with MinScheduleDate', () => {
    test('contrast within 7 days sets minScheduleDate', () => {
      const order = TEST_ORDERS.RECENT_CONTRAST;
      const safetyCheck = checkSchedulingSafety(order);

      expect(safetyCheck.canProceed).toBe(true);
      expect(safetyCheck.warnings.some(w => w.reason === 'RECENT_CONTRAST')).toBe(true);
      expect(safetyCheck.minScheduleDate).not.toBeNull();

      // minScheduleDate should be at least 3 days out (7 - 4 = 3)
      const minDate = new Date(safetyCheck.minScheduleDate);
      const today = new Date();
      const daysFromNow = Math.ceil((minDate - today) / (1000 * 60 * 60 * 24));
      expect(daysFromNow).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Integration: Equipment Filtering Flow', () => {
  describe('Cardiac CT Filtering', () => {
    test('cardiac CT requires 64+ slices and cardiac capability', () => {
      const order = TEST_ORDERS.CARDIAC_CT;
      const requirements = getEquipmentRequirements(order);

      expect(requirements).not.toBeNull();
      expect(requirements.ct_has_cardiac).toBe(true);
      expect(requirements.ct_slice_count).toEqual({ min: 64 });

      // Expected capable locations: Downtown (64-slice), Regional (256-slice)
      // Not capable: Northside (16-slice), Eastside (40-slice, no cardiac)
      const { conditions, params } = buildEquipmentWhereClause(requirements, 'CT');
      expect(conditions.some(c => c.includes('ct_has_cardiac'))).toBe(true);
      expect(conditions.some(c => c.includes('ct_slice_count'))).toBe(true);
    });
  });

  describe('Wide-Bore MRI Filtering', () => {
    test('claustrophobic patient requires wide-bore MRI', () => {
      const order = TEST_ORDERS.CLAUSTROPHOBIC_MRI;
      const requirements = getEquipmentRequirements(order);

      expect(requirements).not.toBeNull();
      expect(requirements.mri_wide_bore).toBe(true);

      // Expected capable location: Northside only
      const description = describeRequirements(requirements);
      expect(description).toContain('wide-bore MRI');
    });
  });

  describe('3T MRI Filtering', () => {
    test('3T MRI requires field strength >= 3.0', () => {
      const order = TEST_ORDERS.MRI_3T;
      const requirements = getEquipmentRequirements(order);

      expect(requirements).not.toBeNull();
      expect(requirements.mri_field_strength).toEqual({ min: 3.0 });

      // Expected capable locations: Downtown (3T), Regional (3T)
      // Not capable: Northside (1.5T), Eastside (1.5T)
    });
  });

  describe('Stereotactic Biopsy Filtering', () => {
    test('stereotactic biopsy requires specific capability', () => {
      const order = TEST_ORDERS.STEREO_BIOPSY;
      const requirements = getEquipmentRequirements(order);

      expect(requirements).not.toBeNull();
      expect(requirements.mammo_stereo_biopsy).toBe(true);

      // Expected capable location: Downtown only
    });
  });
});

describe('Integration: Duration Calculation Flow', () => {
  describe('Equipment-Based Duration', () => {
    test('3T MRI is faster than 1.5T MRI', () => {
      const order = TEST_ORDERS.MRI_3T;

      const duration3T = calculateDuration(order, MOCK_EQUIPMENT['LOC-001'].MRI, null);
      const duration1_5T = calculateDuration(order, MOCK_EQUIPMENT['LOC-002'].MRI, null);

      expect(duration3T.totalDuration).toBeLessThan(duration1_5T.totalDuration);

      // 3T should be about 70% of base time
      expect(duration3T.breakdown.equipmentModifier).toBe(0.7);
    });

    test('256-slice CT is faster than 64-slice CT', () => {
      const order = TEST_ORDERS.CARDIAC_CT;

      const duration256 = calculateDuration(order, MOCK_EQUIPMENT['LOC-003'].CT, null);
      const duration64 = calculateDuration(order, MOCK_EQUIPMENT['LOC-001'].CT, null);

      expect(duration256.totalDuration).toBeLessThan(duration64.totalDuration);
    });
  });

  describe('Patient Factor Duration', () => {
    test('claustrophobic patient adds time to MRI', () => {
      const order = TEST_ORDERS.CLAUSTROPHOBIC_MRI;

      const durationWithPatientContext = calculateDuration(
        order,
        MOCK_EQUIPMENT['LOC-002'].MRI,
        order.patientContext
      );

      const durationWithoutPatientContext = calculateDuration(
        order,
        MOCK_EQUIPMENT['LOC-002'].MRI,
        null
      );

      expect(durationWithPatientContext.totalDuration).toBeGreaterThan(
        durationWithoutPatientContext.totalDuration
      );
      expect(durationWithPatientContext.breakdown.patientAddition).toBe(15);
    });

    test('bariatric patient adds time', () => {
      const order = TEST_ORDERS.BARIATRIC_PATIENT;

      const duration = calculateDuration(
        order,
        MOCK_EQUIPMENT['LOC-003'].CT, // Bariatric-capable
        order.patientContext
      );

      expect(duration.breakdown.patientAddition).toBe(10);
      expect(duration.breakdown.patientModifiers[0].factor).toBe('bariatric');
    });
  });

  describe('Location Display Format', () => {
    test('equipment labels display correctly', () => {
      expect(getEquipmentLabel(MOCK_EQUIPMENT['LOC-001'].MRI, 'MRI')).toBe('3T');
      expect(getEquipmentLabel(MOCK_EQUIPMENT['LOC-002'].MRI, 'MRI')).toBe('1.5T Wide');
      expect(getEquipmentLabel(MOCK_EQUIPMENT['LOC-001'].CT, 'CT')).toBe('64-slice');
      expect(getEquipmentLabel(MOCK_EQUIPMENT['LOC-003'].CT, 'CT')).toBe('256-slice');
    });

    test('duration formats correctly for SMS', () => {
      expect(formatDuration(28)).toBe('28 min');
      expect(formatDuration(45)).toBe('45 min');
      expect(formatDuration(60)).toBe('1 hr');
      expect(formatDuration(90)).toBe('1 hr 30 min');
    });
  });
});

describe('Integration: Complete Workflow Scenarios', () => {
  describe('Scenario: Patient with severe allergy for CT contrast study', () => {
    test('should block and route to coordinator review', () => {
      const order = TEST_ORDERS.SEVERE_ALLERGY;

      // 1. Safety check
      const safety = checkSchedulingSafety(order);
      expect(safety.canProceed).toBe(false);

      // 2. Should not proceed to equipment filtering
      // In real flow, conversation would transition to COORDINATOR_REVIEW

      // 3. Verify block message is appropriate
      expect(safety.blocks[0].message).toContain('coordinator');
    });
  });

  describe('Scenario: CTA for patient with recent contrast', () => {
    test('should warn about recent contrast and filter to capable locations', () => {
      // CTA requires contrast, so recent contrast warning should apply
      const order = {
        orderId: 'INT-COMBO',
        orderDescription: 'CTA Chest',  // CTA requires contrast
        modality: 'CT',
        estimatedDuration: 30,
        patientContext: TEST_ORDERS.RECENT_CONTRAST.patientContext
      };

      // 1. Safety check - should proceed with warning (CTA requires contrast)
      const safety = checkSchedulingSafety(order);
      expect(safety.canProceed).toBe(true);
      expect(safety.warnings.length).toBeGreaterThan(0);
      expect(safety.warnings.some(w => w.reason === 'RECENT_CONTRAST')).toBe(true);
      expect(safety.minScheduleDate).not.toBeNull();

      // 2. Equipment requirements (CTA requires 64+ slices + contrast injector)
      const requirements = getEquipmentRequirements(order);
      expect(requirements.ct_has_contrast_injector).toBe(true);
      expect(requirements.ct_slice_count.min).toBe(64);

      // 3. Would filter to Downtown and Regional only (both have 64+ slice CT with injector)
    });
  });

  describe('Scenario: Claustrophobic MRI patient with mild allergy', () => {
    test('should warn about allergy and filter to wide-bore locations', () => {
      const order = {
        ...TEST_ORDERS.CLAUSTROPHOBIC_MRI,
        orderDescription: 'MRI Brain with Contrast - claustrophobic',
        patientContext: {
          ...TEST_ORDERS.CLAUSTROPHOBIC_MRI.patientContext,
          allergies: [{
            allergen: 'Gadolinium',
            type: 'MC',
            severity: 'MI',
            reaction: 'Itching'
          }]
        }
      };

      // 1. Safety check
      const safety = checkSchedulingSafety(order);
      expect(safety.canProceed).toBe(true);
      expect(safety.warnings.some(w => w.reason === 'CONTRAST_ALLERGY')).toBe(true);

      // 2. Equipment requirements
      const requirements = getEquipmentRequirements(order);
      expect(requirements.mri_wide_bore).toBe(true);

      // 3. Duration calculation at Northside (wide-bore)
      const duration = calculateDuration(
        order,
        MOCK_EQUIPMENT['LOC-002'].MRI,
        order.patientContext
      );

      // Wide-bore (1.05x) + claustrophobic (+15min)
      expect(duration.breakdown.patientAddition).toBe(15);
    });
  });
});

// Run integration tests
if (require.main === module) {
  console.log('Running intelligent scheduling integration tests...');
}
