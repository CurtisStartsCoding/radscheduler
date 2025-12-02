# Error Handling & Admin Dashboard Implementation

**Date:** 2025-12-02
**Status:** Implemented (Backend Complete, Frontend Pending)

---

## Problem Statement

Two critical issues were identified:

1. **RIS Empty Slots Issue**: When RIS returned no available slots, patients were left stuck in `CHOOSING_TIME` state with no notification. The system had TODO comments but never implemented actual error handling.

2. **Multiple Order Bug**: When a second imaging order arrived for the same patient before they responded to the first SMS, the system created an orphaned conversation instead of queuing the order. The second order was never communicated to the patient.

---

## Solution Overview

### Phase 0: Multiple Order Bug Fix

**Problem**: Code at `order-webhook.js:144-170` would start a NEW conversation if existing conversation was in `CONSENT_PENDING` state, creating orphans.

**Fix**: Now queues orders to ANY existing conversation (including `CONSENT_PENDING`) and resends consent SMS with updated order count.

**Files Changed**:
- `api/src/routes/order-webhook.js` - Lines 144-178: Changed logic to always queue to existing conversation
- `api/src/services/sms-conversation.js` - Added `resendConsentWithMultipleOrders()` function

### Phase 1: Database Migration

**New File**: `api/db/migrations/002-add-webhook-tracking.sql`

Added columns to `sms_conversations` table:
```sql
slot_request_sent_at TIMESTAMP     -- When slot request was sent to QIE
slot_retry_count INTEGER DEFAULT 0 -- Number of retry attempts
slot_request_failed_at TIMESTAMP   -- When request permanently failed
```

**To run migration**:
```bash
psql -d radscheduler -f api/db/migrations/002-add-webhook-tracking.sql
```

### Phase 2: Error Handling Fixes

**File**: `api/src/routes/hl7-webhooks.js`

#### Fix 1: Empty Slots Notification (was line 87-96)
- Now sends SMS: "No available appointment times at your selected location..."
- Returns patient to `CHOOSING_LOCATION` state
- Re-sends location options so patient can try another location

#### Fix 2: Schedule Request Failure (was line 75-83)
- If `slot_retry_count < 1`: Queues for automatic retry
- If max retries exceeded: Sends SMS asking patient to call, marks as `CANCELLED`

#### Fix 3: Timestamp Tracking
- `sms-conversation.js:361-371`: Sets `slot_request_sent_at` when entering `CHOOSING_TIME`
- `hl7-webhooks.js:219-227`: Clears timestamp when webhook succeeds

### Phase 3: Stuck Conversation Monitor

**New File**: `api/src/services/stuck-conversation-monitor.js`

Background job that runs every 60 seconds:
1. Finds conversations stuck in `CHOOSING_TIME` for >5 minutes
2. If `slot_retry_count < 1`: Re-sends slot request to QIE
3. If retry exhausted: Sends failure SMS, marks as `CANCELLED`

**Configuration** (environment variables):
```bash
WEBHOOK_TIMEOUT_MS=300000        # 5 minutes (default)
MAX_WEBHOOK_RETRIES=1            # Retry once (default)
WEBHOOK_CHECK_INTERVAL_MS=60000  # Check every 1 minute (default)
```

**Integration**: Added to `server.js` startup/shutdown alongside existing cleanup job.

### Phase 4: Admin Dashboard Backend

#### New Service: `api/src/services/conversation-admin.js`

Functions:
- `getConversations(filters)` - List with state/date/stuck filters
- `getConversationById(id)` - Single conversation details
- `deleteConversation(id, userId)` - Delete with audit logging
- `forceStateTransition(id, newState, userId, reason)` - Force to CANCELLED/EXPIRED
- `retryStep(id, step, userId)` - Retry location or timeslots
- `sendManualSMS(id, message, userId)` - Send custom SMS (ADMIN only)
- `bulkDeleteExpired(olderThanDays, userId)` - Cleanup old conversations
- `getConversationStats(startDate, endDate)` - Counts by state, stuck count
- `getStateDurationAnalytics(startDate, endDate)` - Avg time per state
- `getTimeseriesData(startDate, endDate, interval)` - For charting
- `getSMSVolume(startDate, endDate)` - Inbound/outbound counts

