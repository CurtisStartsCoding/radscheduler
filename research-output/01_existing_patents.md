# Existing Provisional Patents Summary

## Filing Status
- **Total Provisionals:** 4
- **Total Innovations:** 15
- **Filing Date:** January 12, 2026
- **Filing Deadline for Utility:** January 12, 2027
- **Status:** All Complete, Pending USPTO Filing

---

## Patent #1: Multi-Protocol Healthcare Integration Platform

**Full Title:** Multi-Protocol Healthcare Integration Platform Combining SMART on FHIR Authorization, HL7 v2.x Messaging, and AI-Based Clinical Decision Support for Radiology Order Generation and Validation

### Claims/Innovations:
1. **Unified Protocol Architecture** - SMART on FHIR + HL7 v2.x + AI validation in single platform
2. **Predictive Model Pre-Loading During OAuth** - Pre-warming AI models during SMART authorization window with deduplication
3. **Natural Language to Structured Order Conversion** - Dictation to CPT/ICD-10 with ACR appropriateness using temperature=0.0
4. **Automatic Clinical Document Embedding** - FHIR DocumentReference to HL7 OBX Base64 embedding

### Technical Scope:
- EMR integration via OAuth 2.0 / FHIR R4
- RIS communication via MLLP / HL7 v2.x
- AI validation with deterministic output
- Cross-EMR cache key derivation

---

## Patent #2: Two-Stage Clinical Follow-Up Analysis

**Full Title:** Two-Stage Artificial Intelligence System for Radiology Report Analysis with Clinical Override Detection, Guideline-Concordant Recommendation Generation, and EMR ServiceRequest Write-Back

### Claims/Innovations:
1. **Two-Stage Processing Architecture** - Stage 1 extracts context, Stage 2 applies guidelines
2. **Clinical Override Detection System** - 13 rules that supersede standard guidelines (Marfan thresholds, post-menopausal breast, etc.)
3. **Error Detection and Confidence Signaling** - GREEN/YELLOW/RED confidence with 6 error categories
4. **FHIR ServiceRequest Write-Back** - Automated follow-up order creation in EMR

### Technical Scope:
- Versioned clinical guidelines (Fleischner 2017, BI-RADS 2025, TI-RADS 2017, etc.)
- 17 clinical context variables extracted
- Override rules for syndromic aortic disease, known malignancy, cirrhosis, etc.

---

## Patent #3: RadScheduler SMS Self-Scheduling

**Full Title:** Database-Driven SMS Conversation State Machine with Intelligent Order Consolidation, Clinical Safety Validation, and Equipment Capability Filtering for Healthcare Appointment Scheduling

### Claims/Innovations:
1. **Database-Driven SMS State Machine** - PostgreSQL-based state management with auto-expiration
2. **Intelligent Order Consolidation Engine** - Multiple orders combined into single SMS conversation
3. **Multi-Procedure Single-Appointment Booking** - Aggregate duration, multiple OBR segments
4. **Modality-Aware Location Filtering** - Present only capable facilities
5. **Clinical Safety Validation Using HL7 Segments** - AL1 allergies, OBX labs, contrast timing
6. **Granular Equipment Capability Matching** - CT slice count, MRI field strength filtering
7. **AI-Powered Equipment Requirement Inference** - LLM analysis of procedure descriptions
8. **AI-Powered Realistic Duration Calculation** - Override static RIS templates

### Technical Scope:
- HIPAA-compliant phone storage (SHA-256 hash + AES-256-GCM)
- States: CONSENT_PENDING, CHOOSING_LOCATION, CHOOSING_TIME, CONFIRMED, EXPIRED, COORDINATOR_REVIEW
- HL7 SRM/SIU message generation

---

## Patent #4: AI Medical Coding & EMR State Management

**Full Title:** Dynamic AI Model Selection Based on Medical Procedure Type with Server-Side Healthcare Token Management and Organization Relationship State Machine

### Claims/Innovations:
1. **Dynamic AI Model Selection** - Route validation types to different AI models (imaging->Opus, labs->Sonnet)
2. **Server-Side SMART Token Management** - Redis storage with TTL sync, dual expiry format handling
3. **Organization Relationship State Machine** - pending/active/rejected/terminated with re-request mechanism

### Technical Scope:
- 8 validation types with per-type model/temperature config
- ISO 8601 and seconds-based expiry handling
- Bidirectional relationship detection

---

## Coverage Gaps Identified in Patents

The following features are mentioned in Patent #3 but described as FUTURE/PLANNED innovations:
- **Clinical Safety Validation (Innovation 5)** - HL7 AL1/OBX parsing at scheduling time
- **Equipment Capability Matching (Innovation 6)** - Granular equipment database
- **AI Equipment Inference (Innovation 7)** - LLM-based requirement inference
- **AI Duration Calculation (Innovation 8)** - LLM-based duration override

**Key Question:** Are these innovations actually implemented in code, or are they patent claims for planned features?

---

## Trade Secrets (NOT in Patents)
- Specific LLM prompt text
- Clinical override rule exact thresholds
- EMR-specific FHIR normalization
- Bundle pricing amounts
- CPT prefix classification rules
- Phone encryption key derivation

---

## Prior Art Referenced
- US11,562,288 (Amazon cloud pre-warming)
- US6,915,254, US7,379,946 (Nuance voice-to-code)
- US12148521B2 (Philips follow-up tracking)
- US11,861,314 (ASAPP sentence classification)
- US8,364,501 B2 (Multi-step appointment booking)
- GB2413404A (Appointment reminders)
- US 11,315,680 (Medical device inventory)
