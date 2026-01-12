# Intelligent SMS Scheduler Implementation Plan

**Date:** January 12, 2026
**Status:** Approved, ready for implementation

---

## Executive Summary

Build intelligent scheduling into RadScheduler by leveraging patient context data that RadOrderPad already captures and embeds in HL7 messages. This enables:

1. **Safety checks** - Contrast allergies, renal function, recent contrast timing
2. **Equipment filtering** - Only show locations capable of performing the ordered exam
3. **AI analysis** (future) - Duration calculation, prep instructions, with externalized prompts for A/B testing

---

## Architecture Overview

### Databases

| Database | Purpose | RadScheduler Tables |
|----------|---------|---------------------|
| `radorder_phi` | PHI data | `patients`, `orders`, `patient_context_snapshot` |
| `radorder_main` | Non-PHI data | `sms_conversations`, `sms_audit_log`, **new equipment tables**, **new prompt tables** |

**Key insight:** RadScheduler tables are in `radorder_main` because they only store hashed phone numbers (de-identified). Phone numbers live in `radorder_phi.patients` and flow via HL7/webhook.

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ RadOrderPad (radorder_phi)                                          │
│                                                                     │
│ orders.patient_context_snapshot (JSONB):                            │
│   - allergies (including contrast allergies)                        │
│   - labs (creatinine, eGFR)                                         │
│   - prior_imaging (with dates, contrast flag)                       │
│   - medications                                                     │
│   - diagnoses                                                       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ HL7 ORM Message                                                     │
│                                                                     │
│ - PID segment: patient demographics, phone                          │
│ - AL1 segments: allergies with severity (type MC = contrast)        │
│ - OBX segments: labs (creatinine, eGFR with values)                 │
│ - OBX segments: prior imaging (modality, date, contrast flag)       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ QIE (Qvera Interface Engine)                                        │
│                                                                     │
│ Parses HL7 → Calls RadScheduler webhook                             │
│                                                                     │
│ GAP: Currently not forwarding AL1/OBX data to webhook               │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ RadScheduler (radorder_main)                                        │
│                                                                     │
│ 1. Receive webhook with patientContext                              │
│ 2. Run safety checks (rules-based)                                  │
│ 3. Query equipment database                                         │
│ 4. Filter locations by capability                                   │
│ 5. (Optional) AI analysis for duration/requirements                 │
│ 6. Send filtered options to patient via SMS                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## HL7 Segment Reference

RadOrderPad already builds these segments (source files in radorderpad-api):

### AL1 (Allergies)
**Source:** `src/services/order/radiology/order-export/hl7-segments/al1.ts`

```
AL1|1|MC|^Iodinated contrast^L|SV|Anaphylaxis|20250101
     │  │                      │   │
     │  │                      │   └── Reaction
     │  │                      └── Severity (SV=Severe, MO=Moderate, MI=Mild)
     │  └── Allergen code/description
     └── Type (MC=Miscellaneous Contraindication, DA=Drug Allergy)
```

### OBX Labs
**Source:** `src/services/order/radiology/order-export/hl7-segments/obx-labs.ts`

```
OBX|1|NM|2160-0^Creatinine^LN||1.2|mg/dL|0.7-1.3||||F|20260105
                                │    │      │
                                │    │      └── Reference range
                                │    └── Units
                                └── Value
```

### OBX Prior Imaging
**Source:** `src/services/order/radiology/order-export/hl7-segments/obx-imaging.ts`

```
OBX|2|TX|74177^CT Abdomen/Pelvis^CPT||Modality: CT; Body Part: Abdomen; Findings: ...|||||F|20260105
```

---

## Phase 1: Forward Patient Context from QIE

### QIE Channel Update

Modify the QIE channel that sends to RadScheduler webhook to extract and include:

**New webhook payload structure:**
```json
{
  "orderId": "ORD-12345",
  "patientPhone": "+15551234567",
  "patientMrn": "MRN123",
  "patientDob": "1970-01-01",
  "patientGender": "M",
  "modality": "CT",
  "priority": "routine",
  "orderDescription": "CT Chest with Contrast",
  "procedures": [...],
  "estimatedDuration": 30,

  "patientContext": {
    "allergies": [
      {
        "allergen": "Iodinated contrast",
        "type": "MC",
        "severity": "SV",
        "reaction": "Anaphylaxis"
      }
    ],
    "labs": [
      {
        "name": "Creatinine",
        "code": "2160-0",
        "value": "1.2",
        "units": "mg/dL",
        "date": "2026-01-05",
        "referenceRange": "0.7-1.3"
      },
      {
        "name": "eGFR",
        "code": "33914-3",
        "value": "65",
        "units": "mL/min/1.73m2",
        "date": "2026-01-05"
      }
    ],
    "priorImaging": [
      {
        "modality": "CT",
        "procedureCode": "74177",
        "bodyPart": "Abdomen",
        "date": "2026-01-05",
        "hadContrast": true,
        "facility": "Hospital A"
      }
    ]
  }
}
```

