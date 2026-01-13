# Multi-Provider SMS Failover Analysis

**Commit:** a245138
**Date:** January 12, 2026
**Files Changed:** 14 (6,164 insertions)

---

## Summary

This commit implements a sophisticated multi-provider SMS abstraction layer with automatic failover. It is a **RECENT IMPLEMENTATION** (January 12, 2026) and is **NOT COVERED** by any existing provisional patent.

---

## Architecture

```
                    ┌─────────────────┐
                    │   SMSService    │
                    │   (Main Entry)  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐          ┌─────────────────┐
    │  TwilioProvider │          │  TelnyxProvider │
    │   (Primary)     │          │   (Failover)    │
    └────────┬────────┘          └────────┬────────┘
             │                            │
             │  If FAILOVER_ERROR ───────▶│
             │                            │
             ▼                            ▼
        ┌──────────┐              ┌──────────┐
        │  Twilio  │              │  Telnyx  │
        │   API    │              │   API    │
        └──────────┘              └──────────┘
```

---

## Key Technical Innovations

### 1. Error Classification Logic

Two categories of errors with different behaviors:

**FAILOVER_ERRORS (triggers automatic failover):**
- `NUMBER_BLOCKED` - Sender number blocked
- `CARRIER_VIOLATION` - Carrier rejected message
- `RATE_LIMITED` - Provider rate limit exceeded
- `PROVIDER_ERROR` - Provider system issue
- `NETWORK_ERROR` - Network connectivity issue

**NO_FAILOVER_ERRORS (recipient issue, no failover):**
- `INVALID_NUMBER` - Recipient number invalid
- `INVALID_CONTENT` - Message content rejected
- `UNDELIVERABLE` - Carrier cannot deliver

```javascript
function shouldFailover(errorCode) {
  if (NO_FAILOVER_ERRORS.includes(errorCode)) {
    return false;
  }
  return FAILOVER_ERRORS.includes(errorCode);
}
```

### 2. Sticky Sender (Consistent Number per Recipient)

Patients always receive messages from the same number:

```javascript
function selectFromNumber(phoneNumbers, recipientPhone, sticky = true) {
  if (sticky && recipientPhone) {
    const phoneHash = hashPhoneNumber(recipientPhone);
    const cached = stickySenderCache.get(phoneHash);

    if (cached && phoneNumbers.includes(cached)) {
      return cached;
    }

    // Hash-based selection for consistent mapping
    const hash = phoneHash.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    const index = hash % phoneNumbers.length;
    const selected = phoneNumbers[index];

    stickySenderCache.set(phoneHash, selected);
    return selected;
  }
}
```

### 3. Per-Organization Phone Number Pools

Each organization has dedicated phone numbers:

```javascript
async function getOrganizationSMSConfig(db, organizationId) {
  const result = await db.query(
    `SELECT setting_value FROM organization_settings
     WHERE organization_id = $1 AND setting_key = 'sms_config'`,
    [organizationId]
  );
  // Returns: { provider, phoneNumbers[], failoverProvider, failoverNumbers[] }
}
```

### 4. Automatic Failover Flow

```javascript
// Try primary provider
let result = await primaryProvider.sendSMS(to, message, fromNumber);

// Check if we should failover
if (result.status === 'failed' && shouldFailover(result.errorCode)) {
  if (config.failoverProvider && config.failoverNumbers?.length > 0) {
    // Try failover provider with different number
    const failoverProvider = getProvider(config.failoverProvider);
    const failoverResult = await failoverProvider.sendSMS(to, message, failoverFromNumber);

    // Return with failedOver flag for tracking
    return {
      ...failoverResult,
      failedOver: true,
      originalError: result.errorCode
    };
  }
}
```

---

## Database Changes

**Migration 005:** `005_add_org_to_sms_tables.sql`

Adds:
- `organization_id` column to `sms_conversations`
- `from_number` column to `sms_audit_log`
- Enables multi-tenant isolation per radiology group

---

## Novelty Assessment

### Potentially Novel Elements

1. **Error-Based Failover Classification**
   - Distinguishing between provider errors (failover) vs recipient errors (no failover)
   - Healthcare-specific context (patient communication must succeed)

2. **Sticky Sender with Hash-Based Distribution**
   - Consistent sender number for same recipient across sessions
   - Hash-based load balancing across number pool

3. **Per-Organization Multi-Provider Configuration**
   - Different radiology groups can have different providers
   - Configurable failover paths per organization

4. **Healthcare SMS Multi-Tenancy**
   - Organization isolation for HIPAA compliance
   - Audit logging with provider tracking

### Prior Art Considerations

General SMS failover is not novel - AWS SNS, Twilio itself, and many other services offer multi-provider routing. However:

**Potentially Differentiating:**
- Healthcare-specific context (patient scheduling)
- Integration with PHI handling (phone hashing)
- Per-organization configuration in multi-tenant healthcare SaaS
- Error classification specific to healthcare messaging (patient must receive)

---

## Patent Coverage

| Feature | In Existing Patents? | Notes |
|---------|----------------------|-------|
| Multi-provider SMS | **NO** | Not mentioned in any provisional |
| Error-based failover | **NO** | Novel classification system |
| Sticky sender | **NO** | Not mentioned |
| Per-org phone pools | **NO** | Multi-tenant aspect |
| Abstract provider pattern | **NO** | Implementation detail |

---

## Recommendation

This innovation is **NOT PROTECTED** by any existing provisional patent. If deemed patentable:

1. **Option A:** Amend existing Patent #3 (RadScheduler SMS) before non-provisional filing (before Jan 12, 2027)
2. **Option B:** File separate provisional for SMS provider infrastructure

**Priority:** MEDIUM - General SMS failover is not novel, but the healthcare-specific error classification and multi-tenant configuration may be.

---

## Files Implemented

| File | Purpose |
|------|---------|
| `sms-service.js` | Main service with failover logic |
| `base-provider.js` | Abstract provider interface |
| `twilio-provider.js` | Twilio implementation |
| `telnyx-provider.js` | Telnyx stub |
| `types.js` | Error codes and constants |
| `index.js` | Module exports |
| 64 unit tests | Full test coverage |
