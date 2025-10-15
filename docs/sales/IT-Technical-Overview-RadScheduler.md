# RadScheduler: Technical Integration Overview

**For IT and Integration Teams**

---

## Document Purpose

This document provides technical teams with the information needed to evaluate RadScheduler's compatibility with existing infrastructure, assess integration requirements, and understand security/compliance architecture.

**What This Document Contains:**
- Integration standards and compatibility
- Security and HIPAA compliance technical details
- Infrastructure and deployment requirements
- Testing and validation procedures

**What This Document Does NOT Contain:**
- Proprietary implementation details
- Source code or algorithms
- Detailed system architecture diagrams
- Vendor-specific configuration secrets

---

## Integration Architecture Overview

### High-Level Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────┐     ┌─────────────┐
│   athena    │────▶│ Fuji Synapse │────▶│   QIE   │────▶│RadScheduler │
│    (EHR)    │     │     (RIS)    │     │Interface│     │ (SMS Layer) │
└─────────────┘     └──────┬───────┘     │ Engine  │     └──────┬──────┘
                           │              └─────────┘            │
                           │                                     │
                           │         HL7 SIU                    SMS
                           ◀─────────────────────────────────────┤
                                                                 │
                                                          ┌──────▼──────┐
                                                          │   Patient   │
                                                          │   (Mobile)  │
                                                          └─────────────┘
```

**Key Integration Points:**
1. **RIS → QIE**: HL7 order messages (ORM), results (ORU)
2. **QIE → RadScheduler**: REST API calls (locations, slots, booking)
3. **RadScheduler → Patient**: SMS via Twilio
4. **RIS → athena**: HL7 SIU^S12 appointment confirmations

---

## Compatibility with Your Systems

### Fuji Synapse RIS Integration

**Challenge:** Fuji Synapse uses HL7 v2.x messaging, not REST APIs

**Solution:** Qvera Interface Engine (QIE) acts as protocol translator

**Technical Details:**

**QIE Channels Required (3):**

1. **Location Query Channel**
   - **Source**: HTTP REST endpoint - `GET /api/ris/locations?modality={modality}`
   - **Transform**: Query parameters → HL7 QRY or VXQ message
   - **Destination**: Fuji Synapse HL7 interface (MLLP)
   - **Response Transform**: HL7 response → JSON `{"locations": [...]}`

2. **Slot Availability Channel**
   - **Source**: HTTP REST endpoint - `GET /api/ris/available-slots?location={id}&modality={mod}&date={date}`
   - **Transform**: Query → HL7 QRY message
   - **Destination**: Fuji Synapse calendar database query
   - **Response Transform**: HL7 availability data → JSON `{"slots": [...]}`

3. **Appointment Booking Channel**
   - **Source**: HTTP REST endpoint - `POST /api/ris/book-appointment`
   - **Transform**: JSON booking request → HL7 ORM or SIU message
   - **Destination**: Fuji Synapse appointment booking
   - **Response Transform**: HL7 ACK → JSON confirmation

**Why This Works:**
- QIE is vendor-certified for Fuji Synapse integration
- No modifications to Fuji required
- Standard HL7 v2.3+ message formats
- QIE handles all protocol complexity

**Fuji Synapse Version Compatibility:**
- **Synapse 5.x**: Fully compatible (HL7 v2.3+)
- **Synapse 4.x**: Compatible with minor QIE configuration adjustments
- **HTML5 interface**: No impact (integration is HL7-based, not UI)

**HL7 Messages Used:**
- **ORM (Order Message)**: For appointment booking
- **QRY/VXQ (Query)**: For calendar/slot availability queries
- **ACK (Acknowledgment)**: For booking confirmations
- **SIU (Scheduling Information)**: Outbound to athena (optional)

---

### athenahealth Integration

**Integration Pattern:** HL7 SIU^S12 (Scheduling Notification)

**Data Flow:**
```
RadScheduler books appointment
    ↓
Fuji Synapse RIS confirms booking
    ↓
