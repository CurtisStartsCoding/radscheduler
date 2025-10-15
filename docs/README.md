# RadScheduler Documentation

**Version:** Phase 5.2
**Last Updated:** October 15, 2025
**Architecture:** SMS Self-Scheduling with QIE Middleware Integration

---

## 📚 Documentation Index

### Implementation & Testing (October 2025)
- **[Phase 4 Testing Progress](../PHASE-4-TESTING-PROGRESS.md)** - Complete testing report and results
- **[Reverse Proxy Test Results](../REVERSE-PROXY-TEST-RESULTS.md)** - Infrastructure testing
- **[Deployment Guide](../DEPLOYMENT.md)** - Production deployment instructions

### Core Documentation
- **[Hardening Plan](../radscheduler-hardening-plan.md)** - Security and architecture hardening for Phase 5.2
- **[Production Checklist](production-checklist.md)** - Pre-launch verification
- **[AWS Deployment Guide](aws-deployment-guide.md)** - EC2 and RDS setup
- **[Legacy Docs Cleanup](../LEGACY-DOCS-TO-DELETE-OR-UPDATE.md)** - Documentation cleanup guide

### External Documentation
- **[Phase 5.2 Specification](../../radorderpad-api/final-documentation/qvera/phase-5.2-radscheduler-sms-epic.md)** - Complete implementation specification
- **[QIE Tutorial](../../radorderpad-api/final-documentation/qvera/qie-tutorial.txt)** - QIE Interface Engine guide
- **[QIE JavaScript Tutorial](../../radorderpad-api/final-documentation/qvera/qie-javascript-tutorial.txt)** - QIE scripting guide

### Legacy Documentation
Legacy documentation for the old HL7/AI/RIS architecture has been removed. If needed for reference, it's preserved in git history at branch `backup-voice-ai-sept21`.

---

## 🎯 What RadScheduler Does

RadScheduler is a HIPAA-compliant SMS self-scheduling system for radiology imaging appointments. It manages SMS conversations with patients, integrates with QIE (Qvera Interface Engine) for RIS communication, and maintains comprehensive HIPAA audit trails.

### Key Capabilities
1. ✅ SMS conversation management (consent → order → location → time → confirmation)
2. ✅ QIE REST API integration (location, slots, booking)
3. ✅ HIPAA-compliant audit logging (7-year retention)
4. ✅ Phone number hashing (SHA-256)
5. ✅ Session state management (24-hour auto-expiry)
6. ✅ Twilio webhook signature verification

---

## 🏗️ System Architecture

```
RadOrderPad → RadScheduler → QIE → RIS
                   ↓
               Patients (SMS)
```

### Components
- **RadOrderPad:** Creates imaging orders, triggers RadScheduler webhook
- **RadScheduler:** Manages SMS conversations, calls QIE API
- **QIE:** Middleware that normalizes communication with any RIS vendor
- **RIS:** Calendar system (Avreo, Epic, Cerner, etc.)
- **Patients:** Receive and respond to SMS messages

### Why This Architecture?
- **Vendor-agnostic:** QIE handles all RIS-specific integration
- **Centralized audit:** QIE logs all RIS communication
- **Easy vendor switching:** Change QIE configuration, not RadScheduler code
- **HIPAA compliance:** All PHI stays in QIE/RIS, RadScheduler only handles hashed phone numbers

---

## 📋 Quick Start

### 1. Prerequisites
- PostgreSQL database (uses existing `radorder_main`)
- Twilio account with HIPAA BAA
- QIE server with REST endpoints

### 2. Installation
```bash
cd api
npm install
```