---

## Phase 2: Safety Checks in RadScheduler

### Update Webhook Handler

**File:** `api/src/routes/order-webhook.js`

```javascript
const orderData = {
  orderId,
  orderGroupId: orderGroupId || orderId,
  // ... existing fields ...

  // NEW: Patient context for safety checks
  patientContext: req.body.patientContext || null
};
```

### New Safety Check Service

**File:** `api/src/services/scheduling-safety.js`

```javascript
/**
 * Check patient safety for scheduling
 * Returns warnings (proceed with caution) and blocks (route to coordinator)
 */
function checkSchedulingSafety(order) {
  const warnings = [];
  const blocks = [];

  const ctx = order.patientContext;
  if (!ctx) {
    return { warnings, blocks, canProceed: true };
  }

  // 1. Check contrast allergy
  if (orderRequiresContrast(order)) {
    const contrastAllergy = ctx.allergies?.find(a =>
      a.type === 'MC' ||
      a.allergen?.toLowerCase().includes('contrast') ||
      a.allergen?.toLowerCase().includes('iodine')
    );

    if (contrastAllergy) {
      if (contrastAllergy.severity === 'SV') {
        blocks.push({
          reason: 'CONTRAST_ALLERGY_SEVERE',
          message: 'You have a severe contrast allergy on file. A scheduling coordinator will call you to discuss options.'
        });
      } else {
        warnings.push({
          reason: 'CONTRAST_ALLERGY',
          message: 'Note: You have a contrast allergy on file. Pre-medication may be required.'
        });
      }
    }
  }

  // 2. Check renal function (eGFR)
  if (orderRequiresContrast(order)) {
    const egfr = ctx.labs?.find(l =>
      l.code === '33914-3' ||
      l.name?.toLowerCase().includes('egfr')
    );

    if (egfr) {
      const egfrValue = parseFloat(egfr.value);
      if (egfrValue < 30) {
        blocks.push({
          reason: 'RENAL_FUNCTION_CRITICAL',
          message: 'Your kidney function requires review before contrast imaging. A coordinator will call you.'
        });
      } else if (egfrValue < 45) {
        warnings.push({
          reason: 'RENAL_FUNCTION_LOW',
          message: 'Note: Your kidney function is slightly reduced. Extra precautions will be taken with contrast.'
        });
      }
    }
  }

  // 3. Check recent contrast (7-day rule)
  if (orderRequiresContrast(order)) {
    const recentContrast = ctx.priorImaging?.find(i =>
      i.hadContrast && daysSince(i.date) < 7
    );

    if (recentContrast) {
      const daysSinceContrast = daysSince(recentContrast.date);
      const waitDays = 7 - daysSinceContrast;
      const minDate = addDays(new Date(), waitDays);

      warnings.push({
        reason: 'RECENT_CONTRAST',
        message: `You had a contrast exam ${daysSinceContrast} days ago. We'll schedule your appointment ${waitDays}+ days out to ensure safety.`,
        minScheduleDate: minDate
      });
    }
  }

  return {
    warnings,
    blocks,
    canProceed: blocks.length === 0,
    minScheduleDate: warnings.find(w => w.minScheduleDate)?.minScheduleDate || null
  };
}

function orderRequiresContrast(order) {
  const desc = (order.orderDescription || '').toUpperCase();
  return desc.includes('WITH CONTRAST') ||
         desc.includes('W/ CONTRAST') ||
         desc.includes('W/CONTRAST') ||
         desc.includes('WITH IV CONTRAST') ||
         desc.includes('CONTRAST ENHANCED');
}

