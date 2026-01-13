# Intelligent Scheduling Plan - Innovation Analysis

**Document:** `C:/apps/radscheduler/docs/intelligent-scheduling-plan.md`
**Date:** January 12, 2026
**Status:** "Approved, ready for implementation" (NOT IMPLEMENTED)

---

## Executive Summary

This 865-line planning document describes a comprehensive intelligent scheduling system that is **NOT YET IMPLEMENTED**. It leverages patient context data from RadOrderPad HL7 messages for:

1. Safety checks (contrast allergies, renal function, contrast timing)
2. Equipment filtering (only show capable facilities)
3. AI analysis (duration calculation, prep instructions) - marked as "future"

---

## Key Finding: GAP IDENTIFIED

The document explicitly states:
> "GAP: Currently not forwarding AL1/OBX data to webhook"

This confirms that while RadOrderPad GENERATES the HL7 segments with clinical context, RadScheduler does NOT currently PARSE or USE this data.

---

## Phase Breakdown

### Phase 1: Forward Patient Context from QIE
**Status:** Not Implemented
- Modify QIE channel to extract AL1/OBX segments
- Include `patientContext` in webhook payload
- Structure: allergies, labs (creatinine, eGFR), priorImaging

**New Webhook Structure:**
```json
{
  "patientContext": {
    "allergies": [{ "allergen": "Iodinated contrast", "type": "MC", "severity": "SV" }],
    "labs": [{ "code": "33914-3", "value": "65" }],
    "priorImaging": [{ "hadContrast": true, "date": "2026-01-05" }]
  }
}
```

### Phase 2: Safety Checks in RadScheduler
**Status:** Not Implemented
- New file: `api/src/services/scheduling-safety.js`
- Checks: contrast allergy, renal function (eGFR), recent contrast timing
- Outputs: warnings (proceed with caution) and blocks (route to coordinator)

**Safety Rules:**
| Rule | Condition | Action |
|------|-----------|--------|
| Contrast Allergy (Severe) | severity = "SV" | BLOCK |
| Contrast Allergy (Mild/Mod) | type = "MC" | WARNING |
| eGFR < 30 | renal function critical | BLOCK |
| eGFR 30-45 | renal function low | WARNING |
| Recent Contrast | <7 days | WARNING + minScheduleDate |

### Phase 3: Equipment Capability Database
**Status:** Not Implemented
- New tables: `scheduling_locations`, `scheduling_equipment`
- Equipment capabilities tracked: CT slice count, cardiac gating, contrast injector, MRI field strength, wide-bore, etc.
- Pattern-based rules to match procedure descriptions to equipment requirements

**Equipment Rules:**
| Rule | Pattern | Requirements |
|------|---------|--------------|
| CARDIAC_CT | /CARDIAC\|CTA CORONARY/ | ct_has_cardiac: true, ct_slice_count >= 64 |
| CT_WITH_CONTRAST | /WITH CONTRAST/ | ct_has_contrast_injector: true |
| CT_ANGIOGRAPHY | /CTA\|ANGIOGRAPHY/ | ct_slice_count >= 64, contrast_injector |
| CARDIAC_MRI | /CARDIAC MRI/ | mri_has_cardiac: true |
| MRI_3T | /3T\|HIGH FIELD/ | mri_field_strength >= 3.0 |
| MRI_WIDE_BORE | /WIDE BORE\|CLAUSTROPHOB/ | mri_wide_bore: true |

### Phase 4: AI Analysis with Externalized Prompts
**Status:** "Future" - Not Implemented
- New table: `scheduling_prompts` for externalized prompts
- New table: `scheduling_analysis_log` for A/B testing
- AI analyzes orders for: duration, equipment needs, patient instructions

**Key Innovation:** Externalized prompt storage with A/B testing weights

### Phase 5: Integration into SMS Flow
**Status:** Not Implemented
- Modify `sms-conversation.js` to:
  1. Run safety checks
  2. Block if severe contraindication
  3. Show warnings
  4. Filter locations by equipment
  5. Apply minScheduleDate if recent contrast

