-- Seed Data for Scheduling AI Prompts
-- Default prompts for intelligent order analysis

-- Clear existing prompts (for re-running seed)
DELETE FROM scheduling_analysis_log;
DELETE FROM scheduling_prompts;

-- Insert default order analysis prompt (v1)
INSERT INTO scheduling_prompts (
  prompt_key,
  prompt_name,
  prompt_template,
  model,
  max_tokens,
  is_active,
  ab_test_weight,
  version
) VALUES (
  'order_analysis_v1',
  'Order Analysis - Equipment & Duration',
  'You are a radiology scheduling expert. Analyze this imaging order and determine scheduling requirements.

ORDER DETAILS:
- Procedure: {{procedureDescription}}
- CPT Code: {{cptCode}}
- Modality: {{modality}}
- Priority: {{priority}}
- Clinical indication: {{clinicalIndication}}

Analyze this order and return a JSON object with:

{
  "totalDurationMinutes": <realistic total time patient will be in department>,
  "scanTimeMinutes": <actual imaging acquisition time>,
  "prepTimeMinutes": <pre-scan preparation time>,
  "contrastRequired": <true or false>,
  "contrastType": "<IV, Oral, Both, or None>",
  "equipmentNeeds": {
    "minimumSlices": <minimum CT slice count needed, or null>,
    "magnetStrength": <minimum MRI field strength, or null>,
    "specialCapabilities": [<list of required capabilities like "contrast_injector", "cardiac", "wide_bore">]
  },
  "patientInstructions": "<prep instructions for patient - fasting, hydration, medication holds, etc.>",
  "schedulingNotes": "<any special scheduling considerations>"
}

Guidelines:
- For CT with contrast: typically needs contrast_injector capability
- For Cardiac CT/CTA Coronary: needs 64+ slices with cardiac gating
- For general CTA: needs 64+ slices with contrast_injector
- For Cardiac MRI: needs cardiac sequences capability
- For claustrophobic patients: needs wide_bore MRI
- For 3T MRI orders: needs 3.0T field strength

Duration estimates should be realistic total department time:
- Basic CT without contrast: 20-30 minutes
- CT with IV contrast: 30-45 minutes
- CT with oral contrast: 90-120 minutes (drinking time)
- Basic MRI: 45-60 minutes
- Complex MRI with contrast: 60-90 minutes
- Mammogram: 20-30 minutes
- Ultrasound: 30-45 minutes

Return ONLY the JSON object, no other text.',
  'claude-sonnet-4-20250514',
  1024,
  TRUE,
  100,
  1
);

-- Insert duration-focused prompt (v1) - alternative for A/B testing
INSERT INTO scheduling_prompts (
  prompt_key,
  prompt_name,
  prompt_template,
  model,
  max_tokens,
  is_active,
  ab_test_weight,
  version
) VALUES (
  'duration_calc_v1',
  'Duration Calculator',
  'You are a radiology workflow specialist. Calculate the realistic total time a patient will spend in the imaging department for this procedure.

PROCEDURE:
- Description: {{procedureDescription}}
- CPT Code: {{cptCode}}
- Modality: {{modality}}
- Priority: {{priority}}

Return a JSON object:

{
  "totalMinutes": <total time from arrival to departure>,
  "breakdown": {
    "registration": <check-in and paperwork, typically 5 min>,
    "preparation": <changing, positioning, IV access if needed>,
    "scanning": <actual imaging acquisition>,
    "contrastDelay": <delay phases for contrast studies, 0 if no contrast>,
    "postProcedure": <observation, recovery if needed>
  },
  "contrastRequired": <true or false>,
  "reasoning": "<brief explanation>"
}

Consider:
- Contrast studies add IV access (5-10 min) and injection/delay phases
- Oral contrast requires 60-90 min drinking time before scan
- Multi-phase CT requires longer scan windows
- Complex MRI sequences take longer than basic protocols
- PET/CT includes uptake time (45-60 min)

Return ONLY the JSON object.',
  'claude-sonnet-4-20250514',
  512,
  FALSE,  -- Inactive by default (use order_analysis_v1)
  50,
  1
);

-- Insert equipment inference prompt (v1)
INSERT INTO scheduling_prompts (
  prompt_key,
  prompt_name,
  prompt_template,
  model,
  max_tokens,
  is_active,
  ab_test_weight,
  version
) VALUES (
  'equipment_inference_v1',
  'Equipment Requirement Inference',
  'You are a radiology equipment specialist. Determine what equipment capabilities are REQUIRED to perform this procedure.

ORDER:
- Procedure: {{procedureDescription}}
- CPT Code: {{cptCode}}
- Modality: {{modality}}

Return a JSON object specifying equipment requirements:

{
  "equipmentType": "<CT|MRI|US|MAMMO|XRAY|FLUORO|PET>",
  "requirements": {
    "ct_minimum_slices": <integer or null>,
    "ct_cardiac_gating": <true|false|null>,
    "ct_contrast_injector": <true|false|null>,
    "ct_dual_energy": <true|false|null>,
    "mri_minimum_field_strength": <1.5|3.0|null>,
    "mri_cardiac_sequences": <true|false|null>,
    "mri_wide_bore": <true|false|null>,
    "mammo_tomosynthesis": <true|false|null>,
    "mammo_biopsy_capable": <true|false|null>
  },
  "confidence": <"high"|"medium"|"low">,
  "reasoning": "<brief explanation>"
}

Inference rules:
- "Cardiac CT", "CTA Coronary" => 64+ slices with cardiac gating
- "CTA", "CT Angio" => 64+ slices with contrast injector
- "3T", "high field" => 3.0T MRI
- "wide bore", "claustrophobic", "bariatric" => wide-bore MRI
- "tomosynthesis", "3D mammo", "DBT" => 3D mammography
- "stereotactic biopsy" => biopsy-capable mammography

Return ONLY the JSON object.',
  'claude-sonnet-4-20250514',
  512,
  FALSE,  -- Inactive by default
  50,
  1
);

-- Verify seed data
SELECT 'Prompts inserted:' AS info, COUNT(*) AS count FROM scheduling_prompts;

-- Show active prompts
SELECT
  prompt_key,
  prompt_name,
  model,
  is_active,
  ab_test_weight,
  version
FROM scheduling_prompts
ORDER BY prompt_key;

/*
Expected Prompts:

| prompt_key              | Active | Weight | Purpose                           |
|-------------------------|--------|--------|-----------------------------------|
| order_analysis_v1       | TRUE   | 100    | Primary analysis prompt           |
| duration_calc_v1        | FALSE  | 50     | Duration-focused alternative      |
| equipment_inference_v1  | FALSE  | 50     | Equipment-focused alternative     |

Usage:
- order_analysis_v1 is the default for all AI analysis
- Other prompts can be activated for A/B testing
- Weights determine selection probability when multiple are active
*/