RIS generates HL7 SIU^S12 message
    ↓
QIE routes SIU to athenahealth
    ↓
athena updates patient chart with appointment
```

**athena Integration Requirements:**
- **HL7 Version**: 2.3 or higher (athena supports 2.3-2.5.1)
- **Message Type**: SIU^S12 (New Appointment Booking Notification)
- **Delivery Method**: MLLP (Minimum Lower Layer Protocol) or athena's HL7 Interface API
- **Authentication**: athena API credentials (if using API) or MLLP connection credentials

**SIU^S12 Message Structure (Sample):**
```
MSH|^~\&|RADORDERPAD|FACILITY|ATHENA|ATHENA|20250115090000||SIU^S12|MSG001|P|2.3
SCH|1|ORDER123||||||Scheduled||||||||||||||||ACTIVE
PID|1||MRN123456||Doe^John||19800101|M
RGS|1|A
AIS|1|A|XRAY|||20250115090000||30|min
NTE|1||X-ray scheduled at Downtown Imaging
```

**What RadScheduler Provides:**
- Appointment details (modality, location, time)
- Confirmation numbers
- Patient identifiers (MRN, phone hash)

**What Your Team Configures:**
- athena HL7 endpoint details
- Facility/organization identifiers
- Message routing rules in QIE

**athena Version Compatibility:**
- **athenaOne**: Fully compatible (standard HL7 SIU support)
- **athenaNet**: Fully compatible
- **athenahealth API**: Can use REST API instead of HL7 if preferred

---

## Vendor-Agnostic Architecture: EMR Independence

### The QIE Advantage

**Key Architectural Principle:** RadScheduler integrates with your **RIS**, not your **EMR**.

Your EMR (athenahealth, Epic, Cerner, etc.) is just a **routing destination** in QIE. The same RadScheduler deployment works regardless of EMR vendor.

### How Vendor-Agnosticism Works

**RadScheduler Layer:**
- Sends/receives REST API calls to QIE
- Vendor-neutral JSON data format
- No EMR-specific code

**QIE Translation Layer:**
- Accepts REST from RadScheduler
- Translates to HL7 for RIS (Fuji Synapse)
- Translates RIS responses back to JSON for RadScheduler
- Routes HL7 SIU messages to correct EMR endpoint

**EMR Layer:**
- Receives standard HL7 SIU^S12 messages
- Epic, Cerner, athena all accept same HL7 format
- No EMR modifications required

### Supported EMR Vendors

**Tested/Validated:**
- athenahealth (athenaOne, athenaNet)
- Epic (2015+, Community Connect, on FHIR)

**Compatible (Standard HL7 SIU):**
- Cerner (PowerChart, Millennium)
- Allscripts (Sunrise, Professional, TouchWorks)
- NextGen Healthcare
- eClinicalWorks
- Meditech
- Any EMR supporting HL7 v2.3+ SIU messages

**QIE Handles:**
- Message format differences (HL7 2.3 vs 2.5.1 vs 2.7)
- Vendor-specific field requirements
- Character encoding variations
- Acknowledgment handling (ACK/NACK)

### Multi-EMR Scenarios

**Scenario 1: Single Practice, One EMR**
- Configure QIE with single outbound SIU channel → your EMR
- RadScheduler unaware of EMR vendor

**Scenario 2: Multi-Site Organization, Different EMRs**
- Site A uses Epic, Site B uses athena
- QIE routes SIU to correct EMR based on facility identifier
- Single RadScheduler instance serves both sites

**Scenario 3: EMR Migration**
- Practice switches from athena to Epic
- RadScheduler code: **Zero changes**
- QIE configuration: Update routing channel to Epic endpoint
- Testing: Validate SIU messages reach Epic correctly

### Technical Benefits

**No Custom Code Per Vendor:**
- Same RadScheduler codebase for all clients
- No "Epic version" vs "athena version"
- Faster deployments, easier maintenance

**Future-Proof:**
- New EMR vendor? Configure QIE channel, done
- EMR upgrades (e.g., Epic 2023 → 2024)? QIE handles compatibility
- RadScheduler deployment remains untouched

**Vendor Certification:**
- QIE is certified by Epic, Cerner, athena, Allscripts
- Standard HL7 interfaces mean universal compatibility
- No vendor-specific approval required for RadScheduler

### What Your Team Configures

**For Any EMR:**
1. QIE outbound channel to EMR's HL7 endpoint
2. Facility/organization identifiers
3. EMR-specific field mappings (if required)
4. Acknowledgment handling rules

**RadScheduler Configuration:**
- Same regardless of EMR vendor
- REST API endpoint to QIE (standard across all deployments)
- No EMR-specific settings

### Bottom Line for IT

**Question:** "Does this work with our EMR (Epic/Cerner/athena/etc.)?"

**Answer:** Yes, if your EMR accepts standard HL7 SIU messages. The integration is with your RIS (Fuji Synapse). QIE routes appointment confirmations to whatever EMR you use. We've validated with athenahealth and Epic; all other HL7-capable EMRs work the same way.

---

## QIE (Qvera Interface Engine) Requirements

**Why QIE?**
- Industry-standard healthcare integration platform
- Handles HL7 ↔ REST ↔ Database transformations
- Certified for major RIS/EHR vendors
- Provides centralized audit logging
- No vendor lock-in (standard HL7 interfaces)

**QIE Configuration Scope:**

**3 HTTP REST Channels** (receive from RadScheduler, transform to HL7):
- Location query channel
- Slot availability channel
- Appointment booking channel

**1 HL7 Outbound Channel** (optional - athena SIU notifications):
- SIU message routing to athena

**Configuration Complexity:**
- **Location/Slots queries**: Simple HL7 QRY → database query transforms
- **Booking channel**: Moderate complexity (ORM generation, ACK handling)
- **Total configuration time**: 8-12 hours for experienced QIE administrator

**QIE Hosting:**
- Can run on existing QIE instance (if already deployed)
- Or deploy dedicated QIE instance (recommended for isolation)
- QIE can be on-premises or cloud-hosted

**QIE Version Requirements:**
- **Version 3.4+**: Fully compatible
- **HTTP REST listener**: Required (standard QIE feature)
- **HL7 v2.x support**: Required (standard)

---

## Security & HIPAA Compliance Architecture

### Data Protection Strategy

**Phone Number Hashing (De-identification):**
- All phone numbers hashed with SHA-256 before storage
- **No plaintext phone numbers stored anywhere** in RadScheduler database
- Hash algorithm: `SHA-256(phone_number + salt)`
- One-way hash (cannot reverse to get phone number)
- Enables audit compliance without storing PHI

**Database Schema (PostgreSQL):**
```sql
-- Example: patient_sms_consents table
CREATE TABLE patient_sms_consents (
  id SERIAL PRIMARY KEY,
  phone_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash, not actual phone
  consent_given BOOLEAN NOT NULL,
  consent_timestamp TIMESTAMP NOT NULL,
  consent_method VARCHAR(50) NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Why This Matters:**
- RadScheduler database contains **zero PHI** (phone hashes are de-identified per HIPAA Safe Harbor)
- Audit logs track activity without revealing patient identities
- Data breach of RadScheduler database does not constitute HIPAA breach (no PHI)

### SMS Message Content Rules

**What's Transmitted in SMS (HIPAA-Compliant):**
- ✅ Procedure type only (e.g., "X-ray", "MRI")
- ✅ Location names (e.g., "Downtown Imaging")
- ✅ Appointment times
- ✅ Confirmation codes

**What's NEVER in SMS:**
- ❌ Patient names
- ❌ Diagnoses or clinical indications
- ❌ ICD-10 or CPT codes
- ❌ Referring provider details beyond practice name

**Message Example (Compliant):**
```
You have a new imaging order. Reply YES to schedule via text.
SMS not secure. Msg rates apply. Reply STOP to opt out.
```

### Network Security

**HTTPS/TLS Encryption:**
- All API communication over TLS 1.2+
- SSL certificate from trusted CA (Let's Encrypt)
- Domain: `scheduler.radorderpad.com`

**Authentication Methods:**

1. **Twilio Webhooks**: Signature verification (SHA-256 HMAC)
2. **Order Webhooks**: Bearer token authentication
3. **QIE REST Endpoints**: API key authentication

**Infrastructure Security:**
- AWS EC2 instance with security group restrictions
- Nginx reverse proxy (rate limiting, timeout protection)
- PM2 process manager (automatic restart, log management)
- PostgreSQL with SSL connections required

### Audit Logging

**Compliance Requirement:** 7-year retention per HIPAA

**What's Logged:**
- Every SMS sent/received (metadata only, not content)
- Hashed phone number
- Message type and direction
- Timestamp
- Consent status
- Session ID

**What's NOT Logged:**
- Actual message content containing PHI
- Plaintext phone numbers
- Patient names or identifiers

**Audit Log Schema:**
```sql
CREATE TABLE sms_audit_log (
  id SERIAL PRIMARY KEY,
  phone_hash VARCHAR(64) NOT NULL,              -- De-identified
  message_type VARCHAR(50) NOT NULL,            -- e.g., 'consent_request'
  message_direction VARCHAR(10) NOT NULL,       -- 'inbound' or 'outbound'
  consent_status VARCHAR(20),
  timestamp TIMESTAMP NOT NULL,
  session_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sms_audit_timestamp ON sms_audit_log(timestamp);
CREATE INDEX idx_sms_audit_phone_hash ON sms_audit_log(phone_hash);
```

**Retention Policy:**
- Automated cleanup job runs daily
- Deletes audit records older than 2,555 days (7 years)
- Session data expires after 24 hours (not part of audit log)

### Business Associate Agreements (BAAs)

**Required BAAs:**
- **Twilio** (SMS provider) - Free with HIPAA-eligible account
- **AWS** (hosting infrastructure) - Standard AWS BAA
- **RadScheduler** - Executed between your organization and vendor

**Vendor HIPAA Compliance:**
- All infrastructure vendors are HIPAA-compliant
- Signed BAAs in place before production deployment
- Annual compliance audits and renewals

---

## Infrastructure Requirements

### RadScheduler Hosting

**Current Deployment:**
- **Platform**: AWS EC2 instance (Ubuntu Linux)
- **Process Manager**: PM2 with auto-restart
- **Web Server**: Nginx reverse proxy
- **Database**: PostgreSQL (can share existing RDS instance)
- **SSL**: Let's Encrypt with auto-renewal

**Deployment Options:**

**Option 1: Cloud-Hosted (Recommended)**
- Vendor manages infrastructure
- 99.9% uptime SLA
- Automatic backups and monitoring
- Your team has read-only audit access

**Option 2: On-Premises Deployment**
- Deploy on your infrastructure
- Full control over servers and data
- Your team manages updates and monitoring
- Higher initial setup complexity

### Resource Requirements

**Compute:**
- **CPU**: 2 vCPUs minimum
- **RAM**: 4GB minimum
- **Storage**: 20GB SSD (database grows ~10MB/month per 1000 appointments)

**Network:**
- **Bandwidth**: Minimal (SMS is low bandwidth)
- **Ports**: 443 (HTTPS), 3010 (application - internal only)

**Database (PostgreSQL):**
- **Version**: 12+ (any modern PostgreSQL)
- **Storage**: Shared with existing database acceptable
- **3 new tables**: patient_sms_consents, sms_audit_log, sms_conversations
- **Estimated size**: ~50MB initial, grows ~10MB/month (1000 appointments)

### External Dependencies

**Twilio SMS Platform:**
- **Account Type**: HIPAA-eligible business account
- **SMS Rate**: ~$0.0075 per message
- **Expected Volume**: 6 messages per appointment
- **Monthly Cost**: 1000 appointments = $45/month

**Domain & SSL:**
- **Subdomain Required**: e.g., `scheduler.yourpractice.com`
- **DNS Configuration**: A record pointing to RadScheduler server
- **SSL Certificate**: Automatic via Let's Encrypt

---

## Testing & Validation

### Pre-Production Testing Phases

**Phase 1: Integration Testing (QIE Configuration)**
- Configure QIE channels with test endpoints
- Send test HL7 messages to Fuji Synapse test environment
- Validate HL7 message structure and responses
- Verify appointment creation in RIS test calendar

**Test Scenarios:**
1. Query locations for X-ray modality
2. Query available slots for specific location/date
3. Book test appointment and verify RIS confirmation
4. Cancel test appointment

**Phase 2: End-to-End SMS Testing**
- Use test Twilio account (sandbox mode)
- Send test SMS to developer phones
- Simulate full conversation flow:
  - Consent request → YES reply
  - Location selection → Choose option 1
  - Time slot selection → Choose option 2
  - Confirmation message received

**Phase 3: athena Integration Testing**
- Send test SIU^S12 message to athena test environment
- Verify appointment appears in test patient chart
- Confirm all required fields populated correctly

### Production Pilot Program

**Recommended Approach:**
- Start with single modality (e.g., X-ray only)
- Limit to 50-100 test appointments
- Use real patient phones but non-critical appointments
- Monitor error rates and patient feedback
- Validate audit logs and compliance measures

**Success Criteria:**
- 95%+ successful booking rate
- Zero HIPAA violations or security incidents
- Positive patient feedback (>80% satisfaction)
- Staff comfortable with escalation procedures

---

## Modality Control & Phased Rollout

### Overview

RadScheduler supports granular control over which imaging modalities are enabled for SMS self-scheduling. This allows phased rollout based on operational readiness and risk tolerance.

### Technical Implementation

**Configuration Approach:**

Modality enablement is controlled via simple configuration table or environment settings—no code deployment required to enable/disable modalities.

**DICOM Standard Modality Codes:**
- `CR` - Computed Radiography (X-ray film)
- `DX` - Digital Radiography (X-ray digital)
- `US` - Ultrasound
- `MG` - Mammography
- `CT` - Computed Tomography
- `MR` - Magnetic Resonance (MRI)
- `PT` - Positron Emission Tomography (PET scan)
- `NM` - Nuclear Medicine
- `RF` - Radiofluoroscopy
- `XA` - X-ray Angiography

**Runtime Behavior:**

When an order webhook arrives with a modality code:
1. System checks: "Is this modality enabled for SMS scheduling?"
2. **If YES**: Normal SMS conversation flow proceeds
3. **If NO**: SMS message: "Please call [scheduling number] to schedule this appointment"

**Benefits:**
- Orders still flow through system (audit trail maintained)
- Patients receive immediate response (not left waiting)
- Graceful degradation to phone scheduling for disabled modalities

### Recommended Rollout Strategy

**Phase 1: Low-Risk General Radiography**
- **Modalities**: CR, DX (X-ray)
- **Rationale**: Highest volume, no prep requirements, straightforward scheduling
- **Timeline**: Weeks 1-2 of production deployment
- **Validation**: 100+ successful appointments before expanding

**Phase 2: Moderate Complexity**
- **Modalities**: US (Ultrasound), MG (Mammography)
- **Rationale**: Moderate complexity, minimal prep, different appointment patterns
- **Timeline**: Weeks 3-4 after X-ray validation
- **Validation**: Staff comfortable with workflow, <2% booking error rate

**Phase 3: Advanced Imaging (Gated)**
- **Modalities**: CT, MR, PT (and other high-complexity modalities)
- **Rationale**: Require insurance pre-authorization; should not enable until pre-auth workflow optimized
- **Gate**: Only enable after RadOrderPad demonstrates ≥98% automated pre-authorization approval rate
- **Timeline**: Weeks 6-8+ after pre-authorization workflow optimization
- **Validation**: Review 30-day trailing pre-auth success metrics before enabling

### Pre-Authorization Dependency (CT/MR/PT)

**Business Logic:**

Advanced imaging modalities typically require insurance pre-authorization. Enabling SMS self-scheduling before the pre-authorization workflow is mature creates risk:

**Risk Scenario (Pre-Auth Not Optimized):**
1. Patient self-schedules CT scan via SMS
2. Order submitted to insurance for pre-auth
3. Pre-auth denied (e.g., medical necessity not documented)
4. Appointment must be cancelled
5. Patient frustration, wasted appointment slot, staff rework

**Mitigation Strategy:**

CT, MR, and PT modalities should only be enabled after RadOrderPad's automated pre-authorization workflow demonstrates:
- **≥98% auto-approval rate** over trailing 30-day period
- Minimal manual review required
- Rare denials or rejections

**Implementation:**
- IT team manually reviews RadOrderPad pre-auth metrics
- When threshold met, team decision to enable advanced modalities
- Configuration change (no code deployment)
- Audit log records who enabled and when

### Configuration Options

**Option 1: Environment Variables (Simplest)**
```bash
# Enable specific modalities
ENABLED_MODALITIES=CR,DX,US,MG

# Orders with CT/MR/PT will receive "call to schedule" message
```

**Option 2: Database Configuration Table (Recommended)**
```sql
CREATE TABLE scheduling_config (
  id SERIAL PRIMARY KEY,
  modality VARCHAR(2) NOT NULL UNIQUE,      -- DICOM code
  modality_name VARCHAR(50),                 -- Human-readable
  enabled BOOLEAN DEFAULT FALSE,
  notes TEXT,                                -- "Enabled 2025-10-20 after 98% preauth"
  enabled_at TIMESTAMP,
  enabled_by VARCHAR(100),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Option 3: Administrative Interface (Future Enhancement)**
- Web-based toggle interface
- Real-time enable/disable with audit trail
- View current status and configuration

**Current Implementation:**
- Modality filtering can be configured via either Option 1 or Option 2
- Both approaches support rapid enable/disable without code deployment
- Audit trail available via database logs or configuration file version control

### Operational Advantages

**Risk Management:**
- Validate SMS workflow with low-risk procedures before expanding
- Isolate issues to specific modalities (disable CT if problems, X-ray continues)
- Staff learns one modality at a time
- Measure success metrics per modality before enabling next

**Emergency Disable:**
- If issues arise with specific modality (e.g., CT bookings failing), disable instantly
- Other modalities continue operating normally
- No code deployment, no system restart required

**Business Flexibility:**
- Enable modalities based on business readiness, not technical limitations
- Align with staff capacity (don't overwhelm schedulers with all modalities at once)
- Coordinate with marketing (announce X-ray SMS scheduling before enabling MRI)

### Integration with RIS

**No RIS Configuration Required:**

Modality enablement is purely a RadScheduler configuration. From the RIS perspective:
- All orders continue flowing via HL7 ORM messages (no change)
- RadScheduler decides whether to initiate SMS flow or defer to phone scheduling
- If SMS is disabled for a modality, staff schedules via RIS manually (existing workflow)

**This means:**
- No Fuji Synapse changes required
- No QIE reconfiguration needed
- No athena integration changes
- Pure RadScheduler configuration change

### Audit Trail

**What's Logged:**
- Modality configuration changes (who enabled, when, why)
- Orders received per modality (enabled vs. disabled)
- SMS sent vs. "call to schedule" messages per modality
- Success rates per modality

**Reporting:**
- Modality adoption rates (% patients choosing SMS vs. calling)
- Success rates by modality (completed bookings vs. errors)
- Volume metrics (appointments per modality per day/week)

This data informs decisions about when to enable additional modalities.

---

## Support & Maintenance

### Vendor Support Model

**Tier 1 Support:**
- Patient-facing issues (SMS not received, wrong appointment time)
- Escalation path: RadScheduler support team
- Response time: 4 business hours
- Resolution: 24 hours for critical issues

**Tier 2 Support:**
- Integration issues (QIE failures, HL7 errors)
- Escalation path: Integration team with QIE access
- Response time: 2 business hours
- Resolution: 8 hours for critical issues

**Tier 3 Support:**
- Infrastructure failures (server down, database issues)
- Escalation path: Platform engineering team
- Response time: 1 hour (critical systems)
- Resolution: 4 hours maximum for production outages

### Monitoring & Alerting

**What's Monitored:**
- Application uptime (health check endpoint)
- Database connectivity
- QIE channel status
- SMS delivery success rate
- Error rates and exceptions

**Alert Thresholds:**
- Application down for >2 minutes
- Database connection failures
- SMS delivery failure rate >5%
- Error rate >1% of total traffic

**Alert Destinations:**
- Email to operations team
- PagerDuty/Opsgenie integration (optional)
- Slack channel (optional)

### Maintenance Windows

**Routine Maintenance:**
- Scheduled: Monthly (2nd Tuesday, 2am-4am)
- Typical duration: 30 minutes
- Impact: Zero downtime (rolling updates)

**Emergency Maintenance:**
- Security patches applied within 24 hours of disclosure
- Critical bug fixes deployed same-day
- Advance notification via email (except zero-day vulnerabilities)

---

## Integration Timeline & Milestones

### Week 1-2: Discovery & Planning
- **IT Team Activities:**
  - Review integration requirements
  - Provide QIE access credentials
  - Share Fuji Synapse HL7 interface documentation
  - Provide athena integration details
  - Identify test environment endpoints

- **Vendor Activities:**
  - Review your technical environment
  - Design QIE channel configurations
  - Prepare test plan

### Week 3-4: QIE Configuration & Testing
- **IT Team Activities:**
  - Create QIE test channels (with vendor guidance)
  - Configure HL7 message routing
  - Set up test Fuji Synapse orders
  - Validate HL7 responses

- **Vendor Activities:**
  - Provide QIE channel templates
  - Support HL7 message debugging
  - Test REST ↔ HL7 transformations

**Milestone:** QIE channels operational in test environment

### Week 5-6: SMS Integration & Pilot Setup
- **IT Team Activities:**
  - Configure Twilio account with HIPAA BAA
  - Set up DNS for RadScheduler subdomain
  - Whitelist Twilio IPs (if firewall restrictions)
  - Create test patient accounts

- **Vendor Activities:**
  - Deploy RadScheduler to staging environment
  - Configure SMS templates
  - Conduct end-to-end testing
  - Train staff on pilot procedures

**Milestone:** End-to-end SMS flow working in test environment

### Week 7-8: Production Deployment & Pilot
- **IT Team Activities:**
  - Promote QIE channels to production
  - Monitor integration logs
  - Escalate issues to vendor support

- **Vendor Activities:**
  - Deploy to production environment
  - Enable pilot program (single modality)
  - Monitor first 50 appointments
  - Provide daily status reports

**Milestone:** 50+ successful appointments scheduled via SMS

### Week 9+: Full Rollout
- **IT Team Activities:**
  - Enable all imaging modalities
  - Monitor system performance
  - Review audit logs monthly

- **Vendor Activities:**
  - Scale to full production volume
  - Optimize performance based on usage patterns
  - Provide ongoing support

---

## Technical FAQs

### Q: Does this require changes to Fuji Synapse?
**A:** No. QIE acts as the integration layer. Fuji Synapse continues operating exactly as it does today. QIE translates RadScheduler's REST API calls into HL7 messages Fuji understands.

### Q: What if QIE goes down?
**A:** RadScheduler detects QIE failures and gracefully degrades to phone scheduling. SMS messages instruct patients to call scheduling line. No appointments are lost; they revert to manual scheduling workflow.

### Q: Can we use our existing QIE instance?
**A:** Yes, if you already have QIE deployed for other integrations. RadScheduler requires 3-4 additional channels, which is minimal overhead.

### Q: How do we handle appointments that span multiple locations?
**A:** RadScheduler queries all locations from Fuji via QIE. If a patient selects a location without availability, they're offered alternative locations automatically.

### Q: What about appointment cancellations or rescheduling?
**A:** Initial version supports booking only. Cancellations/rescheduling remain phone-based. Future versions can add SMS-based cancellation with staff approval workflow.

### Q: How does this impact our RIS reporting?
**A:** No impact. Appointments booked via RadScheduler appear identical to staff-booked appointments in Fuji. All standard reports (utilization, revenue, etc.) include SMS-scheduled appointments.

### Q: What data does RadScheduler store long-term?
**A:** Only de-identified audit logs (hashed phone numbers, timestamps, message types). No PHI is stored. Audit logs retained for 7 years per HIPAA; all other data expires within 24 hours.

### Q: Can we customize the SMS message templates?
**A:** Yes, within HIPAA constraints. Messages must not include PHI (patient names, diagnoses) but can be customized for tone, branding, and specific instructions.

### Q: What happens if a patient texts outside business hours?
**A:** RadScheduler operates 24/7. Patients can schedule anytime. If QIE/Fuji are offline (unusual), RadScheduler queues the request and processes when systems are back online.

### Q: How do we troubleshoot failed bookings?
**A:** Comprehensive logging at every layer:
- RadScheduler logs: API calls, SMS delivery
- QIE logs: HL7 message transformations
- Fuji logs: Appointment booking confirmations
- Centralized audit trail with correlation IDs across all systems

### Q: What's the disaster recovery plan?
**A:** Cloud-hosted option includes:
- Daily database backups (30-day retention)
- Infrastructure-as-code (rapid rebuild)
- Automated monitoring and failover
- RTO: 2 hours, RPO: 24 hours

### Q: How do we control which modalities are enabled for SMS scheduling?
**A:** Simple configuration table or environment variable controls which DICOM modality codes are enabled. No code deployment required. Example: Enable CR/DX (X-ray) initially, add US/MG after validation, then enable CT/MR/PT after pre-authorization workflow is optimized. Orders for disabled modalities automatically receive "please call to schedule" message—graceful degradation with no system failures.

### Q: Why would we wait to enable CT/MR/PT for SMS scheduling?
**A:** Advanced imaging requires insurance pre-authorization. If your pre-auth workflow isn't achieving 98%+ auto-approval, patients risk scheduling appointments that later get denied. This creates poor patient experience and wasted slots. Recommendation: Validate RadOrderPad's pre-auth approval rate before enabling SMS self-scheduling for high-risk modalities. This is a business decision, not a technical limitation.

---

## Next Steps for IT Team

### 1. Initial Technical Review
- Review this document with your team
- Identify any integration concerns specific to your environment
- Prepare questions for technical discovery call

### 2. Technical Discovery Call
**Bring to the call:**
- Fuji Synapse version number and HL7 interface documentation
- athenahealth integration details (HL7 or API)
- QIE administrator (if already deployed)
- Network/security team representative

**We'll discuss:**
- Detailed integration architecture
- QIE channel configuration approach
- Security and firewall requirements
- Timeline and resource needs

### 3. Environment Assessment
- Provide access to test QIE instance (or plan QIE deployment)
- Share test Fuji Synapse environment credentials
- Share athena test environment details
- Identify test patient accounts

### 4. Pilot Planning
- Define pilot scope (modality, patient volume)
- Establish success criteria
- Plan staff training and escalation procedures

---

## Contact Information

**Technical Integration Questions:**
[Integration team email]

**Security & Compliance Questions:**
[Security team email]

**Schedule Technical Discovery Call:**
[Scheduling link]

---

**RadScheduler Technical Team**

We understand healthcare IT integrations are complex. Our team has deep experience with HL7, QIE, and major RIS/EHR vendors. We're here to make this integration as smooth as possible while maintaining the highest security and compliance standards.

---

*This document contains technical information sufficient for integration planning. Detailed implementation specifications, source code, and proprietary algorithms are provided under NDA after contract execution.*
