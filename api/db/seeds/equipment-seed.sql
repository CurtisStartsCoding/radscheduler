-- Equipment Seed Data for Intelligent Scheduling
-- Provides realistic test data for equipment-based location filtering

-- Clear existing data (for re-running seed)
DELETE FROM scheduling_equipment;
DELETE FROM scheduling_locations;

-- Insert test locations
INSERT INTO scheduling_locations (location_id, name, address, city, state, zip, phone, timezone, active)
VALUES
  ('LOC-001', 'Downtown Imaging Center', '123 Main Street', 'Springfield', 'IL', '62701', '(217) 555-0100', 'America/Chicago', TRUE),
  ('LOC-002', 'Northside Clinic', '456 Oak Avenue', 'Springfield', 'IL', '62702', '(217) 555-0200', 'America/Chicago', TRUE),
  ('LOC-003', 'Regional Medical Center', '789 Hospital Drive', 'Springfield', 'IL', '62703', '(217) 555-0300', 'America/Chicago', TRUE),
  ('LOC-004', 'Eastside Imaging', '321 River Road', 'Springfield', 'IL', '62704', '(217) 555-0400', 'America/Chicago', TRUE);

-- Downtown Imaging Center: High-end equipment
-- 3T MRI, 64-slice CT with contrast injector, 3D mammography
INSERT INTO scheduling_equipment (location_id, equipment_id, equipment_type, manufacturer, model,
  ct_slice_count, ct_has_cardiac, ct_has_contrast_injector, ct_dual_energy,
  mri_field_strength, mri_bore_width_cm, mri_has_cardiac, mri_wide_bore,
  mammo_3d_tomo, mammo_stereo_biopsy,
  max_patient_weight_kg, has_bariatric_table, active)
VALUES
  -- CT Scanner - 64-slice with cardiac capability
  ('LOC-001', 'EQUIP-001-CT', 'CT', 'GE Healthcare', 'Revolution CT',
   64, TRUE, TRUE, FALSE,
   NULL, NULL, NULL, NULL,
   NULL, NULL,
   200, FALSE, TRUE),
  -- MRI Scanner - 3T high-field
  ('LOC-001', 'EQUIP-001-MRI', 'MRI', 'Siemens', 'MAGNETOM Vida 3T',
   NULL, NULL, NULL, NULL,
   3.0, 60, TRUE, FALSE,
   NULL, NULL,
   200, FALSE, TRUE),
  -- Mammography - 3D with biopsy
  ('LOC-001', 'EQUIP-001-MAMMO', 'MAMMO', 'Hologic', 'Selenia Dimensions',
   NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   TRUE, TRUE,
   NULL, NULL, TRUE);

-- Northside Clinic: Wide-bore MRI, basic CT
-- 1.5T wide-bore MRI (for claustrophobic/bariatric), 16-slice CT
INSERT INTO scheduling_equipment (location_id, equipment_id, equipment_type, manufacturer, model,
  ct_slice_count, ct_has_cardiac, ct_has_contrast_injector, ct_dual_energy,
  mri_field_strength, mri_bore_width_cm, mri_has_cardiac, mri_wide_bore,
  mammo_3d_tomo, mammo_stereo_biopsy,
  max_patient_weight_kg, has_bariatric_table, active)
VALUES
  -- CT Scanner - Basic 16-slice
  ('LOC-002', 'EQUIP-002-CT', 'CT', 'Philips', 'Brilliance 16',
   16, FALSE, FALSE, FALSE,
   NULL, NULL, NULL, NULL,
   NULL, NULL,
   180, FALSE, TRUE),
  -- MRI Scanner - 1.5T Wide-bore for bariatric/claustrophobic
  ('LOC-002', 'EQUIP-002-MRI', 'MRI', 'Siemens', 'MAGNETOM Espree 1.5T',
   NULL, NULL, NULL, NULL,
   1.5, 70, FALSE, TRUE,
   NULL, NULL,
   250, TRUE, TRUE);

-- Regional Medical Center: Full-service hospital
-- 256-slice CT with dual-energy, 3T MRI with cardiac, comprehensive equipment
INSERT INTO scheduling_equipment (location_id, equipment_id, equipment_type, manufacturer, model,
  ct_slice_count, ct_has_cardiac, ct_has_contrast_injector, ct_dual_energy,
  mri_field_strength, mri_bore_width_cm, mri_has_cardiac, mri_wide_bore,
  mammo_3d_tomo, mammo_stereo_biopsy,
  max_patient_weight_kg, has_bariatric_table, active)
VALUES
  -- CT Scanner - 256-slice with everything
  ('LOC-003', 'EQUIP-003-CT', 'CT', 'Canon Medical', 'Aquilion ONE GENESIS',
   256, TRUE, TRUE, TRUE,
   NULL, NULL, NULL, NULL,
   NULL, NULL,
   227, TRUE, TRUE),
  -- MRI Scanner - 3T with cardiac capability
  ('LOC-003', 'EQUIP-003-MRI', 'MRI', 'GE Healthcare', 'SIGNA Premier 3T',
   NULL, NULL, NULL, NULL,
   3.0, 60, TRUE, FALSE,
   NULL, NULL,
   227, FALSE, TRUE),
  -- Mammography - 3D tomo only (no biopsy)
  ('LOC-003', 'EQUIP-003-MAMMO', 'MAMMO', 'GE Healthcare', 'Senographe Pristina',
   NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   TRUE, FALSE,
   NULL, NULL, TRUE);

