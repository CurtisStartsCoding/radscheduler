# Legacy Documentation Cleanup for Phase 5.2

**Date:** October 15, 2025
**Purpose:** Identify obsolete documentation that contradicts the Phase 5.2 SMS scheduling hardening plan

---

## 🔴 CRITICAL - DOCUMENTS THAT CONTRADICT PHASE 5.2

These documents describe the OLD architecture (direct RIS integration, AI scheduling, HL7 processing, Avreo adapters) which is **completely obsolete** for Phase 5.2.

### PRIMARY OFFENDERS

#### 1. `README.md` (ROOT)
**Status:** ❌ COMPLETELY OBSOLETE
**Contradictions:**
- Line 3: "AI-Powered Radiology Scheduling System with HL7 Integration"
- Line 11: "HL7 Integration - Process SIU/ORM messages"
- Line 12: "AI-Powered Scheduling - Claude API detects conflicts"
- Line 14: "WebSocket Dashboard"

**Phase 5.2 Reality:**
- NO HL7 processing in RadScheduler (RadOrderPad does this)
- NO AI scheduling (simple SMS conversation flow)
- NO WebSocket dashboard
- SMS scheduling ONLY

**Action Required:** REWRITE completely for Phase 5.2 SMS focus

---

#### 2. `docs/README.md`
**Status:** ❌ COMPLETELY OBSOLETE
**Contradictions:**
- Line 9: "HL7 Processing - End-to-end appointment creation from HL7"
- Line 10: "AI Conflict Detection - Claude API integration"
- Line 12: "Real-time Dashboard - WebSocket-powered"
- Line 42: "Redis for caching and real-time features"
- Line 65: "Anthropic API key for Claude"

**Phase 5.2 Reality:**
- Redis explicitly NOT used (PostgreSQL only)
- No AI/Anthropic integration
- No HL7 processing
- No WebSocket/dashboard

**Action Required:** REWRITE completely or DELETE

---

#### 3. `docs/RIS_INTEGRATION_ARCHITECTURE.md`
**Status:** ❌ COMPLETELY OBSOLETE
**Contradictions:**
- Entire document describes direct RIS integration architecture
- Line 7: "RadScheduler - The AI-powered scheduling enhancement"
- Line 14: "[Referring Physicians] → [ROP] → [RadScheduler] → [RIS]"
- Line 75-81: "AI-powered scheduling recommendations, Conflict detection, Schedule optimization"

**Phase 5.2 Reality:**
- RadScheduler → QIE → RIS (QIE middleware required)
- No AI scheduling
- No direct RIS communication
- SMS conversation management only

**Action Required:** DELETE (completely irrelevant)

---

#### 4. `docs/API_ENDPOINTS.md`
**Status:** ⚠️ MOSTLY OBSOLETE
**Contradictions:**
- Documents Avreo endpoints (lines 158-163)
- Documents HL7 endpoints (lines 153-156, 367-428)
- Documents AI analytics endpoints (lines 430-551)
- Documents clinical integration endpoints (lines 141-145, 243-363)
- Documents demo/WebSocket endpoints (lines 165-167, 554-582)

**Phase 5.2 Reality:**
- Only needs SMS webhook endpoints
- QIE REST client endpoints
- Auth/audit endpoints
- NO Avreo, HL7, AI, clinical, demo endpoints

**Action Required:** REWRITE - Delete 80% of content, add SMS webhook documentation

---

#### 5. `docs/RIS_INTEGRATION_IMPLEMENTATION.md`
**Status:** ❌ COMPLETELY OBSOLETE (likely)
**Contradictions:** (Need to check, but title suggests direct RIS implementation)

**Action Required:** DELETE (if it describes direct RIS integration)

---

#### 6. `docs/MODULAR_SCHEDULING.md`
**Status:** ❌ LIKELY OBSOLETE
**Contradictions:** (Need to check, but title suggests scheduling algorithms)

**Phase 5.2 Reality:** No scheduling algorithms, just SMS conversation flow

**Action Required:** DELETE or verify relevance

---

#### 7. `docs/IMPLEMENTATION_PLAN.md` / `docs/implementation-plan.md`
**Status:** ⚠️ OBSOLETE
**Contradictions:** Likely describes the old HL7/AI/RIS implementation

**Action Required:** DELETE and replace with Phase 5.2 implementation plan

---

#### 8. `docs/mvp-implementation-plan.md`
**Status:** ⚠️ OBSOLETE
**Contradictions:** Describes MVP for old architecture

**Action Required:** DELETE

---

#### 9. `docs/PRODUCTION_IMPLEMENTATION_PLAN.md` / `production-checklist.md`
**Status:** ⚠️ PARTIALLY OBSOLETE
**Contradictions:** Deployment checklist for old architecture

**Action Required:** UPDATE for Phase 5.2 SMS-only deployment

---

#### 10. `docs/PRD.md`
**Status:** ⚠️ OBSOLETE
**Contradictions:** Product requirements for old AI scheduling system

**Action Required:** UPDATE with Phase 5.2 SMS scheduling PRD

---

#### 11. `docs/INTEGRATION_GUIDE.md`
**Status:** ⚠️ OBSOLETE
**Contradictions:** Integration guide for HL7/RIS/AI system

**Action Required:** REWRITE for QIE-based SMS integration

---

#### 12. `docs/aws-deployment-guide.md`
**Status:** ⚠️ NEEDS UPDATE
**Contradictions:** Deploys old architecture (Redis, WebSocket, AI)

