# RadScheduler: IT Integration Guide

**For IT and Integration Teams**

---

## Document Purpose

This document provides IT teams with the information needed to evaluate RadScheduler's compatibility with your existing infrastructure and understand what's required for integration.

**What This Document Contains:**
- Integration compatibility with your systems (Fuji Synapse, athenahealth, Epic, etc.)
- What your team needs to configure for integration
- Security and compliance architecture overview
- Testing and validation approach
- Support model

**What This Document Does NOT Contain:**
- RadScheduler's internal implementation (SaaS platform managed by vendor)
- Vendor infrastructure details (not relevant to your integration)
- Deployment procedures (vendor-managed)

---

## Integration Overview

### Your Current Environment

**Typical Setup:**
```
Physician orders in EMR (athena/Epic/Cerner)
    ↓
HL7 ORM → Fuji Synapse RIS
    ↓
Staff manually schedules via phone
```

**With RadScheduler:**
```
Physician orders in EMR (athena/Epic/Cerner)
    ↓
HL7 ORM → Fuji Synapse RIS
    ↓
RIS → QIE → RadScheduler → SMS to Patient
    ↓
Patient self-schedules via SMS
    ↓
RadScheduler → QIE → RIS books appointment
    ↓
RIS → HL7 SIU^S12 → EMR (appointment appears in chart)
```

### What Changes in Your Environment

**Minimal Integration Footprint:**

**QIE Configuration (New):**
- 3 REST-to-HL7 channels for RadScheduler communication
- 1 HL7 routing channel for SIU messages to EMR (may already exist)

**Fuji Synapse RIS:**
- No changes required
- Existing HL7 interfaces continue operating normally

**Your EMR (athena/Epic/Cerner):**
- No changes required
- Receives standard HL7 SIU^S12 messages (may already be configured)

**Network:**
- RadScheduler is cloud-hosted (vendor-managed)
- Your QIE server makes outbound HTTPS calls to RadScheduler API
- No inbound firewall rules required on your network

---

## Fuji Synapse RIS Compatibility

### HL7 Interface Requirements

**Fuji Synapse Versions Supported:**
- Synapse PACS/RIS 5.x (current versions)
- Synapse PACS/RIS 4.x (with standard HL7 interface)

**HL7 Messages Used:**

**Queries (RadScheduler → QIE → Fuji):**
- **QRY/VXQ** - Query available locations for modality
- **QRY** - Query available appointment slots
- **Format:** Standard HL7 v2.3+ query messages

**Booking (RadScheduler → QIE → Fuji):**
- **ORM** - Order message for appointment booking
- **SIU** - Scheduling information update
- **Format:** Standard HL7 v2.3+ messages

**Responses (Fuji → QIE → RadScheduler):**
- **ACK** - Acknowledgment of successful booking
- **Response data** - Location lists, slot availability, confirmation numbers

**Fuji HL7 Interface:**
- Standard MLLP (Minimum Lower Layer Protocol)
- TCP/IP connectivity (typically port 6661 or configured port)
- No modifications to Fuji Synapse software required

### What Your Team Provides

**For Integration Setup:**
1. Fuji Synapse HL7 interface endpoint (hostname/IP, port)
2. HL7 message format documentation (typically standard Fuji spec)
3. Test environment credentials (for validation before production)
4. Calendar/location data structure (modality codes, facility identifiers)

**Fuji Configuration:**
- No changes required to Fuji Synapse
- Existing HL7 listener continues operating
- QIE acts as another HL7 client (like your EMR)

---

## EMR Integration (athenahealth, Epic, Cerner, etc.)

### Vendor-Agnostic Architecture

**Key Principle:** RadScheduler integrates with your **RIS**, not your **EMR**.

Your EMR (athenahealth, Epic, Cerner, etc.) is simply a **routing destination** for appointment confirmations. The same RadScheduler deployment works regardless of EMR vendor.

### How It Works

**Orders Flow from EMR (Existing Workflow):**
- Physician orders imaging in EMR
- EMR sends HL7 ORM → Fuji Synapse RIS
- **No changes to this workflow**

**Confirmations Flow Back to EMR (New via RadScheduler):**
- Patient schedules appointment via SMS
- RadScheduler books in RIS (via QIE)
- RIS sends HL7 SIU^S12 → EMR
- Appointment appears in patient chart automatically

### Supported EMR Vendors

**Validated Integration:**
- **athenahealth** (athenaOne, athenaNet) - HL7 v2.3+
- **Epic** (2015 and newer, Community Connect) - HL7 v2.3+