### 3. Configuration
Create `.env` file:
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/radorder_main
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
QIE_API_URL=http://10.0.1.211:8082/api/ris
```

### 4. Run
```bash
npm run dev
```

See **[Main README](../README.md)** for full quick start guide.

---

## 🔒 HIPAA Compliance

### Requirements Met
✅ **Business Associate Agreements:** Twilio BAA required
✅ **Consent Capture:** First SMS captures patient consent
✅ **Audit Trail:** 7-year retention with hashed phone numbers
✅ **Opt-Out Mechanism:** STOP command in every message
✅ **PHI Minimization:** No names, diagnoses, or sensitive details in SMS
✅ **Phone Number Hashing:** SHA-256 before storage
✅ **Session Expiry:** 24-hour automatic cleanup

### Database Schema
All tables use **hashed phone numbers only** (no PHI):
- `patient_sms_consents` - Consent records
- `sms_audit_log` - Audit trail (metadata only, no message content)
- `sms_conversations` - Session state

---

## 📊 File Structure

```
radscheduler/
├── api/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── sms-webhook.js           # Twilio inbound webhook
│   │   │   ├── appointments.js          # Appointment management
│   │   │   ├── auth.js                  # Authentication
│   │   │   └── patient-scheduling.js    # Scheduling routes
│   │   ├── services/
│   │   │   ├── sms-conversation.js      # SMS state machine
│   │   │   ├── patient-consent.js       # Consent tracking
│   │   │   ├── sms-audit.js             # Audit logging
│   │   │   ├── ris-api-client.js        # QIE REST client
│   │   │   ├── notifications.js         # Twilio SMS sending
│   │   │   └── organization.service.js  # Multi-tenant (optional)
│   │   ├── middleware/
│   │   │   ├── auth.js                  # Authentication
│   │   │   └── audit.js                 # Audit middleware
│   │   ├── db/
│   │   │   ├── connection.js            # PostgreSQL connection
│   │   │   └── queries.js               # Database queries
│   │   └── utils/
│   │       └── logger.js                # Logging with PHI redaction
│   └── package.json
├── docs/
│   ├── README.md                        # This file
│   ├── archive-pre-phase-5.2/           # Legacy docs (reference only)
│   ├── PRD.md                           # Product requirements
│   └── production-checklist.md          # Deployment checklist
├── radscheduler-hardening-plan.md       # Security hardening plan
└── README.md                            # Main README
```

---

## 🚀 Development Workflow

### Files Implemented (Phase 5.2) ✅ COMPLETE
1. ✅ **`api/src/routes/sms-webhook.js`** - Twilio inbound SMS handler
2. ✅ **`api/src/routes/order-webhook.js`** - Order creation webhook
3. ✅ **`api/src/services/sms-conversation.js`** - Conversation state management
4. ✅ **`api/src/services/patient-consent.js`** - Consent tracking
5. ✅ **`api/src/services/sms-audit.js`** - HIPAA audit logging
6. ✅ **`api/src/services/ris-api-client.js`** - QIE REST API client (with mock mode)
7. ✅ **`api/src/services/session-cleanup.js`** - Auto-expiry cleanup job
8. ✅ **`api/src/server.js`** - Express server with rate limiting and trust proxy

### Files to Keep (Existing)
- `api/src/services/notifications.js` - Twilio SMS (already exists!)
- `api/src/middleware/auth.js` - Authentication
- `api/src/middleware/audit.js` - Audit middleware
- `api/src/db/*` - Database layer
- `api/src/utils/logger.js` - Logging

### Files to Delete (Obsolete)
See **[Hardening Plan](../radscheduler-hardening-plan.md)** for complete list of files to remove.

---

## 📖 Additional Resources

### External Documentation
- [Twilio HIPAA Compliance](https://www.twilio.com/docs/usage/hipaa)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Qvera Interface Engine (QIE)](https://www.qvera.com/)

### Related Projects
- **RadOrderPad:** Order management system
- **QIE Server:** Interface engine (middleware)
- **Mock RIS:** Calendar API for testing

---

## ⚠️ Important Notes

### What RadScheduler Does NOT Do
- ❌ Does NOT process HL7 messages (RadOrderPad does this)
- ❌ Does NOT have AI/Claude integration (simple SMS flow)
- ❌ Does NOT use Redis (PostgreSQL only)
- ❌ Does NOT have WebSocket/real-time dashboard
- ❌ Does NOT communicate directly with RIS (QIE middleware required)
- ❌ Does NOT have Avreo-specific adapters (QIE handles all vendors)

### Architecture Changed (Pre-Phase 5.2 vs Phase 5.2)

**OLD (Pre-Phase 5.2):**
```
RIS → HL7 → Mirth → RadScheduler (AI analysis) → RIS
```
- Direct RIS integration
- AI-powered scheduling
- HL7 processing in RadScheduler
- Redis for real-time features
- WebSocket dashboard

**NEW (Phase 5.2):**
```
RadOrderPad → RadScheduler → QIE → RIS
                  ↓
              Patients (SMS)
```
- SMS-only conversation management
- QIE middleware for all RIS communication
- PostgreSQL-only (no Redis)
- No AI/HL7 processing
- HIPAA-compliant audit logging

---

## 🆘 Support

For questions about:
- **Implementation:** See [Hardening Plan](../radscheduler-hardening-plan.md)
- **HIPAA Compliance:** See [Phase 5.2 Spec](../../radorderpad-api/final-documentation/qvera/phase-5.2-radscheduler-sms-epic.md)
- **QIE Integration:** See [QIE Tutorial](../../radorderpad-api/final-documentation/qvera/qie-tutorial.txt)

---

**RadScheduler Phase 5.2** - Simple, secure, HIPAA-compliant SMS scheduling.