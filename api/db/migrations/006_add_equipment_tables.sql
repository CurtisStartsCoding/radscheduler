-- Migration 006: Equipment capability tables for intelligent scheduling
-- These tables enable filtering locations by equipment capabilities

-- Locations with their equipment (must match RIS/Synapse location IDs)
CREATE TABLE IF NOT EXISTS scheduling_locations (
  id SERIAL PRIMARY KEY,
  location_id VARCHAR(100) UNIQUE NOT NULL,  -- Must match RIS/Synapse location ID
  name VARCHAR(255) NOT NULL,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip VARCHAR(10),
  phone VARCHAR(20),
  organization_id INTEGER,  -- FK to organizations (logical, cross-database)
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Equipment at each location with modality-specific capabilities
CREATE TABLE IF NOT EXISTS scheduling_equipment (
  id SERIAL PRIMARY KEY,
  location_id VARCHAR(100) NOT NULL REFERENCES scheduling_locations(location_id),
  equipment_id VARCHAR(100),  -- Internal equipment identifier
  equipment_type VARCHAR(50) NOT NULL,  -- CT, MRI, MAMMO, US, XRAY, FLUORO, PET
  manufacturer VARCHAR(100),
  model VARCHAR(100),

  -- CT-specific capabilities
  ct_slice_count INTEGER,
  ct_has_cardiac BOOLEAN DEFAULT FALSE,
  ct_has_contrast_injector BOOLEAN DEFAULT FALSE,
  ct_dual_energy BOOLEAN DEFAULT FALSE,

  -- MRI-specific capabilities
  mri_field_strength DECIMAL(3,1),  -- 1.5, 3.0
  mri_bore_width_cm INTEGER,  -- 60, 70 (wide-bore)
  mri_has_cardiac BOOLEAN DEFAULT FALSE,
  mri_wide_bore BOOLEAN DEFAULT FALSE,

  -- Mammography capabilities
  mammo_3d_tomo BOOLEAN DEFAULT FALSE,
  mammo_stereo_biopsy BOOLEAN DEFAULT FALSE,

  -- Ultrasound capabilities
  us_general BOOLEAN DEFAULT FALSE,
  us_obgyn BOOLEAN DEFAULT FALSE,
  us_vascular BOOLEAN DEFAULT FALSE,
  us_cardiac BOOLEAN DEFAULT FALSE,

  -- General capabilities (apply to all modalities)
  max_patient_weight_kg INTEGER,
  has_bariatric_table BOOLEAN DEFAULT FALSE,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sched_equip_location ON scheduling_equipment(location_id);
CREATE INDEX IF NOT EXISTS idx_sched_equip_type ON scheduling_equipment(equipment_type);
CREATE INDEX IF NOT EXISTS idx_sched_loc_active ON scheduling_locations(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sched_equip_ct ON scheduling_equipment(ct_slice_count, ct_has_cardiac, ct_has_contrast_injector) WHERE equipment_type = 'CT';
CREATE INDEX IF NOT EXISTS idx_sched_equip_mri ON scheduling_equipment(mri_field_strength, mri_wide_bore, mri_has_cardiac) WHERE equipment_type = 'MRI';

-- Triggers for updated_at (reuse existing function from migration 001)
DROP TRIGGER IF EXISTS update_scheduling_locations_updated_at ON scheduling_locations;
CREATE TRIGGER update_scheduling_locations_updated_at
  BEFORE UPDATE ON scheduling_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduling_equipment_updated_at ON scheduling_equipment;
CREATE TRIGGER update_scheduling_equipment_updated_at
  BEFORE UPDATE ON scheduling_equipment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE scheduling_locations IS 'Imaging locations with equipment for capability-based scheduling';
COMMENT ON TABLE scheduling_equipment IS 'Equipment specifications by location for intelligent order routing';
COMMENT ON COLUMN scheduling_equipment.ct_slice_count IS 'Number of CT slices (16, 64, 128, 256) - higher enables faster scans';
COMMENT ON COLUMN scheduling_equipment.ct_has_cardiac IS 'Capable of cardiac CT (requires 64+ slices)';
COMMENT ON COLUMN scheduling_equipment.ct_has_contrast_injector IS 'Has automated contrast injector for contrast studies';
COMMENT ON COLUMN scheduling_equipment.mri_field_strength IS 'Magnet strength in Tesla (1.5, 3.0)';
COMMENT ON COLUMN scheduling_equipment.mri_wide_bore IS 'Wide-bore MRI for claustrophobic/bariatric patients (70cm+)';
COMMENT ON COLUMN scheduling_equipment.mri_has_cardiac IS 'Capable of cardiac MRI sequences';
COMMENT ON COLUMN scheduling_equipment.max_patient_weight_kg IS 'Maximum patient weight supported by table';
COMMENT ON COLUMN scheduling_equipment.has_bariatric_table IS 'Has bariatric-capable table (typically 250kg+)';