**Compatible (Standard HL7 SIU):**
- Cerner (PowerChart, Millennium)
- Allscripts (Sunrise, Professional)
- NextGen Healthcare
- eClinicalWorks
- Meditech
- **Any EMR supporting HL7 v2.3+ SIU messages**

### HL7 SIU Message Format

**Message Type:** SIU^S12 (New Appointment Booking Notification)

**Sample Message to EMR:**
```
MSH|^~\&|RIS|FACILITY|EMR|EMR|20250115090000||SIU^S12|MSG001|P|2.3
SCH|1|ORDER123||||||Scheduled||||||||||||||||ACTIVE
PID|1||MRN123456||Doe^John||19800101|M
RGS|1|A
AIS|1|A|XRAY|||20250115090000||30|min
NTE|1||X-ray scheduled via SMS self-scheduling
```

**What Your EMR Receives:**
- Appointment date/time
- Modality and location
- Patient demographics (from RIS)
- Confirmation/booking status

### What Your Team Provides

**For EMR Integration:**
1. EMR HL7 endpoint details (for SIU messages)
2. Facility/organization identifiers
3. Whether SIU routing already exists from RIS → EMR
4. Test environment for validation

**EMR Configuration:**
- Typically no changes required
- Many organizations already receive SIU from RIS
- If new, configure HL7 listener for SIU^S12 messages

---

## QIE (Qvera Interface Engine) Integration

### Why QIE?

QIE acts as the **universal translator** between RadScheduler (modern REST APIs) and your legacy HL7 systems (Fuji, EMR).

**Benefits:**
- **Vendor-agnostic** - Works with any RIS/EMR supporting HL7
- **Centralized audit** - QIE logs all integration traffic
- **No vendor lock-in** - Switch RIS or EMR without RadScheduler changes
- **Industry standard** - QIE certified for Epic, Cerner, athena, Fuji, and 100+ vendors

### QIE Channels Required

**Your QIE administrator configures:**

**Channel 1: Location Query**
- **Source:** HTTP REST listener - `GET /api/ris/locations?modality={modality}`
- **Destination:** Fuji Synapse HL7 query
- **Transform:** REST query parameters → HL7 QRY → HL7 response → JSON
- **Complexity:** Low (simple query/response pattern)

**Channel 2: Slot Availability Query**
- **Source:** HTTP REST listener - `GET /api/ris/available-slots?location={id}&modality={mod}&date={date}`
- **Destination:** Fuji Synapse HL7 query
- **Transform:** REST query → HL7 QRY → HL7 response → JSON
- **Complexity:** Low (query/response pattern)

**Channel 3: Appointment Booking**
- **Source:** HTTP REST listener - `POST /api/ris/book-appointment`
- **Destination:** Fuji Synapse HL7 booking (ORM or SIU)
- **Transform:** REST JSON → HL7 message → HL7 ACK → JSON confirmation
- **Complexity:** Moderate (booking logic, error handling)

**Channel 4: EMR SIU Routing (Optional)**
- **Source:** Fuji Synapse HL7 listener (SIU messages)
- **Destination:** EMR HL7 endpoint
- **Transform:** May already exist; route SIU to EMR
- **Complexity:** Low (if already configured for RIS → EMR)

### QIE Configuration Scope

**Estimated Time:** 8-12 hours for experienced QIE administrator

**What's Needed:**
- QIE version 3.4+ (standard HTTP REST listener support)
- HL7 v2.x support (standard in all QIE versions)
- Ability to create 3-4 new channels

**Hosting:**
- Use existing QIE instance (if already deployed)
- Or deploy dedicated QIE instance (vendor can assist)
- QIE can be on-premises or cloud-hosted (your choice)

### What Your Team Provides

**For QIE Setup:**
1. QIE administrator credentials (for channel configuration)
2. Fuji Synapse HL7 endpoint details
3. EMR HL7 endpoint details (for SIU routing)
4. Testing access to QIE test environment

**RadScheduler Provides:**
- REST API endpoint specifications (OpenAPI/Swagger format)
- Sample request/response payloads
- QIE channel templates (JavaScript transforms)
- Testing support during configuration

---

## Security & Compliance

### HIPAA Compliance Architecture

**Data Minimization:**
- RadScheduler stores **de-identified data only** (phone number hashes, not actual phone numbers)
- No patient names, diagnoses, or PHI in RadScheduler database
- PHI remains in your RIS and EMR (where it belongs)