#### New Routes: `api/src/routes/conversations.js`

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/api/conversations` | GET | read:conversations | List conversations |
| `/api/conversations/:id` | GET | read:conversations | Get single conversation |
| `/api/conversations/:id` | DELETE | delete:conversations | Delete (ADMIN only) |
| `/api/conversations/:id/state` | PATCH | write:conversations | Force state (ADMIN only) |
| `/api/conversations/:id/retry` | POST | write:conversations | Retry step |
| `/api/conversations/:id/send-sms` | POST | write:conversations | Manual SMS (ADMIN only) |
| `/api/conversations/bulk/expired` | DELETE | delete:conversations | Bulk delete old |
| `/api/conversations/analytics/stats` | GET | read:conversations | Statistics |
| `/api/conversations/analytics/state-duration` | GET | read:conversations | Time per state |
| `/api/conversations/analytics/timeseries` | GET | read:conversations | Chart data |
| `/api/conversations/analytics/sms-volume` | GET | read:conversations | SMS counts |

#### Permission Updates: `api/src/middleware/auth.js`

Added to SCHEDULER role:
- `read:conversations`
- `write:conversations`

ADMIN role has `*` (all permissions) so can delete and send manual SMS.

---

## Files Changed Summary

### New Files Created

| File | Purpose |
|------|---------|
| `api/db/migrations/002-add-webhook-tracking.sql` | Database schema changes |
| `api/src/services/stuck-conversation-monitor.js` | Background timeout/retry job |
| `api/src/services/conversation-admin.js` | Admin dashboard business logic |
| `api/src/routes/conversations.js` | Admin REST API endpoints |
| `docs/plans/error-handling-dashboard-plan.md` | Implementation plan |
| `docs/2025-12-02-error-handling-dashboard.md` | This documentation |

### Existing Files Modified

| File | Changes |
|------|---------|
| `api/src/routes/order-webhook.js` | Fixed multiple order bug (lines 144-178) |
| `api/src/routes/hl7-webhooks.js` | Fixed empty slots + failure notifications, added timestamp clearing |
| `api/src/services/sms-conversation.js` | Added imports, `resendConsentWithMultipleOrders()`, `slot_request_sent_at` tracking, exported new functions |
| `api/src/server.js` | Added stuck monitor import, route registration, startup/shutdown integration |
| `api/src/middleware/auth.js` | Added conversation permissions for SCHEDULER role |

---

## Testing Instructions

### 1. Run Database Migration

```bash
cd C:\Apps\radscheduler
psql -d radscheduler -f api/db/migrations/002-add-webhook-tracking.sql
```

Or if using the Oracle production server:
```bash
ssh -i connections/oracle_clean.key ubuntu@64.181.198.128 \
  "sudo cp /home/ubuntu/invoice-processor-v2/api/db/migrations/002-add-webhook-tracking.sql /tmp/ && \
   sudo chmod 644 /tmp/002-add-webhook-tracking.sql && \
   sudo -u postgres psql -d radscheduler -f /tmp/002-add-webhook-tracking.sql"
```

### 2. Start the Server Locally

```bash
cd C:\Apps\radscheduler\api
npm start
```

You should see logs:
```
RadScheduler API running on port 3001
SMS scheduling system active
Stuck conversation monitor active (5-min timeout, 1 retry)
```

### 3. Test Admin API

```bash
# Get auth token (use admin credentials)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@radscheduler.com","password":"password"}'

# List conversations
curl http://localhost:3001/api/conversations \
  -H "Authorization: Bearer <token>"

# List only stuck conversations
curl "http://localhost:3001/api/conversations?stuck=true" \
  -H "Authorization: Bearer <token>"

# Get statistics
curl http://localhost:3001/api/conversations/analytics/stats \
  -H "Authorization: Bearer <token>"
```

### 4. Test Error Handling

To test the empty slots handling:
1. Create a test conversation
2. Send a webhook to `/api/webhooks/hl7/schedule-response` with empty `availableSlots: []`
3. Verify patient receives SMS and is returned to location selection

To test the stuck monitor:
1. Set `WEBHOOK_TIMEOUT_MS=30000` (30 seconds) for faster testing
2. Create a conversation in `CHOOSING_TIME` state
3. Wait 30+ seconds
4. Check logs for retry attempt
5. Wait another 30+ seconds
6. Verify patient receives failure SMS

---

## Pending Work

### Phase 5: Admin Dashboard Frontend

The frontend React/Next.js components are NOT yet implemented:
- `web/pages/conversations.js` - Main dashboard page
- `web/components/ConversationTable.js` - Data table
- `web/components/ConversationDetail.js` - Detail modal
- `web/components/ConversationAnalytics.js` - Charts
- `web/components/ManualSMSModal.js` - SMS dialog
- `web/components/StateTransitionModal.js` - State change dialog

The backend API is fully ready to support these components.

---

## Architecture Notes

### Stuck Conversation Detection Flow

```
Patient selects location (reply "1")
    |
    v
handleLocationSelection()
    |
    +--> UPDATE state='CHOOSING_TIME', slot_request_sent_at=NOW()
    |
    v
sendTimeSlotOptions() --> QIE Channel 8082
    |
    v
[Wait for webhook]
    |
/        \
v          v
Webhook     No webhook (5 min timeout)
arrives         |
|               v
v          Stuck Monitor detects
Clear          |
timestamp  slot_retry_count < 1?
|          /            \
v         v              v
Send    RETRY:         FAIL:
SMS     Reset ts       Send error SMS
        Re-send QIE    State='CANCELLED'
```

### Error Recovery Matrix

| Scenario | Detection | Action | Patient Experience |
|----------|-----------|--------|-------------------|
| RIS returns empty slots | Webhook handler | Return to CHOOSING_LOCATION, resend options | "No slots at this location, try another" |
| RIS returns success=false | Webhook handler | Queue for retry or notify | Auto-retry, then "Please call us" |
| Webhook never arrives | Stuck monitor (5 min) | Auto-retry once | Transparent retry |
| Retry also fails | Stuck monitor | Send failure SMS, cancel | "Technical issue, please call" |
| Second order before consent | Order webhook | Queue to existing conversation | Updated "2 imaging orders" SMS |
