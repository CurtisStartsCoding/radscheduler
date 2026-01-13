# Prior Art: Equipment Capability Matching

## Summary

Prior art search reveals that equipment databases exist for marketing/sales purposes and capacity allocation focuses on scheduling optimization, but **no prior art found for procedure-to-equipment matching during patient self-scheduling**. The intelligent-scheduling approach of filtering facilities by granular equipment capabilities during SMS scheduling may be novel.

---

## Prior Art Identified

### 1. RadiologyData Commercial Database

**Source:** RadiologyData.com (Commercial Product)

**What it does:**
- Maintains database of hospital radiology equipment
- Tracks CT, MRI, PET/CT installed base
- Records OEM, Model, Year of Installation
- Used for sales/marketing, not patient scheduling

**Differentiation from Intelligent-Scheduling:**
- PURPOSE: Marketing to equipment vendors
- NOT integrated into patient scheduling
- No procedure-to-equipment matching
- No real-time location filtering

---

### 2. Dynamic Capacity Allocation (MDP Models)

**Source:** PMC8442351 (2021) - Brazilian hospital study

**What it does:**
- Markov Decision Process for CT capacity allocation
- Models equipment with different capacities
- Optimizes scheduling based on patient demand
- Addresses no-show prediction

**Key Finding:**
> "One of the resources has a smaller capacity... its associated service time is equivalent to twice that of others"

**Differentiation from Intelligent-Scheduling:**
- Focuses on CAPACITY (time slots), not CAPABILITY
- Does not match procedures to equipment requirements
- Does not filter by CT slice count, MRI field strength
- Operates at departmental level, not patient self-service

---

### 3. Radiology Department Management Solutions

**Source:** PMC4633074 (2015) - Literature review

**What it does:**
- Reviews Benchmarking, CRM, Lean Approach
- ServiceBlueprinting for process optimization
- Focus on workflow efficiency

**Differentiation from Intelligent-Scheduling:**
- Process optimization, not procedure-equipment matching
- No capability-based filtering
- No patient-facing systems

---

### 4. Equipment Utilization Studies

**Source:** IJSART paper on capacity utilization

**What it does:**
- Analyzes utilization rates of CT, MRI, US
- Identifies scheduling conflicts and downtime
- Recommends advanced scheduling algorithms

**Differentiation from Intelligent-Scheduling:**
- UTILIZATION monitoring, not CAPABILITY matching
- Does not match procedure requirements to equipment
- Focus on operational efficiency

---

### 5. RIS/PACS Systems (eRAD)

**Source:** eRAD.com

**What it does:**
- Radiology Information System
- Multi-site workflow management
- Resource optimization

**Differentiation from Intelligent-Scheduling:**
- General RIS functionality
- No evidence of procedure-to-equipment matching
- Radiologist/technologist facing, not patient-facing

---

### 6. MRI Capacity Allocation Game Theory

**Source:** PMC paper on MRI capacity allocation

**What it does:**
- Bayesian game for capacity allocation among departments
- Addresses fairness in resource allocation
- Department-level competition for MRI slots

**Differentiation from Intelligent-Scheduling:**
- Department-level allocation
- Does not address procedure-specific requirements
- No patient self-service

---

### 7. Medical Imaging Data Transfer Systems

**Source:** US Patent 6,661,228

**What it does:**
- Multi-server MRI system architecture
- Tagged data objects for communication
- Workstation-server communication

**Differentiation from Intelligent-Scheduling:**
- INTERNAL system communication
- Not related to scheduling or capability matching
- Hardware/software architecture patent

---

## Gap Analysis: What's Novel in Intelligent-Scheduling

### Novel Combination Elements

1. **Granular Equipment Capability Database**
   - Prior art: General equipment inventory (OEM, model, year)
   - Novel: Specific capabilities (slice count, field strength, cardiac gating)

2. **Procedure-to-Equipment Matching Rules**
   - Prior art: NOT FOUND
   - Novel: Pattern-based rules mapping procedures to requirements

3. **Real-Time Location Filtering**
   - Prior art: Capacity allocation (slots)
   - Novel: Capability filtering (only show qualified locations)

4. **Patient-Facing Integration**
   - Prior art: RIS systems for staff
   - Novel: SMS self-scheduling with capability filtering

### Potentially Novel Claims

| Claim | Prior Art Coverage | Novelty |
|-------|-------------------|---------|
| Granular equipment capability DB | Partial (marketing DBs) | **NOVEL** in scheduling context |
| Procedure description pattern matching | NOT FOUND | **NOVEL** |
| Equipment filtering in self-scheduling | NOT FOUND | **NOVEL** |
| CT slice count filtering | NOT FOUND | **NOVEL** |
| MRI field strength matching | NOT FOUND | **NOVEL** |
| Wide-bore MRI for claustrophobia | NOT FOUND | **NOVEL** |

---

## Prior Art Summary Table

| Prior Art | Purpose | Equipment Matching? | Patient-Facing? |
|-----------|---------|---------------------|-----------------|
| RadiologyData | Marketing | No | No |
| MDP Capacity Models | Scheduling optimization | No (capacity only) | No |
| RIS/PACS Systems | Workflow management | No | No |
| Game Theory Allocation | Department fairness | No | No |
| **Intelligent-Scheduling** | **Self-service scheduling** | **YES** | **YES** |

---

## Equipment Rules from Intelligent-Scheduling Plan

The plan describes specific rules not found in prior art:

```javascript
// CT rules
CARDIAC_CT: {
  pattern: /CARDIAC|CTA CORONARY|CALCIUM SCORE/,
  requires: { ct_has_cardiac: true, ct_slice_count: { min: 64 } }
}

// MRI rules
MRI_3T: {
  pattern: /3T|HIGH FIELD/,
  requires: { mri_field_strength: { min: 3.0 } }
}

MRI_WIDE_BORE: {
  pattern: /WIDE BORE|CLAUSTROPHOB|BARIATRIC/,
  requires: { mri_wide_bore: true }
}
```

These pattern-based rules mapping procedure descriptions to equipment capabilities appear to be **novel**.

---

## Recommendation

The equipment capability matching approach appears to be **novel**. Key differentiators:

1. **Granularity:** Not just equipment type, but specific capabilities
2. **Matching:** Pattern-based rules from procedure description
3. **Context:** Patient self-scheduling, not staff workflow
4. **Action:** Automatic facility filtering before patient selection

**Priority:** MEDIUM-HIGH - Novel approach but partially covered by Patent #3 claims

**Risk:** Claims exist in Patent #3 but implementation does not. Recommend:
- Implement before non-provisional filing, OR
- Narrow claims to match actual implementation