**SMS Content (HIPAA-Compliant):**
- ✅ Procedure type only (e.g., "X-ray", "MRI")
- ✅ Location names (e.g., "Downtown Imaging")
- ✅ Appointment times
- ❌ No patient names, diagnoses, or clinical details

**Audit Logging:**
- 7-year retention per HIPAA requirements
- Logs metadata only (timestamps, message types, consent status)
- No message content with PHI stored

**Business Associate Agreements:**
- RadScheduler vendor executes BAA with your organization
- Twilio (SMS provider) - HIPAA-compliant with executed BAA
- All infrastructure vendors HIPAA-compliant

### Network Security

**Communication Encryption:**
- All API calls over HTTPS/TLS 1.2+
- HL7 messages via MLLP (standard healthcare protocol)
- SMS via Twilio (HIPAA-compliant messaging service)

**Authentication:**
- QIE ↔ RadScheduler: API key authentication (HTTPS)
- Twilio webhooks: Signature verification (SHA-256 HMAC)
- Order webhooks: Bearer token authentication

**Network Requirements:**

**Outbound (Your QIE Server):**
- HTTPS to RadScheduler API endpoints (vendor-provided URL)
- Port 443 outbound (standard HTTPS)

**No Inbound Access Required:**
- RadScheduler does not connect to your network
- All integration initiated from your QIE server

**Firewall Configuration:**
- Whitelist RadScheduler API domain (vendor-provided)
- Standard HTTPS egress rules (likely already permitted)

---

## Integration Testing & Validation

### Pre-Production Testing

**Phase 1: QIE Channel Testing**

**Your Team:**
- Configure QIE test channels pointing to Fuji test environment
- Validate REST → HL7 transformations
- Test error handling (invalid modality, no slots available, etc.)

**Vendor Support:**
- Provides REST API testing tools
- Reviews QIE channel configurations
- Assists with HL7 message debugging

**Success Criteria:**
- Location query returns Fuji locations correctly
- Slot availability query returns valid time slots
- Booking request creates appointment in Fuji test environment

**Phase 2: End-to-End SMS Testing**

**Your Team:**
- Provide test patient phone numbers
- Create test imaging orders in Fuji test environment
- Validate appointment appears in test EMR after SMS booking

**Vendor Support:**
- Configure test SMS flow
- Monitor integration logs
- Assist with troubleshooting

**Success Criteria:**
- SMS conversation completes successfully
- Appointment booked in Fuji RIS
- SIU message received by test EMR
- Appointment appears in test patient chart

**Phase 3: Production Pilot**

**Recommended Approach:**
- Start with single modality (X-ray only)
- Limit to 50-100 appointments
- Monitor error rates and patient feedback

**Success Criteria:**
- 95%+ successful booking rate
- Zero HIPAA violations or security incidents
- Positive patient feedback
- Staff comfortable with SMS workflow

---

## What Your Team Configures

### Summary of IT Responsibilities

**QIE Configuration:**
- [ ] Create 3 REST-to-HL7 channels (RadScheduler ↔ Fuji)
- [ ] Configure SIU routing channel (Fuji → EMR) - if not already exists
- [ ] Test channels in QIE test environment
- [ ] Promote to production after validation

**Network/Security:**
- [ ] Whitelist RadScheduler API domain in firewall (egress only)
- [ ] Provide QIE administrator credentials to vendor (for setup assistance)
- [ ] Review security documentation and sign BAA

**Testing/Validation:**
- [ ] Provide Fuji Synapse test environment access
- [ ] Provide EMR test environment access
- [ ] Identify test patient accounts
- [ ] Validate end-to-end SMS booking workflow

**Production Deployment:**
- [ ] Define pilot scope (modality, patient volume)
- [ ] Plan staff training
- [ ] Establish escalation procedures (if patient calls instead of using SMS)

### What Vendor Configures

**RadScheduler Platform (Vendor-Managed SaaS):**
- Cloud infrastructure (hosting, monitoring, backups)
- SMS integration (Twilio configuration)
- Database and application servers
- SSL certificates and domain management
- Security updates and patches

**Your team does NOT manage:**
- RadScheduler application deployment
- Infrastructure provisioning
- Software updates or maintenance
- Database administration

---

## Support Model

### Integration Support

**During Implementation:**
- Dedicated integration engineer assigned to your project
- QIE channel configuration assistance
- HL7 message format validation
- Testing support and troubleshooting

**Response Times:**
- Critical integration issues: 2 business hours
- Non-critical questions: 4 business hours

### Production Support