function daysSince(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

module.exports = { checkSchedulingSafety, orderRequiresContrast };
```

---

## Phase 3: Equipment Capability Database

### Database Schema

**File:** `api/db/migrations/006_add_equipment_tables.sql`

```sql
-- Equipment capability tables (in radorder_main, not PHI)

-- Locations with their equipment
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
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Equipment at each location
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

  -- General capabilities
  max_patient_weight_kg INTEGER,
  has_bariatric_table BOOLEAN DEFAULT FALSE,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sched_equip_location ON scheduling_equipment(location_id);
CREATE INDEX idx_sched_equip_type ON scheduling_equipment(equipment_type);
CREATE INDEX idx_sched_loc_active ON scheduling_locations(active) WHERE active = TRUE;
```

### Equipment Rules Service

**File:** `api/src/services/equipment-rules.js`

```javascript
/**
 * Equipment requirement rules based on order description
 * Rules-based approach (no AI) for MVP
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

  // MRI rules
  CARDIAC_MRI: {
    pattern: /CARDIAC\s*MRI|MRI\s*HEART|CMR/i,
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
  }
};

/**
 * Get equipment requirements for an order
 */
function getEquipmentRequirements(order) {
  const desc = order.orderDescription || '';
  const modality = (order.modality || '').toUpperCase();

  for (const [ruleName, rule] of Object.entries(EQUIPMENT_RULES)) {
    if (rule.modality === modality && rule.pattern.test(desc)) {
      return {
        ruleName,
        ...rule.requires
      };
    }
  }

  // No special requirements - any equipment of this modality works
  return null;
}

/**
 * Build SQL WHERE clause for equipment requirements
 */
function buildEquipmentWhereClause(requirements, modality) {
  const conditions = [`equipment_type = $1`, `active = TRUE`];
  const params = [modality];
  let paramIndex = 2;

  if (!requirements) {
    return { conditions, params };
  }

  for (const [key, value] of Object.entries(requirements)) {
    if (key === 'ruleName') continue;

    if (typeof value === 'boolean') {
      conditions.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    } else if (typeof value === 'object' && value.min) {
      conditions.push(`${key} >= $${paramIndex}`);
      params.push(value.min);
      paramIndex++;
    }
  }

  return { conditions, params };
}

module.exports = { getEquipmentRequirements, buildEquipmentWhereClause, EQUIPMENT_RULES };
```

### Equipment Service

**File:** `api/src/services/equipment-service.js`

```javascript
const db = require('../db');
const { getEquipmentRequirements, buildEquipmentWhereClause } = require('./equipment-rules');

/**
 * Filter locations by equipment capability for an order
 */
async function filterLocationsByCapability(allLocations, order) {
  const modality = (order.modality || '').toUpperCase();
  const requirements = getEquipmentRequirements(order);

  const { conditions, params } = buildEquipmentWhereClause(requirements, modality);

  const query = `
    SELECT DISTINCT sl.location_id, sl.name, sl.address, sl.city, sl.state, sl.phone
    FROM scheduling_locations sl
    JOIN scheduling_equipment se ON sl.location_id = se.location_id
    WHERE sl.active = TRUE
      AND ${conditions.join(' AND ')}
  `;

  const result = await db.query(query, params);
  const capableLocationIds = new Set(result.rows.map(r => r.location_id));

  // Filter the RIS-provided locations to only those with capability
  return allLocations.filter(loc => capableLocationIds.has(loc.id || loc.location_id));
}

/**
 * Check if any location can handle this order
 */
async function hasCapableLocation(order) {
  const locations = await filterLocationsByCapability([{ location_id: '*' }], order);
  return locations.length > 0;
}

module.exports = { filterLocationsByCapability, hasCapableLocation };
```

---

## Phase 4: AI Analysis (Future, with Externalized Prompts)

### Prompt Storage Schema

**Add to migration file:**

```sql
-- AI prompts externalized for A/B testing
CREATE TABLE IF NOT EXISTS scheduling_prompts (
  id SERIAL PRIMARY KEY,
  prompt_key VARCHAR(100) UNIQUE NOT NULL,  -- e.g., 'order_analysis', 'duration_calc'
  prompt_name VARCHAR(255),                  -- Human-readable name
  prompt_template TEXT NOT NULL,             -- The actual prompt with {{placeholders}}
  model VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
  max_tokens INTEGER DEFAULT 1024,
  is_active BOOLEAN DEFAULT FALSE,
  ab_test_weight INTEGER DEFAULT 100,        -- Weight for A/B testing (0-100)
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Track AI analysis results for monitoring and A/B comparison
CREATE TABLE IF NOT EXISTS scheduling_analysis_log (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER,                   -- FK to sms_conversations
  prompt_id INTEGER REFERENCES scheduling_prompts(id),
  prompt_key VARCHAR(100),                   -- Denormalized for easy querying
  input_data JSONB,                          -- What was sent to AI
  output_data JSONB,                         -- What AI returned
  model_used VARCHAR(100),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for analysis
CREATE INDEX idx_sched_analysis_prompt ON scheduling_analysis_log(prompt_key);
CREATE INDEX idx_sched_analysis_created ON scheduling_analysis_log(created_at DESC);
CREATE INDEX idx_sched_analysis_success ON scheduling_analysis_log(success);
```

### Default Prompt (insert after migration)

```sql
INSERT INTO scheduling_prompts (prompt_key, prompt_name, prompt_template, model, is_active)
VALUES (
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
  "contrastType": <"IV", "Oral", "Both", or "None">,
  "equipmentNeeds": {
    "minimumSlices": <minimum CT slice count needed, or null>,
    "magnetStrength": <minimum MRI field strength, or null>,
    "specialCapabilities": [<list of required capabilities like "contrast_injector", "cardiac", "wide_bore">]
  },
  "patientInstructions": "<prep instructions for patient - fasting, hydration, medication holds, etc.>",
  "schedulingNotes": "<any special scheduling considerations>"
}

Return ONLY the JSON object, no other text.',
  'claude-sonnet-4-20250514',
  true
);
```

### AI Service

**File:** `api/src/services/scheduling-ai.js`

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db');

const anthropic = new Anthropic();

/**
 * Get active prompt by key (with A/B test selection if multiple active)
 */
async function getActivePrompt(promptKey) {
  const result = await db.query(`
    SELECT * FROM scheduling_prompts
    WHERE prompt_key LIKE $1
      AND is_active = TRUE
    ORDER BY ab_test_weight DESC, version DESC
    LIMIT 1
  `, [`${promptKey}%`]);

  if (result.rows.length === 0) {
    throw new Error(`No active prompt found for key: ${promptKey}`);
  }

  return result.rows[0];
}

/**
 * Interpolate placeholders in prompt template
 */
function interpolatePrompt(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

/**
 * Analyze order using AI (with externalized prompt)
 */
async function analyzeOrder(order, conversationId = null) {
  const startTime = Date.now();
  let prompt, response, logId;

  try {
    // Get active prompt
    prompt = await getActivePrompt('order_analysis');

    // Interpolate placeholders
    const filledPrompt = interpolatePrompt(prompt.prompt_template, {
      procedureDescription: order.orderDescription || '',
      cptCode: order.cptCode || 'Not provided',
      modality: order.modality || '',
      priority: order.priority || 'routine',
      clinicalIndication: order.clinicalIndication || 'Not provided'
    });

    // Call AI
    response = await anthropic.messages.create({
      model: prompt.model,
      max_tokens: prompt.max_tokens,
      messages: [{ role: 'user', content: filledPrompt }]
    });

    const latencyMs = Date.now() - startTime;
    const outputText = response.content[0].text;
    const outputData = JSON.parse(outputText);

    // Log for analysis
    await db.query(`
      INSERT INTO scheduling_analysis_log
        (conversation_id, prompt_id, prompt_key, input_data, output_data,
         model_used, prompt_tokens, completion_tokens, latency_ms, success)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
    `, [
      conversationId,
      prompt.id,
      prompt.prompt_key,
      JSON.stringify(order),
      JSON.stringify(outputData),
      prompt.model,
      response.usage?.input_tokens,
      response.usage?.output_tokens,
      latencyMs
    ]);

    return outputData;

  } catch (error) {
    // Log failure
    await db.query(`
      INSERT INTO scheduling_analysis_log
        (conversation_id, prompt_id, prompt_key, input_data, model_used,
         latency_ms, success, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
    `, [
      conversationId,
      prompt?.id,
      prompt?.prompt_key || 'order_analysis',
      JSON.stringify(order),
      prompt?.model,
      Date.now() - startTime,
      error.message
    ]);

    throw error;
  }
}

module.exports = { analyzeOrder, getActivePrompt, interpolatePrompt };
```

---

## Phase 5: Integrate into SMS Flow

### Update sms-conversation.js

**File:** `api/src/services/sms-conversation.js`

Add safety checks and equipment filtering before showing locations:

```javascript
const { checkSchedulingSafety } = require('./scheduling-safety');
const { filterLocationsByCapability } = require('./equipment-service');
// const { analyzeOrder } = require('./scheduling-ai'); // Future: uncomment when ready

async function handleChoosingLocation(conversation, messageBody) {
  const order = conversation.order_data;

  // 1. Run safety checks
  const safetyCheck = checkSchedulingSafety(order);

  // 2. If blocked, route to coordinator
  if (!safetyCheck.canProceed) {
    await sendSMS(conversation.phone, safetyCheck.blocks[0].message);
    await updateConversationState(conversation.id, 'COORDINATOR_REVIEW', {
      safetyBlocks: safetyCheck.blocks
    });
    return;
  }

  // 3. If warnings, inform patient first
  if (safetyCheck.warnings.length > 0) {
    const warningMessages = safetyCheck.warnings.map(w => w.message).join('\n\n');
    await sendSMS(conversation.phone, warningMessages);
  }

  // 4. Get locations from RIS
  const allLocations = await getLocationsFromRIS(order.modality);

  // 5. Filter by equipment capability
  const capableLocations = await filterLocationsByCapability(allLocations, order);

  if (capableLocations.length === 0) {
    await sendSMS(conversation.phone,
      'We need to find a location with the right equipment for your exam. A coordinator will call you shortly.');
    await updateConversationState(conversation.id, 'COORDINATOR_REVIEW', {
      reason: 'NO_CAPABLE_LOCATIONS'
    });
    return;
  }

  // 6. Apply minimum schedule date if recent contrast
  const minDate = safetyCheck.minScheduleDate;

  // 7. Show filtered locations to patient
  await sendLocationOptions(conversation.phone, capableLocations, {
    minScheduleDate: minDate
  });
}
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| **QIE Channel** | Modify | Parse AL1/OBX, include patientContext in webhook |
| `api/src/routes/order-webhook.js` | Modify | Accept and store patientContext |
| `api/src/services/scheduling-safety.js` | **NEW** | Safety check logic (contrast allergy, renal, timing) |
| `api/src/services/equipment-rules.js` | **NEW** | Rules for equipment requirements |
| `api/src/services/equipment-service.js` | **NEW** | Query equipment database |
| `api/src/services/scheduling-ai.js` | **NEW** | AI analysis with externalized prompts |
| `api/src/services/sms-conversation.js` | Modify | Integrate safety checks and filtering |
| `api/db/migrations/006_add_equipment_tables.sql` | **NEW** | Equipment and prompt tables |

---

## Testing Plan

### Unit Tests

1. **Safety checks:**
   - Order with severe contrast allergy → blocks
   - Order with mild contrast allergy → warning only
   - Order with eGFR < 30 → blocks
   - Order with eGFR 30-45 → warning
   - Order with contrast 3 days ago → warning + minScheduleDate

2. **Equipment rules:**
   - "CT Chest with Contrast" → requires ct_has_contrast_injector
   - "Cardiac CT" → requires ct_has_cardiac + 64+ slices
   - "MRI Brain" (no special keywords) → no special requirements

3. **Equipment filtering:**
   - Location with 16-slice CT → filtered out for cardiac CT
   - Location with 64-slice CT + contrast injector → included for CTA

### Integration Tests

1. **HL7 → Webhook flow:**
   - Send HL7 with AL1 segment → verify allergy in patientContext
   - Send HL7 with OBX labs → verify creatinine in patientContext

2. **End-to-end:**
   - Create order with contrast allergy → verify COORDINATOR_REVIEW state
   - Create order with recent contrast → verify minScheduleDate applied
   - Create cardiac CT order → verify only capable locations shown

---

## Network Effect (Cross-Facility)

When RadOrderPad has multiple organizations:

1. Patient at Hospital A → order with UPIN created
2. Same patient at Clinic B → UPIN matched via `patient_xref` table
3. Prior imaging from Hospital A visible in `patient_context_snapshot`
4. RadScheduler sees recent contrast from Hospital A → enforces 7-day wait

**This requires:** Both facilities using RadOrderPad (network effect)

---

## Future Enhancements

1. **AI Duration Override** - Use AI to calculate realistic duration instead of RIS templates
2. **Onboarding Portal** - Radiology groups enter equipment via web UI
3. **Prep Instruction Generation** - AI generates personalized prep instructions
4. **No-Show Prediction** - Risk scoring based on patient history
5. **Waitlist Auto-Fill** - Offer cancelled slots to waitlisted patients
