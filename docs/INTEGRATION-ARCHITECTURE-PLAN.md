# SMS Scheduler Integration Architecture Plan

**Date:** October 16, 2025
**Status:** Architectural Decision & Implementation Plan

---

## Executive Summary

This document outlines the architectural approach for data normalization in the RadScheduler SMS self-scheduling system, establishing QIE/Qvera as the integration and normalization layer.

---

## Current Architecture

```
┌─────────────────┐
│   RIS Systems   │
│  (HL7 Senders)  │
└────────┬────────┘
         │ HL7 ORM Messages
         ▼
┌─────────────────┐
│   QIE/Qvera     │
│  (HL7 Parser)   │
└────────┬────────┘
         │ Parsed HL7 → HTTP
         ▼
┌─────────────────┐
│    Mock RIS     │
│  (Test System)  │
└────────┬────────┘
         │ Webhook (JSON)
         ▼
┌─────────────────┐
│  RadScheduler   │
│ (SMS Scheduler) │
└────────┬────────┘
         │ SMS via Twilio
         ▼
┌─────────────────┐
│    Patients     │
└─────────────────┘
```

### Current Data Flow Issues

1. **Modality formatting inconsistent**
   - HL7 sends: `MR`, `CT`, `US` (DICOM codes)
   - Mock RIS stores: `mri`, `ct`, `ultrasound` (lowercase)
   - SMS shows: "mri exam" (unprofessional)

2. **Missing provider context**
   - HL7 contains: ORC-12 (ordering provider), ORC-21 (ordering facility)
   - Currently not extracted or passed through
   - Patient doesn't know who ordered their exam

3. **Transformation happens in wrong layer**
   - RadScheduler would need to format data
   - Makes RadScheduler vendor-specific
   - Violates separation of concerns

---

## Recommended Architecture: QIE as Normalization Layer

### Principle: Integration Engine for Data Transformation

**QIE/Qvera should be the single point of data normalization for all downstream systems.**

```
┌─────────────────────────────────────────────────────────────┐
│                    RIS Systems (Multiple)                    │
│  • Fuji RIS        • Epic Radiant      • Sirius RIS         │
│  • GE Centricity   • Philips ISP       • Custom Systems     │
└────────────────────────────┬────────────────────────────────┘
                             │ HL7 ORM (Various Formats)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              QIE/Qvera Integration Engine                    │
│                                                               │
│  Transform HL7 → Clean JSON:                                 │
│  ✓ Parse OBR-24/OBR-4 → Normalize modality                  │
│  ✓ Parse ORC-12 → Format provider name                      │
│  ✓ Parse ORC-21 → Extract facility name                     │
│  ✓ Parse PID-13/ORC-14 → Normalize phone (E.164)           │
│  ✓ Validate & enrich data                                    │
│                                                               │
│  Output: Standardized webhook payload                        │
└────────────────────────────┬────────────────────────────────┘
                             │ Clean, Consistent JSON
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Mock RIS / Calendar                      │
│  • Stores normalized data                                    │
│  • Provides scheduling API                                   │
│  • Forwards to RadScheduler webhook                          │
└────────────────────────────┬────────────────────────────────┘
                             │ Same Clean JSON Format
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      RadScheduler                            │
│  • Uses data as-is (NO transformation)                       │
│  • Vendor-agnostic business logic                            │
│  • SMS conversation management                               │
└────────────────────────────┬────────────────────────────────┘
                             │ SMS Messages
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                         Patients                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Define Standard Webhook Schema

**File:** `docs/webhook-schema.json`

```json
{
  "orderId": "string (required)",
  "modality": "string (required) - Uppercase abbreviation: MRI, CT, US, XR, MG, NM, PET",
  "modalityDisplay": "string (required) - Human-readable: MRI, CT Scan, Ultrasound, X-ray, Mammogram",
  "orderingProvider": "string (optional) - Formatted: 'Dr. John Smith'",
  "orderingFacility": "string (optional) - 'Smith Family Practice'",
  "patientPhone": "string (required) - E.164 format: +12393229966",
  "patientId": "string (optional)",
  "priority": "string (optional) - routine, urgent, stat",
  "orderDescription": "string (optional) - 'MRI Brain with contrast'",
  "queuedAt": "string (ISO 8601 timestamp)"
}
```

### Phase 2: QIE Transformation Logic (JavaScript)

**File:** QIE Channel → Transformer Step

```javascript
// QIE JavaScript Transformer
function transformHL7ToSchedulerWebhook(hl7Message) {

  // 1. Extract and normalize modality
  const modalityCode = getHL7Field(hl7Message, 'OBR', 24, 0); // OBR-24 or OBR-4
  const modality = normalizeModality(modalityCode);

  // 2. Extract and format ordering provider
  const providerRaw = getHL7Field(hl7Message, 'ORC', 12, 0); // ORC-12
  const orderingProvider = formatProviderName(providerRaw);

  // 3. Extract ordering facility
  const orderingFacility = getHL7Field(hl7Message, 'ORC', 21, 0); // ORC-21

  // 4. Extract and normalize phone
  const phoneRaw = getHL7Field(hl7Message, 'PID', 13, 0) ||
                   getHL7Field(hl7Message, 'ORC', 14, 0);
  const patientPhone = normalizePhoneE164(phoneRaw);

  // 5. Build clean webhook payload
  return {
    orderId: generateOrderId(),
    modality: modality.code,
    modalityDisplay: modality.display,
    orderingProvider: orderingProvider,
    orderingFacility: orderingFacility,
    patientPhone: patientPhone,
    priority: 'routine',
    queuedAt: new Date().toISOString()
  };
}