**Action Required:** UPDATE for simplified SMS-only deployment

---

#### 13. `docs/CLAUDE.md`
**Status:** ❌ OBSOLETE
**Contradictions:** Describes Claude AI integration (not used in Phase 5.2)

**Action Required:** DELETE

---

#### 14. `docs/connector/` directory
**Status:** ❌ LIKELY OBSOLETE
**Files:**
- `cds-integration-roadmap.md` - Clinical decision support (not used)
- `hl7-integration-spec.md` - HL7 integration (not used in RadScheduler)

**Action Required:** DELETE entire directory

---

## ⚠️ ENVIRONMENT VARIABLE CONFUSION

### Current .env.example (OBSOLETE)
```env
# WRONG - These are NOT needed for Phase 5.2:
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-api03-your-api-key
AVREO_API_URL=...
AVREO_USERNAME=...
```

### Phase 5.2 .env Requirements
```env
# CORRECT - Only these are needed:
DATABASE_URL=postgresql://...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
QIE_API_URL=http://10.0.1.211:8082/api/ris
QIE_API_KEY=...
SMS_CONSENT_REQUIRED=true
SMS_SESSION_TTL_HOURS=24
```

**Action Required:** CREATE new .env.example for Phase 5.2

---

## 📊 SUMMARY

### Documents to DELETE (11 files)
1. `docs/RIS_INTEGRATION_ARCHITECTURE.md`
2. `docs/RIS_INTEGRATION_IMPLEMENTATION.md`
3. `docs/MODULAR_SCHEDULING.md`
4. `docs/IMPLEMENTATION_PLAN.md`
5. `docs/implementation-plan.md`
6. `docs/mvp-implementation-plan.md`
7. `docs/CLAUDE.md`
8. `docs/connector/cds-integration-roadmap.md`
9. `docs/connector/hl7-integration-spec.md`
10. `docs/connector/details for spec.txt`
11. Entire `docs/connector/` directory

### Documents to REWRITE (4 files)
1. `README.md` - Rewrite for SMS scheduling focus
2. `docs/README.md` - Rewrite for Phase 5.2 architecture
3. `docs/API_ENDPOINTS.md` - Remove 80% of content, add SMS endpoints
4. `docs/INTEGRATION_GUIDE.md` - Rewrite for QIE-based integration

### Documents to UPDATE (3 files)
1. `docs/PRD.md` - Update product requirements for SMS scheduling
2. `docs/PRODUCTION_IMPLEMENTATION_PLAN.md` - Update for Phase 5.2 deployment
3. `docs/aws-deployment-guide.md` - Simplify for SMS-only system

### Documents to CREATE (3 files)
1. `.env.example` - Phase 5.2 environment variables
2. `docs/PHASE-5.2-IMPLEMENTATION.md` - New implementation guide
3. `docs/SMS-INTEGRATION-GUIDE.md` - Twilio SMS integration guide

---

## 🎯 IMMEDIATE ACTION PLAN

### Step 1: Archive Old Docs (Safety)
```bash
mkdir docs/archive-pre-phase-5.2
mv docs/RIS_INTEGRATION_*.md docs/archive-pre-phase-5.2/
mv docs/*implementation*.md docs/archive-pre-phase-5.2/
mv docs/MODULAR_SCHEDULING.md docs/archive-pre-phase-5.2/
mv docs/CLAUDE.md docs/archive-pre-phase-5.2/
mv docs/connector/ docs/archive-pre-phase-5.2/
```

### Step 2: Create Placeholder Docs
```bash
# Create WARNING file in root
echo "⚠️ LEGACY ARCHITECTURE - See radscheduler-hardening-plan.md" > README-OLD-ARCHITECTURE.md

# Move old README
mv README.md docs/archive-pre-phase-5.2/README-old-architecture.md
```

### Step 3: Create Phase 5.2 README
Based on `radscheduler-hardening-plan.md` and Phase 5.2 spec

### Step 4: Update API Documentation
Remove obsolete endpoints, add SMS webhook endpoints

---

## 🚨 RISK OF NOT CLEANING UP

If these legacy docs remain:

1. **Developers will implement the wrong architecture**
   - Will add Avreo adapters when QIE should be used
   - Will add Redis when only PostgreSQL needed
   - Will add AI/Claude integration when not needed

2. **Environment configuration will be wrong**
   - Will require REDIS_URL and ANTHROPIC_API_KEY unnecessarily
   - Will miss required QIE configuration

3. **Security vulnerabilities will persist**
   - Docs show no phone number hashing
   - Docs show no Twilio signature verification
   - Docs show PHI in logs

4. **HIPAA violations**
   - Current docs don't mention consent requirements
   - Current docs don't mention 24-hour session expiry
   - Current docs don't mention SHA-256 hashing

---

## ✅ SUCCESS CRITERIA

After cleanup:
- ✅ All documentation describes SMS scheduling ONLY
- ✅ No mention of direct RIS integration
- ✅ No mention of AI/Claude/Anthropic
- ✅ No mention of Redis (PostgreSQL only)
- ✅ No mention of HL7 processing in RadScheduler
- ✅ All docs mention QIE as middleware
- ✅ All docs mention HIPAA compliance (hashing, consent, audit)
- ✅ Environment variables match Phase 5.2 requirements

---

**CONCLUSION:** Without documentation cleanup, the Phase 5.2 implementation WILL be compromised by outdated information.