---

## Specific Technical Innovations Described

### 1. Clinical Context Parsing at Scheduling Stage
- Parse AL1 segments for allergies (type MC = contrast)
- Parse OBX segments for lab values (eGFR LOINC 33914-3)
- Parse OBX segments for prior imaging history with contrast flag
- **NOVEL:** Apply these at SMS SELF-SCHEDULING, not just CPOE

### 2. Three-Rule Safety Check System
```javascript
// Rule 1: Contrast allergy detection
if (contrastAllergy.severity === 'SV') { BLOCK }

// Rule 2: Renal function validation
if (egfr < 30) { BLOCK }
if (egfr < 45) { WARNING }

// Rule 3: Contrast timing interval
if (priorContrast && daysSince < 7) { minScheduleDate = today + (7 - daysSince) }
```

### 3. Pattern-Based Equipment Matching
- Regular expressions match procedure descriptions
- Map to granular equipment capabilities
- Filter locations BEFORE patient selection

### 4. Externalized Prompt System
```sql
CREATE TABLE scheduling_prompts (
  prompt_key VARCHAR(100),
  prompt_template TEXT,
  model VARCHAR(100),
  ab_test_weight INTEGER,  -- For A/B testing
  is_active BOOLEAN
);
```

### 5. New SMS State: COORDINATOR_REVIEW
- Triggered when safety blocks detected
- Triggered when no capable locations available
- Routes to human intervention

---

## Code Snippets Showing Novel Approaches

### Contrast Detection Function
```javascript
function orderRequiresContrast(order) {
  const desc = (order.orderDescription || '').toUpperCase();
  return desc.includes('WITH CONTRAST') ||
         desc.includes('W/ CONTRAST') ||
         desc.includes('W/CONTRAST') ||
         desc.includes('WITH IV CONTRAST') ||
         desc.includes('CONTRAST ENHANCED');
}
```

### Equipment Query Builder
```javascript
function buildEquipmentWhereClause(requirements, modality) {
  const conditions = [`equipment_type = $1`, `active = TRUE`];
  const params = [modality];
  // Dynamic clause building based on requirements
  for (const [key, value] of Object.entries(requirements)) {
    if (typeof value === 'object' && value.min) {
      conditions.push(`${key} >= $${paramIndex}`);
    }
  }
}
```

### Prompt Interpolation
```javascript
function interpolatePrompt(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}
```

---

## Patent Coverage Analysis

| Innovation | In Existing Patents? | Notes |
|------------|----------------------|-------|
| Safety checks at SMS scheduling | Patent #3 claims it | But NOT IMPLEMENTED |
| Equipment capability filtering | Patent #3 claims it | But NOT IMPLEMENTED |
| Granular equipment database | Patent #3 claims it | But NOT IMPLEMENTED |
| AI equipment inference | Patent #3 claims it | But NOT IMPLEMENTED |
| AI duration calculation | Patent #3 claims it | But NOT IMPLEMENTED |
| Externalized prompts | NOT in patents | Novel approach |
| A/B testing of prompts | NOT in patents | Novel approach |
| COORDINATOR_REVIEW state | Patent #3 mentions it | But NOT IMPLEMENTED |

---

## Network Effect Innovation

Document describes cross-facility safety:
> "Same patient at Clinic B → UPIN matched... RadScheduler sees recent contrast from Hospital A → enforces 7-day wait"

This is a **network effect** innovation - safety checks work better with more facilities on the platform.

---

## Future Enhancements Listed
1. AI Duration Override
2. Onboarding Portal for equipment entry
3. Prep Instruction Generation
4. No-Show Prediction
5. Waitlist Auto-Fill

---

## Key Takeaways

1. **This is a PLANNING document** - features are NOT implemented
2. **Patent #3 claims these features** as if implemented
3. **The GAP is explicitly acknowledged** in the document
4. **Externalized prompts with A/B testing** is NOT in any patent
5. **Implementation would add significant value** but also patent exposure risk
