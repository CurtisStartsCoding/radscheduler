# HL7 Segment Builders in RadOrderPad

**Location:** `C:/Apps/radorderpad-api/src/services/order/radiology/order-export/hl7-segments/`

---

## Summary

RadOrderPad has fully implemented HL7 segment builders that encode patient clinical context into HL7 messages. These are the **DATA SOURCE** for the intelligent scheduling safety checks described in the planning document.

---

## Segment Files

| File | Purpose | Safety Relevance |
|------|---------|------------------|
| **al1.ts** | Allergy segments | Contrast allergy detection |
| **obx-labs.ts** | Lab value segments | eGFR/creatinine for renal function |
| **obx-imaging.ts** | Prior imaging segments | Recent contrast timing |
| obx-medications.ts | Medication segments | Drug interactions |
| obx-documents.ts | Document references | Supporting documents |
| msh.ts | Message header | Standard HL7 |
| pid.ts | Patient demographics | Standard HL7 |
| pv1.ts | Patient visit | Standard HL7 |
| orc.ts | Order common | Standard HL7 |
| obr.ts | Order request | Standard HL7 |
| dg1.ts | Diagnosis | Standard HL7 |
| nte.ts | Notes | Standard HL7 |
| in1.ts | Insurance | Standard HL7 |

---

## AL1 Segment Builder (Allergies)

**File:** `al1.ts` (77 lines)

### Key Features

1. **Severity Mapping:**
```typescript
if (severityLower.includes('severe') || severityLower.includes('critical')) {
  severityCode = 'SV';  // Severe
} else if (severityLower.includes('moderate')) {
  severityCode = 'MO';  // Moderate
} else if (severityLower.includes('mild')) {
  severityCode = 'MI';  // Mild
}
```

2. **Allergy Type Classification:**
```typescript
if (typeLower.includes('drug') || typeLower.includes('medication')) {
  allergyType = 'DA';  // Drug Allergy
} else if (typeLower.includes('food')) {
  allergyType = 'FA';  // Food Allergy
} else if (typeLower.includes('environment')) {
  allergyType = 'EA';  // Environmental Allergy
} else if (typeLower.includes('contrast')) {
  allergyType = 'MC';  // Miscellaneous Contraindication <-- KEY FOR SAFETY
}
```

3. **Output Format:**
```
AL1|1|MC|^Iodinated contrast^L|SV|Anaphylaxis|20250101
```

### Patent Relevance
- **Patent #3 claims** safety validation uses AL1 segments with type `MC` for contrast allergies
- **This code EXISTS** - it generates the data
- **RadScheduler does NOT parse** this data for scheduling safety

---

## OBX Labs Segment Builder

**File:** `obx-labs.ts` (98 lines)

### Key Features

1. **LOINC Code Integration:**
```typescript
const observationIdentifier = [
  safeHL7String(lab.code || lab.test_code || ''),     // LOINC code
  safeHL7String(lab.test_name || lab.name || 'Lab Result'),
  safeHL7String(lab.system || 'LN')                    // LN=LOINC
].join('^');
```

2. **Abnormal Flag Detection:**
```typescript
if (flag.includes('H') || flag.includes('HIGH')) {
  abnormalFlag = 'H';   // Above high normal
} else if (flag.includes('L') || flag.includes('LOW')) {
  abnormalFlag = 'L';   // Below low normal
} else if (flag.includes('CRITICAL')) {
  abnormalFlag = 'HH';  // Above upper panic limits
}
```

3. **Reference Range Inclusion:**
```typescript
const referenceRange = lab.reference_range || lab.normal_range || '';
```

4. **Output Format:**
```
OBX|1|NM|2160-0^Creatinine^LN||1.2|mg/dL|0.7-1.3|H|||F|20260105
```

### Patent Relevance
- **Patent #3 claims** eGFR validation (LOINC 33914-3) and creatinine (LOINC 2160-0)
- **This code EXISTS** - it generates lab value OBX segments
- **RadScheduler does NOT parse** lab values for renal function screening

---

## OBX Imaging Segment Builder

**File:** `obx-imaging.ts` (118 lines)

### Key Features

