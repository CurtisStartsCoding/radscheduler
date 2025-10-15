# RadScheduler Hardening Plan for Phase 5.2 SMS Scheduling

**Date:** October 15, 2025
**Status:** MISSION CRITICAL
**Current State:** Commit d96329a (Sept 19, 2025)
**Target:** HIPAA-compliant SMS self-scheduling system

---

## EXECUTIVE SUMMARY

RadScheduler must be hardened from a general-purpose RIS integration system to a bulletproof, single-purpose SMS scheduling system. This plan removes 49% of the codebase, fixes 7 critical security vulnerabilities, and implements Phase 5.2 requirements for HIPAA-compliant patient self-scheduling via SMS.

---

## CURRENT STATE ASSESSMENT

### Statistics
- **Files:** 35 JavaScript files
- **Dependencies:** 16 packages
- **Architecture:** Multi-tenant RIS integration with direct vendor adapters
- **Purpose:** Originally designed for multiple RIS vendors and HL7 processing

### Phase 5.2 Requirements (Per Documentation - UPDATED OCT 15)
1. Receive webhook from Mock RIS when order enters pending queue (NOT from RadOrderPad)
2. Manage SMS conversations with patients (consent → location → time → confirm)
3. Call QIE REST endpoints (QIE handles all RIS communication)
4. Store conversation state in PostgreSQL only (NO Redis)
5. Log everything for HIPAA compliance with phone number hashing

**Architecture Change (Oct 15):** Based on RIS vendor research, Mock RIS triggers RadScheduler (not RadOrderPad). This matches real-world RIS behavior where orders enter a pending queue and trigger scheduling outreach.

---

## CRITICAL SECURITY VULNERABILITIES

### 🔴 SEVERE - IMMEDIATE FIX REQUIRED

1. **No Twilio Signature Verification**
   - **Location:** `api/src/services/notifications.js` line 45
   - **Risk:** Anyone can POST fake SMS replies to webhook endpoint
   - **Fix:** Add `twilio.validateRequest()` before processing

2. **Phone Numbers Not Hashed - HIPAA VIOLATION**
   - **Location:** Throughout codebase
   - **Risk:** PHI stored in plain text
   - **Fix:** SHA-256 hash all phone numbers before storage/logging

3. **PHI in Logs - HIPAA VIOLATION**
   - **Location:** `notifications.js` logs full phone numbers
   - **Risk:** Audit logs contain PHI
   - **Fix:** Hash phone numbers before logging

### 🟡 HIGH PRIORITY

4. **No Session Timeout**
   - **Risk:** Sessions never expire (Phase 5.2 requires 24-hour expiry)
   - **Fix:** Add PostgreSQL cleanup job with expires_at column

5. **Missing SMS Rate Limiting**
   - **Risk:** Twilio account drain, DDoS vulnerability
   - **Fix:** Add per-phone-number rate limiting

6. **Hardcoded Unused Requirements**
   - **Location:** `server.js` lines 74-75
   - **Risk:** App won't start without REDIS_URL, ANTHROPIC_API_KEY
   - **Fix:** Remove unused environment requirements

7. **WebSocket No Authentication**
   - **Location:** `websocket.js` line 9
   - **Risk:** Unauthorized access to real-time data
   - **Fix:** Delete entire websocket system (not needed)

---

## FILES TO DELETE (17 files - 49% reduction)

### RIS/Avreo Integration (6 files) - OBSOLETE
```
api/src/adapters/avreo-adapter.js
api/src/adapters/base-ris-adapter.js
api/src/adapters/generic-hl7-adapter.js
api/src/adapters/ris-adapter-factory.js
api/src/services/avreo-integration.js
api/src/routes/avreo-integration.js
```
**Reason:** QIE handles ALL RIS communication. Phase 5.2 line 255: "RadScheduler uses standard REST API calls (not HL7)"

### HL7 Processing (2 files) - NOT NEEDED
```
api/src/routes/hl7.js
api/src/services/hl7-processor.js
```
**Reason:** RadOrderPad handles HL7, sends clean JSON to RadScheduler

### Demo/Analytics (3 files) - NOT NEEDED
```
api/src/routes/demo.js
api/src/services/websocket.js
api/src/routes/analytics.js
```
**Reason:** Demo dashboard not part of production SMS flow

### Clinical/AI Integration (4 files) - NOT NEEDED
```
api/src/routes/clinical-integration.js
api/src/services/cds-hl7-connector.js
api/src/routes/cds-webhooks.js
api/src/services/ai-scheduler.js
```
**Reason:** Simple rule-based SMS, no AI or clinical decisions needed

