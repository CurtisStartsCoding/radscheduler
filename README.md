# RadScheduler - HIPAA-Compliant SMS Self-Scheduling

**Version:** Phase 5.2
**Status:** 🔵 In Development - Hardening for Production
**Purpose:** Patient self-scheduling via SMS for radiology imaging appointments

---

## 🎯 What RadScheduler Does

RadScheduler enables patients to self-schedule their radiology imaging appointments through a HIPAA-compliant SMS conversation flow. It integrates with your existing RadOrderPad and RIS systems via QIE (Qvera Interface Engine).

### Core Functionality
1. **Receives webhook** from RadOrderPad when new imaging order created
2. **Manages SMS conversation** with patient (consent → order selection → location → time → confirmation)
3. **Calls QIE REST endpoints** to get locations, available slots, and book appointments
4. **Stores conversation state** in PostgreSQL with automatic 24-hour expiry
5. **Logs everything** for HIPAA compliance with phone number hashing

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐     ┌─────────┐
│ RadOrderPad │────▶│ RadScheduler │────▶│   QIE   │────▶│   RIS   │
│  (Creates   │     │  (SMS Flow)  │     │(REST API│     │(Calendar│
│   Orders)   │     │              │     │ Middleware)   │  System)│
└─────────────┘     └──────┬───────┘     └─────────┘     └─────────┘
                           │
                           │ SMS via Twilio
                           ▼
                    ┌──────────────┐
                    │   Patients   │
                    │   (Mobile)   │
                    └──────────────┘
```

### Why QIE?
- **Vendor-agnostic:** Works with any RIS (Avreo, Epic, Cerner, etc.)
- **Centralized audit:** QIE logs all RIS communication
- **Easy vendor switching:** Change QIE channels, not RadScheduler code
- **HL7 normalization:** QIE handles HL7 ↔ REST ↔ Database conversions

---

## ✅ Features

### SMS Conversation Management
- ✅ Consent capture (first SMS requires patient opt-in)
- ✅ Multi-order handling (patient can schedule multiple imaging orders)
- ✅ Location selection (choose from available facilities)
- ✅ Time slot selection (book available appointment times)
- ✅ Confirmation with booking code
- ✅ Opt-out handling (STOP command)

### HIPAA Compliance
- ✅ **Phone number hashing:** SHA-256 hashing before storage
- ✅ **Consent tracking:** De-identified consent records
- ✅ **Audit logging:** 7-year retention with metadata only
- ✅ **Session expiry:** 24-hour automatic cleanup
- ✅ **PHI minimization:** No patient names or diagnoses in SMS
- ✅ **Twilio BAA:** Business Associate Agreement required

### Security
- ✅ Twilio webhook signature verification
- ✅ Input sanitization and validation
- ✅ Rate limiting (per-phone-number)
- ✅ PostgreSQL-only (no Redis dependency)
- ✅ Secure environment variable management

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (uses existing `radorder_main`)
- Twilio account with HIPAA-eligible service
- QIE server with REST endpoints configured

### 1. Environment Setup

Create `.env` file in `api/` directory:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/radorder_main

# Twilio (REQUIRED)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890

# QIE Integration (REQUIRED)
QIE_API_URL=http://10.0.1.211:8082/api/ris
QIE_API_KEY=your_api_key
QIE_TIMEOUT_MS=5000

# SMS Configuration
SMS_CONSENT_REQUIRED=true
SMS_SESSION_TTL_HOURS=24
SMS_MAX_RETRY_ATTEMPTS=3
SMS_AUDIT_RETENTION_DAYS=2555  # 7 years

# Server
PORT=3010
NODE_ENV=development
```

### 2. Database Migration

The database tables have already been created in `radorder_main`:
- `patient_sms_consents` - Consent tracking with hashed phone numbers
- `sms_audit_log` - HIPAA-compliant audit trail
- `sms_conversations` - Session state with 24-hour expiry

### 3. Install & Run

```bash
cd api
npm install
npm run dev
```

### 4. Test Health Check

```bash
curl http://localhost:3010/health
```

---

## 📡 API Endpoints

### Core Endpoints
- `GET /health` - System health check
- `POST /api/sms/webhook` - Twilio inbound SMS webhook (Twilio signature verified)

### Admin Endpoints (if auth enabled)
- `GET /api/auth/login` - Authentication
- `GET /api/appointments` - View appointments
- `GET /api/audit/sms` - View SMS audit logs

---

## 📱 SMS Conversation Flow

### Example Conversation

**Step 1: Consent Request**
```
RadOrderPad for Dr. Smith: Reply YES to schedule your imaging appointments
via text. SMS not secure. Msg rates apply. Reply STOP to opt out.
```

**Step 2: Order Selection** (if patient replies YES)
```
You have 2 imaging orders to schedule:
1) X-ray - Downtown or Northside
2) MRI - Regional Center
Reply 1 or 2
```

**Step 3: Location Selection** (patient replies 1)
```
X-ray locations:
1) Downtown Imaging - 123 Main St
2) Northside Clinic - 456 Oak Ave
Reply 1 or 2
```

**Step 4: Time Selection** (patient replies 1)
```
Downtown X-ray available times:
1) Tue 9:00 AM
2) Wed 2:00 PM
3) Thu 11:30 AM
Reply 1-3
```

**Step 5: Confirmation** (patient replies 1)
```
Confirmed: X-ray at Downtown Imaging, Tue 9:00 AM
Confirmation: RD-A7B9X
Call 555-0100 with questions
Reply STOP to opt out
```

---

## 🔒 HIPAA Compliance

