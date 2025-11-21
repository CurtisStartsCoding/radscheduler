# RadScheduler Troubleshooting Guide

## Critical Issues Fixed - November 2025

This document captures the major issues resolved and how to prevent them from recurring.

---

## Issue 1: SMS Shows "Main Campus Imaging" Instead of Radiology Regional Locations

### Symptoms
- SMS messages show hardcoded locations like "Main Campus Imaging"
- Patients don't see real Radiology Regional locations (Cape Coral, Fort Myers, etc.)

### Root Cause
RadScheduler has a `USE_MOCK_RIS` flag that defaults to `true` when:
- `USE_MOCK_RIS` environment variable is not set, OR
- `QIE_API_URL` environment variable is not set

When true, it uses hardcoded mock data instead of real data from Mock RIS.

### Fix
Ensure these environment variables are set in `/home/ubuntu/radscheduler/api/.env`:

```bash
# Mock RIS Configuration
USE_MOCK_RIS=false
QIE_API_URL=http://10.0.1.211:8082
```

### Verification
```bash
# On server
cd /home/ubuntu/radscheduler/api
grep "USE_MOCK_RIS\|QIE_API_URL" .env
pm2 restart radscheduler-api
```

**Expected**: New SMS conversations should show 14 Radiology Regional locations from Mock RIS webhook data.

---

## Issue 2: "Missing patient MRN (PID-3.1)" Errors from Mock RIS

### Symptoms
- Mock RIS logs show: `Error: Missing patient MRN (PID-3.1)`
- SMS booking fails when patient responds
- QIE shows SRM message retry loops

### Root Cause
RadScheduler wasn't extracting patient demographics from order webhooks sent by QIE Channel 6663.

**Required webhook fields:**
- `patientMrn` - Patient MRN (for SRM PID-3.1)
- `patientDob` - Patient date of birth (for SRM PID-7)
- `patientGender` - Patient gender (for SRM PID-8)
- `patientId` - Duplicate of patientMrn for backward compatibility

### Fix Applied
File: `/home/ubuntu/radscheduler/api/src/routes/order-webhook.js`

Extracts patient demographics from webhook payload:
```javascript
const {
  patientMrn,
  patientDob,
  patientGender,
  // ... other fields
} = req.body;

const orderData = {
  patientMrn: patientMrn || patientId,
  patientDob,
  patientGender,
  // ... other fields
};
```

### QIE Channel 6663 Update
File: `final-documentation/qvera/channel-scripts/channel-6663-Mock-RIS-status-updates/mapping.js`

Must include in webhook payload:
```javascript
patientMrn: String(patientMrn || ''),
patientId: String(patientMrn || ''),  // Duplicate for backward compatibility
patientDob: String(patientDob || ''),
patientGender: String(patientGender || ''),
```

### Verification
```bash
# Check active conversations have MRN
cd /home/ubuntu/radscheduler/api
node scripts/check-conversations.js

# Should show: MRN: <value>, not MRN: null
```

---

## Issue 3: RadScheduler Can't Connect to Database

### Symptoms
- Logs show: `Missing required env var: DATABASE_URL`
- Service crashes immediately on startup
- PM2 shows constant restarts

### Root Cause
1. **Wrong database URL**: `.env` pointed to `localhost:5433` (non-existent local PostgreSQL)
2. **PM2 working directory**: PM2 was running from `/home/ubuntu` instead of `/home/ubuntu/radscheduler/api`, so dotenv couldn't find `.env`
3. **Dotenv path issue**: `server.js` needed explicit path to `.env` file

### Fix Applied
**1. Correct DATABASE_URL in `.env`:**
```bash
DATABASE_URL=postgresql://postgres:password@radorderpad-main-db.czi6ewycqxzy.us-east-2.rds.amazonaws.com:5432/radorder_main?sslmode=no-verify
```

**2. Fixed dotenv path in `server.js`:**
```javascript
require('dotenv').config({ path: '/home/ubuntu/radscheduler/api/.env' });
```

**3. PM2 configuration:**
```bash
pm2 delete radscheduler-api
pm2 start /home/ubuntu/radscheduler/api/src/server.js --name radscheduler-api
pm2 save
```

### Verification
```bash
pm2 logs radscheduler-api --lines 10 --nostream | grep "Database connected"
# Should show: "Database connected successfully"
```