// Helper: Normalize DICOM modality codes to standard format
function normalizeModality(code) {
  const modalityMap = {
    'MR': { code: 'MRI', display: 'MRI' },
    'MRI': { code: 'MRI', display: 'MRI' },
    'CT': { code: 'CT', display: 'CT Scan' },
    'US': { code: 'US', display: 'Ultrasound' },
    'XR': { code: 'XR', display: 'X-ray' },
    'CR': { code: 'XR', display: 'X-ray' },
    'DX': { code: 'XR', display: 'X-ray' },
    'MG': { code: 'MG', display: 'Mammogram' },
    'NM': { code: 'NM', display: 'Nuclear Medicine' },
    'PT': { code: 'PET', display: 'PET Scan' },
    'RF': { code: 'FL', display: 'Fluoroscopy' }
  };

  return modalityMap[code.toUpperCase()] || { code: code, display: code };
}

// Helper: Format provider name from HL7 XCN format
function formatProviderName(xcnString) {
  // XCN format: LastName^FirstName^MiddleName^Suffix^Prefix^Degree
  // Example: "Smith^John^A^Jr^Dr^MD"

  if (!xcnString) return null;

  const parts = xcnString.split('^');
  const lastName = parts[0] || '';
  const firstName = parts[1] || '';
  const prefix = parts[4] || 'Dr'; // Default to Dr if not specified

  if (!lastName) return null;

  return `${prefix}. ${firstName} ${lastName}`.trim();
}

// Helper: Normalize phone to E.164 format
function normalizePhoneE164(phone) {
  if (!phone) return null;

  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Handle US phone numbers
  if (digits.length === 10) {
    return '+1' + digits; // Assume US
  } else if (digits.length === 11 && digits[0] === '1') {
    return '+' + digits;
  } else if (digits[0] === '+') {
    return digits;
  }

  return '+1' + digits; // Default to US
}
```

### Phase 3: Update Mock RIS to Accept Clean Data

**File:** `mock-ris/src/http-webhook-sender.ts` (or similar)

**Current:**
```typescript
// Mock RIS currently sends raw data
{
  orderId: order.order_id,
  modality: order.modality.toLowerCase(), // ❌ Inconsistent
  patientPhone: order.patient_phone
}
```

**Updated:**
```typescript
// Mock RIS forwards QIE's clean data as-is
{
  orderId: order.order_id,
  modality: order.modality,              // ✅ Already normalized by QIE
  modalityDisplay: order.modality_display,
  orderingProvider: order.ordering_provider, // ✅ New field
  orderingFacility: order.ordering_facility, // ✅ New field
  patientPhone: order.patient_phone,     // ✅ Already E.164
  priority: order.priority,
  queuedAt: order.queued_at
}
```

### Phase 4: Update RadScheduler to Use New Fields

**File:** `api/src/services/sms-conversation.js`

**Line 90 (Consent SMS):**
```javascript
// OLD:
const message = `Hello! You have a new imaging order. Would you like to schedule...`;

// NEW:
const providerInfo = orderData.orderingProvider
  ? ` from ${orderData.orderingProvider}`
  : '';
const message = `Hello! You have a new imaging order${providerInfo}. Would you like to schedule...`;
```

**Line 124 (Location selection SMS):**
```javascript
// OLD:
let message = `Please select a location for your ${orderData.modality} exam:\n\n`;