-- Eastside Imaging: Budget location
-- Basic CT with contrast injector, 1.5T MRI, 2D mammography
INSERT INTO scheduling_equipment (location_id, equipment_id, equipment_type, manufacturer, model,
  ct_slice_count, ct_has_cardiac, ct_has_contrast_injector, ct_dual_energy,
  mri_field_strength, mri_bore_width_cm, mri_has_cardiac, mri_wide_bore,
  mammo_3d_tomo, mammo_stereo_biopsy,
  max_patient_weight_kg, has_bariatric_table, active)
VALUES
  -- CT Scanner - 40-slice with contrast
  ('LOC-004', 'EQUIP-004-CT', 'CT', 'Philips', 'Ingenuity CT',
   40, FALSE, TRUE, FALSE,
   NULL, NULL, NULL, NULL,
   NULL, NULL,
   200, FALSE, TRUE),
  -- MRI Scanner - Standard 1.5T
  ('LOC-004', 'EQUIP-004-MRI', 'MRI', 'Philips', 'Ingenia 1.5T',
   NULL, NULL, NULL, NULL,
   1.5, 60, FALSE, FALSE,
   NULL, NULL,
   200, FALSE, TRUE),
  -- Mammography - 2D only
  ('LOC-004', 'EQUIP-004-MAMMO', 'MAMMO', 'Fujifilm', 'ASPIRE Cristalle',
   NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL,
   FALSE, FALSE,
   NULL, NULL, TRUE);

-- Verify seed data
SELECT 'Locations inserted:' AS info, COUNT(*) AS count FROM scheduling_locations;
SELECT 'Equipment inserted:' AS info, COUNT(*) AS count FROM scheduling_equipment;

-- Equipment summary by location
SELECT
  sl.name AS location,
  se.equipment_type,
  CASE
    WHEN se.equipment_type = 'CT' THEN se.ct_slice_count || '-slice'
    WHEN se.equipment_type = 'MRI' THEN se.mri_field_strength || 'T'
    WHEN se.equipment_type = 'MAMMO' THEN CASE WHEN se.mammo_3d_tomo THEN '3D' ELSE '2D' END
  END AS spec,
  CASE
    WHEN se.equipment_type = 'CT' AND se.ct_has_cardiac THEN 'Cardiac, '
    ELSE ''
  END ||
  CASE
    WHEN se.equipment_type = 'CT' AND se.ct_has_contrast_injector THEN 'Contrast, '
    ELSE ''
  END ||
  CASE
    WHEN se.equipment_type = 'MRI' AND se.mri_wide_bore THEN 'Wide-bore, '
    ELSE ''
  END ||
  CASE
    WHEN se.equipment_type = 'MRI' AND se.mri_has_cardiac THEN 'Cardiac, '
    ELSE ''
  END ||
  CASE
    WHEN se.has_bariatric_table THEN 'Bariatric'
    ELSE ''
  END AS capabilities
FROM scheduling_locations sl
JOIN scheduling_equipment se ON sl.location_id = se.location_id
WHERE sl.active AND se.active
ORDER BY sl.name, se.equipment_type;

/*
Expected Equipment Matrix:

| Location                  | CT           | MRI          | MAMMO         |
|---------------------------|--------------|--------------|---------------|
| Downtown Imaging Center   | 64-slice     | 3T           | 3D + Biopsy   |
|                           | Cardiac      | Cardiac      |               |
|                           | Contrast     |              |               |
|---------------------------|--------------|--------------|---------------|
| Northside Clinic          | 16-slice     | 1.5T         | -             |
|                           |              | Wide-bore    |               |
|                           |              | Bariatric    |               |
|---------------------------|--------------|--------------|---------------|
| Regional Medical Center   | 256-slice    | 3T           | 3D only       |
|                           | Cardiac      | Cardiac      |               |
|                           | Contrast     |              |               |
|                           | Dual-energy  |              |               |
|                           | Bariatric    |              |               |
|---------------------------|--------------|--------------|---------------|
| Eastside Imaging          | 40-slice     | 1.5T         | 2D only       |
|                           | Contrast     |              |               |

Expected Filtering Results:
- CT with Contrast: Downtown, Regional, Eastside
- Cardiac CT: Downtown, Regional (64+ slices with cardiac)
- CTA: Downtown, Regional (64+ slices with contrast)
- 3T MRI: Downtown, Regional
- Wide-bore MRI: Northside only
- 3D Mammography: Downtown, Regional
- Stereotactic Biopsy: Downtown only
- Bariatric patients: Northside (MRI), Regional (CT)
*/