---

## Issue 4: Location Data Uses Mock RIS Instead of Order Webhook

### Symptoms
- SMS shows wrong locations even when `USE_MOCK_RIS=false`
- Locations don't match what Mock RIS sent in webhook

### Root Cause
`sendLocationOptions()` function called `risClient.getLocations()` instead of using `orderData.availableLocations` from the webhook.

Mock RIS sends `availableLocations` array with 14 Radiology Regional locations in the order webhook, but RadScheduler was ignoring it.

### Fix Applied
File: `/home/ubuntu/radscheduler/api/src/services/sms-conversation.js`

Changed from:
```javascript
const locations = await risClient.getLocations(orderData.modality);
```

To:
```javascript
// Get available locations from order data (sent by Mock RIS) or fallback to RIS API
const locations = orderData.availableLocations && orderData.availableLocations.length > 0
  ? orderData.availableLocations
  : await risClient.getLocations(orderData.modality);
```

### Verification
Check order webhook payload includes:
```json
{
  "availableLocations": [
    { "id": "RR-001", "name": "Cape Coral - Del Prado", ... },
    { "id": "RR-002", "name": "Cape Coral - Cay West", ... },
    ...
  ]
}
```

---

## Deployment Checklist

When deploying RadScheduler, verify:

### 1. Environment Variables
```bash
cd /home/ubuntu/radscheduler/api
cat .env | grep -E "DATABASE_URL|USE_MOCK_RIS|QIE_API_URL"
```

**Required values:**
- `DATABASE_URL`: Points to `radorderpad-main-db` RDS instance
- `USE_MOCK_RIS=false`
- `QIE_API_URL=http://10.0.1.211:8082`

### 2. Database Connection
```bash
pm2 logs radscheduler-api --lines 20 --nostream | grep -i database
```

**Expected**: "Database connected successfully"

### 3. Active Conversations
```bash
cd /home/ubuntu/radscheduler/api
node scripts/check-conversations.js
```

**Verify**: No conversations with `MRN: null` or stuck states

### 4. Mock RIS Integration
Check recent order webhook:
```bash
pm2 logs radscheduler-api --lines 50 --nostream | grep "Order webhook received"
```

**Verify**: Webhooks being received with patient demographics

### 5. QIE Channel Status
```bash
ssh -i ~/.ssh/radorderpad-ssh-access.pem ubuntu@10.0.1.211 'tail -50 /java/qie/logs/qie.log | grep -E "ERROR|WARN" | tail -10'
```

**Verify**: No "Missing patient MRN" errors

---

## Quick Fix Commands

### Clear Stuck Conversations
```bash
cd /home/ubuntu/radscheduler/api
node scripts/check-conversations.js
node scripts/delete-conversation.js <conversation_id>
```

### Restart with Fresh Config
```bash
pm2 restart radscheduler-api
pm2 logs radscheduler-api --lines 20 --nostream
```

### Verify Location Data Source
```bash
# Check if using mock or real data
pm2 logs radscheduler-api --lines 100 --nostream | grep -i "MOCK"
```

**Expected**: No "Using MOCK locations data" messages when `USE_MOCK_RIS=false`

---

## Architecture Reference

### Data Flow
1. **Mock RIS** → ORM message → **QIE Channel 6661** → RadOrderPad (order created)
2. **Mock RIS** → ORU "Received" → **QIE Channel 6663** → RadScheduler webhook (with `availableLocations`)
3. **RadScheduler** → stores order + patient demographics + locations
4. **Patient** → responds to SMS → RadScheduler
5. **RadScheduler** → SRM request → **QIE Channel 8082** → Mock RIS (with patient MRN)
6. **Mock RIS** → SRR response → **QIE Channel 8083** → RadScheduler (available slots)

### Critical Dependencies
- **PostgreSQL**: `radorderpad-main-db` RDS instance (port 5432)
- **QIE Server**: 10.0.1.211 (internal IP, access via jump host)
- **Mock RIS**: Runs on QIE server, listens on port 6662
- **QIE Channels**: 6663 (status webhooks), 8082 (schedule requests), 8083 (schedule responses)

---

## Contact

For QIE/Mock RIS issues, see: `/qvera` slash command
For database issues, see: `docs/deployment/deployment-guide.md`