### Configuration (2 files) - OBSOLETE
```
api/src/config/scheduling.js
api/src/services/redis.js
```
**Reason:** Redis explicitly not used (PostgreSQL only), scheduling config obsolete

---

## FILES TO KEEP (18 files)

### Core Infrastructure (6 files)
```
api/src/server.js               # Main server (needs cleanup)
api/src/utils/logger.js         # Logging utility
api/src/db/connection.js        # PostgreSQL connection
api/src/db/queries.js           # Database queries
api/package.json                 # Dependencies (needs cleanup)
.env.example                     # Environment template
```

### Authentication & Security (3 files) - REQUIRED FOR HIPAA
```
api/src/middleware/auth.js      # Authentication middleware
api/src/middleware/audit.js     # Audit logging
api/src/routes/auth.js          # Auth endpoints
```

### Multi-tenant Support (5 files) - KEEP UNTIL CONFIRMED
```
api/src/repositories/organization.repository.js
api/src/repositories/organization-settings.repository.js
api/src/services/organization.service.js
api/src/services/configuration-provider.js
api/src/routes/organizations.js
```
**Note:** May be needed if multiple practices share RadScheduler

### Existing Functionality (4 files)
```
api/src/routes/appointments.js        # Appointment management
api/src/routes/patient-scheduling.js  # Patient scheduling
api/src/services/notifications.js     # SMS service (EXISTS!)
api/src/middleware/tenant-*.js        # Multi-tenant middleware
```

---

## FILES TO CREATE (5 new files)

Per Phase 5.2 specification (lines 480-484):

### 1. `api/src/routes/sms-webhook.js`
- Twilio inbound SMS webhook handler
- Signature verification
- Parse patient replies (YES, NO, STOP, 1, 2, etc.)
- Return TwiML response

### 2. `api/src/services/sms-conversation.js`
- State machine: CONSENT_PENDING → CHOOSING_ORDER → CHOOSING_LOCATION → CHOOSING_TIME → CONFIRMED
- PostgreSQL storage with expires_at column
- 24-hour auto-expiry
- Phone-to-order mapping without exposing IDs

### 3. `api/src/services/patient-consent.js`
- Store consent records with hashed phone numbers
- Check consent before any SMS
- Handle opt-outs (STOP replies)
- Track revocations

### 4. `api/src/services/sms-audit.js`
- Log EVERY interaction
- 7-year retention (HIPAA requirement)
- Hash phone numbers with SHA-256
- Never store message content with PHI

### 5. `api/src/services/ris-api-client.js`
- Interface with QIE REST endpoints
- GET /api/ris/locations
- GET /api/ris/available-slots
- POST /api/ris/book-appointment
- Retry logic with exponential backoff

### 6. `api/src/routes/order-webhook.js` **[NEW - PRODUCTION CRITICAL]**
- Receives webhook from Mock RIS when order enters pending queue
- Validates Bearer token or HMAC signature for security
- Extracts order data: orderId, patientPhone, modality, priority, queuedAt
- Initiates SMS conversation flow via sms-conversation.js
- Returns 200 OK or appropriate error status
- **Why Critical:** This is the trigger point for the entire SMS scheduling workflow

---

## DEPENDENCIES

### Remove (4 packages)
```json
"@anthropic-ai/sdk": "^0.55.0"    // AI not needed
"bull": "^4.11.5"                  // Job queue not needed
"redis": "^4.6.10"                 // PostgreSQL only
"socket.io": "^4.7.2"              // WebSocket demo not needed
```

### Keep (12 packages)
```json
"axios": "^1.10.0"                 // For QIE REST calls
"bcryptjs": "^3.0.2"              // Auth system
"compression": "^1.7.4"           // Performance
"cors": "^2.8.5"                  // Cross-origin
"dotenv": "^16.3.1"               // Environment vars
"express": "^4.18.2"              // Web framework
"express-rate-limit": "^7.1.5"   // Rate limiting
"express-validator": "^7.0.1"    // Input validation
"helmet": "^7.1.0"                // Security headers
"jsonwebtoken": "^9.0.2"         // Auth tokens
"pg": "^8.11.3"                   // PostgreSQL
"twilio": "^4.19.0"               // SMS
"winston": "^3.11.0"              // Logging
```

---

## IMPLEMENTATION PHASES

### Phase 1: Critical Security Fixes (2 hours)
1. Add Twilio signature verification to notifications.js
2. Implement SHA-256 phone hashing throughout
3. Remove PHI from all log statements
4. Add 24-hour session cleanup to PostgreSQL
5. Remove hardcoded REDIS_URL and ANTHROPIC_API_KEY requirements