### Legal Foundation
- **Healthcare Operations Exception:** Appointment scheduling falls under HIPAA healthcare operations
- **First SMS Consent Model:** Initial SMS captures consent (industry standard: Kaiser, Sutter, Mayo)
- **Minimum Necessary Standard:** Only share procedure type and location, never diagnoses

### Required Safeguards
1. ✅ **Twilio BAA:** Sign Business Associate Agreement (free with HIPAA-eligible service)
2. ✅ **Consent Capture:** First SMS requests and documents consent
3. ✅ **Audit Trail:** Log every SMS with 7-year retention
4. ✅ **Opt-Out:** Include "Reply STOP" in every message
5. ✅ **PHI Minimization:** No patient names, diagnoses, or sensitive details in SMS

### What's HIPAA-Compliant
- ✅ "X-ray appointment"
- ✅ "MRI at Regional Center"
- ✅ Appointment times and facility names
- ✅ Booking confirmation codes

### What's NOT Allowed
- ❌ Patient names
- ❌ Diagnoses ("for broken arm")
- ❌ ICD-10 codes
- ❌ Provider notes

---

## 🛠️ Technology Stack

### Backend
- **Node.js** with Express.js
- **PostgreSQL** for all data storage (no Redis)
- **Twilio** for SMS with signature verification
- **Axios** for QIE REST API calls

### Security & Compliance
- **Helmet** - Security headers
- **express-rate-limit** - Rate limiting
- **express-validator** - Input validation
- **Winston** - Structured logging with PHI redaction
- **bcryptjs** & **jsonwebtoken** - Authentication (optional)

---

## 📊 Monitoring

### Health Checks
```bash
curl http://localhost:3010/health
```

### Audit Logs
All SMS interactions logged to `sms_audit_log` table with:
- Hashed phone numbers (SHA-256)
- Message type and direction
- Consent status
- Timestamps
- Session IDs

### Session Cleanup
Automatic PostgreSQL cleanup job deletes sessions older than 24 hours.

---

## 🚢 Deployment

### Production Checklist
- [ ] Sign Twilio BAA (download from Twilio console)
- [ ] Configure Twilio for HIPAA mode
- [ ] Enable Twilio webhook signature verification
- [ ] Review all message templates for PHI
- [ ] Set up 24-hour session expiration
- [ ] Test opt-out functionality (STOP command)
- [ ] Verify phone number hashing in logs
- [ ] Configure rate limiting
- [ ] Set up monitoring and alerts

### Environment Variables (Production)
```bash
NODE_ENV=production
DATABASE_URL=postgresql://prod-user:pass@db.internal:5432/radorder_main
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
QIE_API_URL=http://qie.internal:8082/api/ris
```

---

## 📚 Documentation

- **[Hardening Plan](radscheduler-hardening-plan.md)** - Complete security and architecture hardening plan
- **[Legacy Docs Cleanup](LEGACY-DOCS-TO-DELETE-OR-UPDATE.md)** - Documentation cleanup guide
- **[Phase 5.2 Spec](../radorderpad-api/final-documentation/qvera/phase-5.2-radscheduler-sms-epic.md)** - Full implementation specification

### Legacy Documentation
Legacy documentation for the old HL7/AI/RIS integration architecture has been removed. If needed for reference, it's preserved in git history at commit `backup-voice-ai-sept21`.

---

## 💰 Cost Estimate

- **Twilio SMS:** ~$0.0075 per message
- **Expected volume:** 6 messages per appointment
- **Monthly estimate** (1000 appointments): 1000 × 6 × $0.0075 = **$45/month**

---

## 🆘 Support

### Common Issues

**Issue:** Twilio webhook not receiving messages
**Solution:** Check Twilio webhook URL matches your public endpoint with `/api/sms/webhook`

**Issue:** Session expired
**Solution:** Sessions auto-expire after 24 hours. Patient needs to start over.

**Issue:** Phone number not hashed in logs
**Solution:** Verify SHA-256 hashing is enabled in `sms-audit.js`

---

## 🔄 Integration Flow

1. **RadOrderPad** creates imaging order
2. **RadOrderPad** calls RadScheduler webhook: `POST /api/orders/new`
3. **RadScheduler** sends consent SMS to patient via Twilio
4. **Patient** replies YES (consent captured and stored)
5. **RadScheduler** shows order selection menu
6. **Patient** selects order
7. **RadScheduler** calls QIE: `GET /api/ris/locations?modality=xray`
8. **QIE** queries RIS and returns locations
9. **RadScheduler** shows location menu to patient
10. **Patient** selects location
11. **RadScheduler** calls QIE: `GET /api/ris/available-slots?location=downtown&modality=xray`
12. **QIE** queries RIS calendar and returns slots
13. **RadScheduler** shows time slot menu
14. **Patient** selects time
15. **RadScheduler** calls QIE: `POST /api/ris/book-appointment`
16. **QIE** books appointment in RIS
17. **RIS** confirms booking
18. **RadScheduler** sends confirmation SMS with booking code
19. **RadOrderPad** receives status update from RIS via QIE
20. **RadOrderPad** sends SIU^S12 to Epic via QIE

---

## 🎯 Success Metrics

- **Patient consent rate:** >70%
- **Appointment completion rate:** >60%
- **Time to schedule:** <3 minutes
- **Opt-out rate:** <5%
- **Compliance incidents:** Zero
- **QIE → RIS communication success:** >99%

---

## 📝 License

MIT License - See LICENSE file for details

---

**RadScheduler Phase 5.2** - Simple, secure, HIPAA-compliant SMS scheduling for radiology imaging.

**Architecture:** SMS-only | No AI | No HL7 processing | QIE middleware | PostgreSQL-only