**Tier 1: Patient Issues**
- Vendor handles patient-facing SMS issues
- Your staff escalates only if patient calls instead of texting

**Tier 2: Integration Issues**
- QIE channel failures
- HL7 message errors
- Fuji/EMR connectivity problems
- Vendor + your IT team collaborate on resolution

**Tier 3: Platform Issues**
- RadScheduler infrastructure failures
- SMS delivery problems
- Vendor manages entirely (SaaS platform)

---

## Common IT Questions

### Q: Does this require changes to our Fuji Synapse RIS?
**A:** No. Fuji continues operating normally. QIE acts as another HL7 client querying Fuji's existing HL7 interface. No software modifications or upgrades required.

### Q: Does this require changes to our EMR?
**A:** Typically no. Most organizations already receive HL7 SIU messages from their RIS. If not, your EMR team configures an HL7 listener for SIU^S12 messages (standard functionality in all major EMRs).

### Q: What if we don't have QIE?
**A:** QIE or equivalent interface engine (Mirth, Rhapsody, etc.) is required for HL7 translation. If you don't have one, vendor can assist with QIE deployment or recommend alternatives.

### Q: Can we use our existing QIE instance?
**A:** Yes. RadScheduler requires 3-4 additional channels, which is minimal overhead for most QIE deployments.

### Q: What if QIE goes down?
**A:** RadScheduler gracefully degrades. Patients receive SMS message to "call scheduling line" instead of self-scheduling. Orders still flow to RIS normally; scheduling reverts to phone-based workflow.

### Q: Where is RadScheduler hosted?
**A:** Cloud-hosted SaaS platform (vendor-managed). Your data never leaves HIPAA-compliant infrastructure. Geographic hosting location available upon request.

### Q: Can we host RadScheduler on-premises?
**A:** Standard deployment is cloud SaaS. On-premises deployment available for enterprise clients with specific regulatory requirements (discuss with vendor).

### Q: How do we troubleshoot failed bookings?
**A:** Multi-layer logging:
- Your QIE: HL7 message logs (you have full access)
- Fuji Synapse: Appointment booking logs (your existing logs)
- RadScheduler: Integration logs (vendor provides access for your team)
- Correlation IDs link transactions across all systems

### Q: What's the disaster recovery plan?
**A:** Vendor-managed (SaaS platform). Details available under NDA. Your integration infrastructure (QIE, Fuji, EMR) disaster recovery plans remain unchanged.

### Q: How do we control which modalities are enabled for SMS scheduling?
**A:** Configuration-based modality control. Enable X-ray initially, add ultrasound/mammography after validation, then CT/MR/PET after pre-authorization workflows optimized. Changes via configuration (no code deployment).

### Q: Does this work with Epic/Cerner/[other EMR]?
**A:** Yes, if your EMR supports standard HL7 SIU messages (all major EMRs do). Integration is with your RIS (Fuji Synapse). QIE routes confirmations to whatever EMR you use. Validated with athenahealth and Epic; compatible with any HL7-capable EMR.

---

## Next Steps for IT Team

### 1. Initial Technical Review
- Review this document with your integration team
- Identify QIE administrator for channel configuration
- Gather Fuji Synapse and EMR endpoint documentation
- Prepare questions for technical discovery call

### 2. Technical Discovery Call
**Bring to the call:**
- Fuji Synapse version and HL7 interface documentation
- EMR integration details (athena/Epic/Cerner)
- QIE administrator (if already deployed)
- Network/security team representative

**We'll discuss:**
- QIE channel configuration approach
- Fuji HL7 message formats
- EMR SIU routing requirements
- Testing environment access
- Timeline and milestones

### 3. Environment Assessment
- Provide test QIE access for channel configuration
- Share Fuji test environment credentials
- Share EMR test environment details
- Identify test patient accounts for validation

### 4. Pilot Planning
- Define pilot scope (modality, patient volume)
- Establish success criteria
- Plan staff training
- Create escalation procedures

---

## Contact Information

**Technical Integration Questions:**
[Integration team email]

**Security & Compliance Questions:**
[Security team email]

**Schedule Technical Discovery Call:**
[Scheduling link]

---

**RadScheduler Integration Team**

We understand healthcare IT integrations require careful coordination. Our team has deep experience with HL7, QIE, Fuji Synapse, and major EMR vendors. We're committed to making this integration smooth and minimally disruptive to your operations.

---

*This document provides integration requirements and compatibility information. Detailed vendor implementation specifications and architecture are proprietary and provided under NDA after contract execution.*