// NEW:
const modalityName = orderData.modalityDisplay || orderData.modality;
let message = `Please select a location for your ${modalityName} exam:\n\n`;
```

---

## Data Mapping Reference

### HL7 Fields to Extract

| HL7 Field | Description | Example | Normalized Output |
|-----------|-------------|---------|-------------------|
| OBR-4 or OBR-24 | Modality code | `MR`, `CT`, `US` | `"MRI"`, `"CT"`, `"US"` |
| ORC-12 | Ordering Provider | `Smith^John^A^^Dr^MD` | `"Dr. John Smith"` |
| ORC-21 | Ordering Facility | `Smith Family Practice` | `"Smith Family Practice"` |
| PID-13 / ORC-14 | Patient Phone | `(239) 322-9966` | `"+12393229966"` |
| OBR-1 | Order ID | `12345` | `"ORD-12345"` |
| OBR-27 | Priority | `R`, `S`, `A` | `"routine"`, `"stat"`, `"urgent"` |

### Modality Code Mapping

| DICOM/HL7 | Standard Code | Display Name | Slot Duration |
|-----------|---------------|--------------|---------------|
| MR, MRI | MRI | MRI | 45 min |
| CT | CT | CT Scan | 30 min |
| US | US | Ultrasound | 30 min |
| XR, CR, DX | XR | X-ray | 15 min |
| MG | MG | Mammogram | 30 min |
| PT | PET | PET Scan | 60 min |
| NM | NM | Nuclear Medicine | 60 min |
| RF | FL | Fluoroscopy | 30 min |

---

## Benefits of This Architecture

### ✅ Separation of Concerns
- **QIE**: Data integration & normalization
- **Mock RIS**: Data storage & scheduling logic
- **RadScheduler**: Patient communication & workflow

### ✅ Vendor Agnostic
- RadScheduler works with ANY RIS system
- Just add QIE channel for new vendor
- No RadScheduler code changes needed

### ✅ Single Source of Truth
- All downstream systems get consistent data
- Dashboard, reports, analytics benefit
- Easier debugging and maintenance

### ✅ Reusability
- Other systems can consume same webhook
- Analytics, billing, reporting all use clean data
- Future integrations are simpler

### ✅ Testability
- Mock RIS just copies QIE format
- Easy to test with sample payloads
- No complex transformation logic in multiple places

---

## PHI Considerations

### Physician Information in SMS

**Question:** Is it safe to include provider/facility names in SMS?

**Answer:** YES, with caveats:

1. **Provider name alone** - NOT PHI
   - "Dr. John Smith" is public information
   - No patient-specific context

2. **Facility name alone** - NOT PHI
   - "Smith Family Practice" is public information

3. **In SMS context** - LOW RISK
   - SMS already contains appointment details
   - Patient knows they have an order
   - Adding "from Dr. Smith" provides helpful context
   - Improves patient confidence and response rate

4. **What to AVOID**
   - Don't include diagnosis or reason for exam
   - Don't include detailed patient history
   - Don't include insurance information

**Recommended SMS format:**
```
Hello! You have a new MRI order from Dr. Smith at Smith Family Practice.
Would you like to schedule your appointment via text message?
Reply YES to continue or STOP to opt out.
```

This provides context without adding PHI risk.

---

## Testing Plan

### Test Case 1: Modality Capitalization
- Send HL7 with `OBR-24 = MR`
- Verify SMS says "**MRI** exam" (not "mri exam")

### Test Case 2: Provider Name
- Send HL7 with `ORC-12 = Smith^John^A^^Dr^MD`
- Verify SMS says "from **Dr. John Smith**"

### Test Case 3: Facility Name
- Send HL7 with `ORC-21 = Smith Family Practice`
- Verify webhook includes `"orderingFacility": "Smith Family Practice"`

### Test Case 4: Phone Normalization
- Send HL7 with various phone formats
- Verify all converted to E.164: `+12393229966`

### Test Case 5: Multiple Modalities
- Test: MRI, CT, Ultrasound, Mammogram, X-ray
- Verify each displays correctly in SMS

---

## Migration Strategy

### Option A: QIE-First (Recommended)
1. Update QIE transformation logic
2. Test with Mock RIS
3. Update Mock RIS schema if needed
4. Update RadScheduler to use new fields
5. Deploy and verify

### Option B: Parallel Path
1. QIE sends both old and new formats temporarily
2. Update RadScheduler to handle both
3. Migrate Mock RIS
4. Switch to new format only
5. Remove legacy code

**Recommendation:** Option A - Clean cut, simpler, less technical debt

---

## Next Steps

1. ✅ Document plan (this file)
2. ⏳ Review and approve architectural approach
3. ⏳ Implement QIE transformation logic
4. ⏳ Update Mock RIS database schema
5. ⏳ Update RadScheduler SMS templates
6. ⏳ Test end-to-end with all modalities
7. ⏳ Deploy to production
8. ⏳ Monitor and validate

---

## References

- HL7 v2.5 Specification (ORM/ORU messages)
- DICOM Modality Codes (PS3.16)
- E.164 Phone Number Format (ITU-T)
- HIPAA PHI Guidelines
- RadScheduler API Documentation
- QIE/Qvera Integration Documentation

---

**Document Version:** 1.0
**Last Updated:** October 16, 2025
**Author:** RadScheduler Development Team
**Status:** Approved for Implementation