### Phase 2: Remove Obsolete Code (1 hour)
1. Delete 17 obsolete files listed above
2. Remove unused dependencies from package.json
3. Update server.js to remove deleted route imports
4. Clean up environment variable checks

### Phase 3: Implement Phase 5.2 Features (5-6 hours)
1. Create sms-webhook.js with signature verification
2. Create sms-conversation.js with PostgreSQL state
3. Create patient-consent.js with hashed storage
4. Create sms-audit.js with HIPAA compliance
5. Create ris-api-client.js for QIE integration
6. Create order-webhook.js for Mock RIS triggers (NEW)
7. Update server.js to mount new routes

### Phase 4: Testing & Hardening (2-3 hours)
1. Test SMS conversation flow end-to-end
2. Verify HIPAA compliance (hashing, audit, consent)
3. Load test rate limiting
4. Security scan for vulnerabilities
5. Update documentation

---

## DATABASE SCHEMA REQUIREMENTS

Per Phase 5.2 specification:

### patient_sms_consents
```sql
CREATE TABLE patient_sms_consents (
  id SERIAL PRIMARY KEY,
  phone_hash VARCHAR(64) NOT NULL UNIQUE,
  consent_given BOOLEAN NOT NULL,
  consent_timestamp TIMESTAMP NOT NULL,
  consent_method VARCHAR(50) NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sms_consents_phone_hash ON patient_sms_consents(phone_hash);
```

### sms_audit_log
```sql
CREATE TABLE sms_audit_log (
  id SERIAL PRIMARY KEY,
  phone_hash VARCHAR(64) NOT NULL,
  message_type VARCHAR(50) NOT NULL,
  message_direction VARCHAR(10) NOT NULL,
  consent_status VARCHAR(20),
  timestamp TIMESTAMP NOT NULL,
  session_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sms_audit_timestamp ON sms_audit_log(timestamp);
```

### sms_conversations
```sql
CREATE TABLE sms_conversations (
  id SERIAL PRIMARY KEY,
  phone_hash VARCHAR(64) NOT NULL,
  state VARCHAR(50) NOT NULL,
  order_data JSONB,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sms_conversations_phone_hash ON sms_conversations(phone_hash);
CREATE INDEX idx_sms_conversations_expires_at ON sms_conversations(expires_at);
```

---

## ENVIRONMENT VARIABLES

### Required (.env)
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/radorder_main

# Twilio (REQUIRED)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_URL=https://radscheduler.domain.com/api/sms/webhook

# QIE Integration
QIE_API_URL=http://10.0.1.211:8082/api/ris
QIE_API_KEY=your_api_key
QIE_TIMEOUT_MS=5000

# SMS Configuration
SMS_CONSENT_REQUIRED=true
SMS_SESSION_TTL_HOURS=24
SMS_MAX_RETRY_ATTEMPTS=3
SMS_AUDIT_RETENTION_DAYS=2555  # 7 years

# Order Webhook Security (Mock RIS → RadScheduler)
ORDER_WEBHOOK_SECRET=your-secure-webhook-secret-min-32-chars

# Auth (if keeping multi-user)
JWT_SECRET=your_jwt_secret
BCRYPT_ROUNDS=10
```

### Remove These
```env
REDIS_URL              # Not used
ANTHROPIC_API_KEY      # Not used
AVREO_API_URL         # Obsolete
AVREO_USERNAME        # Obsolete
AVREO_API_KEY         # Obsolete
```

---

## SUCCESS METRICS

### Security
- ✅ All phone numbers hashed with SHA-256
- ✅ Twilio signature verification on all webhooks
- ✅ No PHI in logs
- ✅ Sessions expire after 24 hours
- ✅ Rate limiting prevents abuse

### Performance
- ✅ 49% code reduction (35 → 18 files)
- ✅ 25% dependency reduction (16 → 12 packages)
- ✅ No Redis dependency (PostgreSQL only)
- ✅ Single-purpose application

### Compliance
- ✅ HIPAA audit trail (7-year retention)
- ✅ Consent management with opt-out
- ✅ De-identified data storage
- ✅ Minimum necessary PHI principle

---

## FINAL RESULT

**Before:** Multi-purpose RIS integration system with 35 files
**After:** Bulletproof SMS scheduling system with 18 files + 6 new SMS-specific files

Total: **24 files** focused exclusively on HIPAA-compliant SMS patient self-scheduling.

**Key Addition (Oct 15):** order-webhook.js endpoint enables Mock RIS to trigger SMS flow when orders enter pending queue - matches real RIS vendor behavior.

---

**Document Status:** FINAL
**Last Updated:** October 15, 2025
**Prepared for:** Phase 5.2 Implementation