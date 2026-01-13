# Prior Art: Patient Safety in Radiology Scheduling

## Summary

Prior art search reveals that clinical decision support for contrast allergies and renal function screening exists, but primarily at the **ORDER ENTRY (CPOE) stage**, not at the **PATIENT SELF-SCHEDULING stage**. The intelligent-scheduling-plan innovation applies these checks during SMS self-scheduling, which may be novel.

---

## Prior Art Identified

### 1. Contrast Allergy Decision Support (Epic BPA)

**Source:** MetroHealth Medical Center / Case Western Reserve University (2015)
**Reference:** Lee J. et al., RSNA Quality Storyboard QS015

**What it does:**
- Best Practice Alert (BPA) in Epic EHR
- Triggers when contrast exam ordered for patient with documented allergy
- Offers SmartSet for pre-medication ordering
- Identifies patients via EHR allergy documentation

**Differentiation from Intelligent-Scheduling:**
- Operates at ORDER ENTRY by physician
- Does not operate at PATIENT SELF-SCHEDULING
- Requires physician action, not automated routing

---

### 2. ESR iGuide / ACR CDS

**Source:** European Society of Radiology / American College of Radiology
**Reference:** MIDAS Study (PMC12228898)

**What it does:**
- Clinical Decision Support System for imaging appropriateness
- Integrated into CPOE systems
- Provides appropriateness ratings based on clinical indications
- Embedded in hospital ordering workflow

**Differentiation from Intelligent-Scheduling:**
- Focuses on APPROPRIATENESS of exam selection
- Does NOT check patient safety contraindications
- Does NOT operate at patient scheduling stage
- Requires physician interaction

---

### 3. eGFR/Creatinine Screening Guidelines

**Sources:**
- ACR Manual on Contrast Media (2021-2023)
- ESUR Guidelines (2018)
- NICE Guideline DG37 (2019)
- Korean Clinical Practice Guideline (2022)

**What they do:**
- Define which patients need renal function screening
- Set eGFR thresholds (<30 contraindicated, 30-45 caution)
- Recommend timing of creatinine measurement
- Provide preventive protocols (hydration, low-osmolar contrast)

**Key Thresholds:**
| eGFR | Action |
|------|--------|
| >= 45 | Proceed normally |
| 30-44 | Hydration, precautions required |
| < 30 | Contraindicated - alternative imaging |

**Differentiation from Intelligent-Scheduling:**
- These are GUIDELINES, not automated systems
- Applied manually by radiologists/technologists
- NOT integrated into patient self-scheduling
- Check occurs BEFORE exam, not during scheduling

---

### 4. Point-of-Care Creatinine Testing

**Source:** NICE DG37 (2019)
**Devices:** StatSensor, Nova StatStrip, ABL800 FLEX, epoc

**What it does:**
- Rapid creatinine/eGFR measurement in radiology department
- Prevents scan cancellation for missing labs
- Used day-of-exam, not during scheduling

**Differentiation from Intelligent-Scheduling:**
- Operates AT TIME OF EXAM
- Does NOT influence scheduling decisions
- Reactive, not proactive

---

### 5. Contrast Agent Alert Patent

**Source:** US Patent Application 2025/0191717 (Siemens Healthineers)
**Title:** Method and System for Providing a Contrast Agent Alert

**What it does:**
- Monitors contrast volume administered during procedure
- Alerts if volume exceeds reference threshold
- Uses DICOM/HL7 for interoperability

**Differentiation from Intelligent-Scheduling:**
- Operates DURING imaging procedure
- Monitors contrast volume, not patient contraindications
- Post-administration, not pre-scheduling

---

## Gap Analysis: What's Novel in Intelligent-Scheduling

### Novel Combination Elements

1. **Timing: Pre-Scheduling Check**
   - Prior art: Checks at order entry OR day-of-exam
   - Novel: Checks BEFORE patient selects appointment

2. **Actor: Patient Self-Service**
   - Prior art: Requires physician/radiologist action
   - Novel: Automated in SMS conversation

3. **Data Source: HL7 Embedded Context**
   - Prior art: EHR lookup at time of check
   - Novel: Context pre-embedded in order message

4. **Action: Automated Routing**
   - Prior art: Alert to physician for decision
   - Novel: Automatic routing to coordinator OR slot filtering

### Potentially Novel Claims

| Claim | Prior Art Coverage | Novelty |
|-------|-------------------|---------|
| Safety checks at SMS scheduling | NOT FOUND | **NOVEL** |
| AL1 parsing for contrast allergy | Exists in CPOE | Novel in scheduling context |
| eGFR validation during self-service | NOT FOUND | **NOVEL** |
| Automatic coordinator routing | NOT FOUND | **NOVEL** |
| Contrast timing rule (7-day) | Exists as guideline | Novel as automated rule |
| COORDINATOR_REVIEW state | NOT FOUND | **NOVEL** |

---

## Prior Art Summary Table

| Prior Art | Stage | Actor | Automated? |
|-----------|-------|-------|------------|
| Epic BPA for allergies | Order entry | Physician | Partial |
| ESR iGuide | Order entry | Physician | No |
| ACR/ESUR Guidelines | Pre-exam | Radiologist | No |
| POC Creatinine | Day of exam | Technologist | Partial |
| Siemens Contrast Alert | During exam | System | Yes |
| **Intelligent-Scheduling** | **Self-scheduling** | **Patient via SMS** | **Yes** |

---

## Recommendation

The intelligent-scheduling approach of applying clinical safety checks during **patient SMS self-scheduling** appears to be **novel**. The key differentiators are:

1. **Stage:** Pre-scheduling (before facility/time selection)
2. **Actor:** Patient-facing automated system
3. **Data:** Pre-embedded in HL7 order message
4. **Action:** Automatic routing or slot filtering

**Priority:** HIGH - These claims should be protected before implementation.

**Risk:** If implemented without patent protection, competitors could apply similar techniques to their scheduling systems.