1. **Prior Study Information:**
```typescript
const studyInfo = [];
if (imaging.accession_number) {
  studyInfo.push(`Accession: ${imaging.accession_number}`);
}
if (imaging.modality) {
  studyInfo.push(`Modality: ${imaging.modality}`);
}
if (imaging.body_part || imaging.anatomy) {
  studyInfo.push(`Body Part: ${imaging.body_part || imaging.anatomy}`);
}
if (imaging.findings) {
  studyInfo.push(`Findings: ${imaging.findings}`);
}
```

2. **Study Date Tracking:**
```typescript
formatHL7Date(imaging.study_date || imaging.date || '')
```

3. **Report/Image URL Reference:**
```typescript
if (imaging.report_url || imaging.image_url) {
  // Adds OBX segment with RP (Reference Pointer) type
  const urlValue = [
    '',
    'Application',
    imaging.report_url ? 'PDF' : 'IMAGE',
    'URL',
    safeHL7String(imaging.report_url || imaging.image_url)
  ].join('^');
}
```

4. **Output Format:**
```
OBX|2|TX|74177^CT Abdomen/Pelvis^CPT||Modality: CT; Body Part: Abdomen; Findings: ...|||F|20260105
```

### Patent Relevance
- **Patent #3 claims** recent contrast timing check (7-day rule)
- **This code EXISTS** - it generates prior imaging OBX with study dates
- **RadScheduler does NOT parse** imaging history for contrast timing

---

## Data Source Pattern

### How Data Flows

```
┌─────────────────────────────────────────────────────────────┐
│ RadOrderPad API                                              │
│                                                             │
│ orders.patient_context_snapshot (JSONB) contains:           │
│   - allergies[] (from EMR AllergyIntolerance resource)      │
│   - labs[] (from EMR Observation resources)                 │
│   - prior_imaging[] (from EMR ImagingStudy resources)       │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│ HL7 Segment Builders                                        │
│                                                             │
│ buildAL1Segments() → AL1|1|MC|^Iodinated contrast^L|SV|...  │
│ buildOBXLabSegments() → OBX|1|NM|2160-0^Creatinine^LN|...   │
│ buildOBXImagingSegments() → OBX|2|TX|74177^CT Abdomen...    │
└───────────────────────────────┬─────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│ HL7 ORM Message                                             │
│                                                             │
│ Sent to QIE → RadScheduler webhook                          │
│                                                             │
│ GAP: QIE does NOT forward AL1/OBX to webhook payload        │
└─────────────────────────────────────────────────────────────┘
```

---

## Patent #3 Gap Confirmation

The intelligent-scheduling-plan.md explicitly states:

> "GAP: Currently not forwarding AL1/OBX data to webhook"

### What EXISTS (in RadOrderPad)
1. HL7 segment builders - IMPLEMENTED
2. Patient context snapshot storage - IMPLEMENTED
3. FHIR resource fetching from EMR - IMPLEMENTED

### What's MISSING (in RadScheduler)
1. QIE channel forwarding AL1/OBX - NOT IMPLEMENTED
2. Webhook parsing patientContext - NOT IMPLEMENTED
3. Safety check service - NOT IMPLEMENTED
4. Equipment capability database - NOT IMPLEMENTED

---

## Innovation Assessment

### Novel Elements in Segment Builders

1. **Contrast Allergy Type Code**
   - Using `MC` (Miscellaneous Contraindication) for contrast allergies
   - Enables automated detection at scheduling

2. **LOINC-Based Lab Identification**
   - eGFR: 33914-3
   - Creatinine: 2160-0
   - Standardized identification enables safety rules

3. **Prior Imaging Context Encoding**
   - Study dates, modalities, contrast flags
   - Enables timing-based safety rules

### Patent Coverage

| Feature | In Patent? | Implementation |
|---------|------------|----------------|
| AL1 segment builder | Patent #3 mentions | RadOrderPad: YES |
| Contrast allergy type MC | Patent #3 mentions | RadOrderPad: YES |
| OBX lab LOINC codes | Patent #3 mentions | RadOrderPad: YES |
| OBX imaging history | Patent #3 mentions | RadOrderPad: YES |
| RadScheduler parsing | Patent #3 claims | RadScheduler: **NO** |
| Safety check service | Patent #3 claims | RadScheduler: **NO** |

---

## Conclusion

The HL7 segment builders are **fully implemented** in RadOrderPad and represent a **working data source** for clinical safety information. However, RadScheduler does NOT yet consume this data for scheduling decisions.

**Status:** Data generation complete, consumption not implemented
