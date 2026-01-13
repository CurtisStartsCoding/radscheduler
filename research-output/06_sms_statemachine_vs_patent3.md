# SMS State Machine vs Patent #3 Analysis

**File:** `C:/apps/radscheduler/api/src/services/sms-conversation.js`
**Lines:** 686

---

## State Machine Overview

### Implemented States (from code)

```javascript
const STATES = {
  CONSENT_PENDING: 'CONSENT_PENDING',
  CHOOSING_ORDER: 'CHOOSING_ORDER',    // Declared but not used in flow
  CHOOSING_LOCATION: 'CHOOSING_LOCATION',
  CHOOSING_TIME: 'CHOOSING_TIME',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED'
};
```

### State Flow

```
                           ┌──────────────────────────────────────────┐
                           │       New Order Webhook                   │
                           └──────────────────┬───────────────────────┘
                                              │
                                              ▼
                           ┌──────────────────────────────────────────┐
                           │  Has Patient Consented?                   │
                           │  (hasConsent(phoneNumber))                │
                           └───────┬──────────────────┬───────────────┘
                                   │                  │
                                NO │                  │ YES
                                   ▼                  ▼
              ┌─────────────────────────┐  ┌─────────────────────────┐
              │    CONSENT_PENDING      │  │   CHOOSING_LOCATION     │
              │                         │  │                         │
              │ "Reply YES to continue" │  │ "Select location 1-5"   │
              └───────────┬─────────────┘  └─────────────┬───────────┘
                          │                              │
              Reply YES   │                    Reply 1-5 │
                          ▼                              ▼
              ┌─────────────────────────┐  ┌─────────────────────────┐
              │   CHOOSING_LOCATION     │  │    CHOOSING_TIME        │
              │                         │  │                         │
              │ "Select location 1-5"   │  │ QIE requests slots      │
              └───────────┬─────────────┘  │ Webhook returns options │
                          │                └─────────────┬───────────┘
                Reply 1-5 │                              │
                          ▼                    Reply 1-5 │
              ┌─────────────────────────┐               │
              │    CHOOSING_TIME        │◄──────────────┘
              │                         │
              │ QIE requests slots      │
              └───────────┬─────────────┘
                          │
                Reply 1-5 │
                          ▼
              ┌─────────────────────────┐
              │       CONFIRMED         │
              │                         │
              │ Appointment booked      │
              │ (via SIU webhook)       │
              └─────────────────────────┘
```

---

## Patent #3 Claims vs Implementation

### Innovation 1: Database-Driven SMS State Machine
| Patent Claim | Code Implementation | Status |
|--------------|---------------------|--------|
| PostgreSQL-based state management | `sms_conversations` table with `state` column | **MATCH** |
| Auto-expiration | `expires_at > CURRENT_TIMESTAMP` check | **MATCH** |
| Session persistence | `SESSION_TTL_HOURS = 24` hours default | **MATCH** |

### Innovation 2: Intelligent Order Consolidation
| Patent Claim | Code Implementation | Status |
|--------------|---------------------|--------|
| Multiple orders combined | `addOrderToConversation()` queues orders | **MATCH** |
| Single SMS conversation | `pendingOrders` array in `order_data` | **MATCH** |
| Multi-procedure display | Lists all procedures in location message | **MATCH** |

### Innovation 3: Multi-Procedure Single-Appointment Booking
| Patent Claim | Code Implementation | Status |
|--------------|---------------------|--------|
| Aggregate duration | `Total time: ${orderData.estimatedDuration}` | **MATCH** |
| Multiple OBR segments | `orderIds` array passed to `bookAppointment()` | **MATCH** |
| Single appointment | "Booking ONE appointment for multiple orders" | **MATCH** |

### Innovation 4: Modality-Aware Location Filtering
| Patent Claim | Code Implementation | Status |
|--------------|---------------------|--------|
| Filter by modality | `risClient.getLocations(orderData.modality)` | **MATCH** |
| Present only capable facilities | Filtered list from RIS | **MATCH** |

### Innovation 5: Clinical Safety Validation (AL1/OBX)
| Patent Claim | Code Implementation | Status |
|--------------|---------------------|--------|
| AL1 allergy checking | **NOT IMPLEMENTED** | **GAP** |
| OBX lab value validation | **NOT IMPLEMENTED** | **GAP** |
| eGFR/creatinine screening | **NOT IMPLEMENTED** | **GAP** |
| Contrast timing rules | **NOT IMPLEMENTED** | **GAP** |
| COORDINATOR_REVIEW state | Declared but **NOT USED** | **GAP** |

### Innovation 6: Granular Equipment Capability Matching
| Patent Claim | Code Implementation | Status |
|--------------|---------------------|--------|
| Equipment capability database | **NOT IMPLEMENTED** | **GAP** |
| CT slice count filtering | **NOT IMPLEMENTED** | **GAP** |
| MRI field strength matching | **NOT IMPLEMENTED** | **GAP** |

### Innovation 7: AI-Powered Equipment Inference
| Patent Claim | Code Implementation | Status |
|--------------|---------------------|--------|
| LLM analysis of procedures | **NOT IMPLEMENTED** | **GAP** |

### Innovation 8: AI-Powered Duration Calculation
| Patent Claim | Code Implementation | Status |
|--------------|---------------------|--------|
| LLM duration override | **NOT IMPLEMENTED** | **GAP** |

---

## Features IN CODE But NOT in Patent

### 1. Multi-Provider SMS Failover
- Implemented in `sms-service.js` (commit a245138)
- Not mentioned in any patent
- **POTENTIAL ADDITION**

### 2. Sticky Sender Number
- Same phone number for same recipient
- Hash-based distribution across pool
- **POTENTIAL ADDITION**

### 3. Per-Organization Phone Pools
- `organization_id` column in `sms_conversations`
- Multi-tenant isolation
- **POTENTIAL ADDITION**

### 4. HL7 Asynchronous Slot Retrieval
- SRM request sent to QIE
- SRR response via webhook
- **POTENTIAL ADDITION**

### 5. Phone Number Encryption
- `encryptPhoneNumber()` and `decryptPhoneNumber()`
- `encrypted_phone` column for reconstruction
- `phone_hash` for lookup (SHA-256)
- **Partially covered** in Patent #3

### 6. Slot Request Retry Tracking
- `slot_request_sent_at` timestamp
- `slot_retry_count` for stuck detection
- **POTENTIAL ADDITION**

---

## Code Excerpts

### Order Consolidation
```javascript
async function addOrderToConversation(conversationId, newOrderData) {
  // Initialize pending orders array if it doesn't exist
  if (!currentData.pendingOrders) {
    currentData.pendingOrders = [];
  }
  currentData.pendingOrders.push(newOrderData);
}
```

### Multi-Procedure Booking
```javascript
async function handleTimeSelection(phoneNumber, conversation, message) {
  const orderIds = [orderData.orderId];
  if (orderData.pendingOrders && orderData.pendingOrders.length > 0) {
    orderData.pendingOrders.forEach(order => orderIds.push(order.orderId));
  }

  // Book ONE appointment for ALL orders
  const booking = await risClient.bookAppointment({
    orderIds,  // Pass array of all order IDs
    ...
  });
}
```

### Consent Flow
```javascript
if (message === 'YES' || message === 'Y') {
  await recordConsent(phoneNumber);
  await updateConversationState(conversation.id, STATES.CHOOSING_LOCATION);
  await sendLocationOptions(phoneNumber, ...);
}
```

---

## Summary Table

| Innovation | Patent #3 Claims | In Code | Gap? |
|------------|------------------|---------|------|
| DB State Machine | YES | YES | No |
| Order Consolidation | YES | YES | No |
| Multi-procedure Booking | YES | YES | No |
| Modality Location Filter | YES | YES | No |
| **Clinical Safety (AL1/OBX)** | YES | **NO** | **YES** |
| **Equipment Capability DB** | YES | **NO** | **YES** |
| **AI Equipment Inference** | YES | **NO** | **YES** |
| **AI Duration Calculation** | YES | **NO** | **YES** |
| Multi-provider Failover | NO | YES | Not in patent |
| Sticky Sender | NO | YES | Not in patent |
| Per-org Phone Pools | NO | YES | Not in patent |
| HL7 Async Slot Flow | NO | YES | Not in patent |

---

## Recommendations

### 1. Patent #3 Overreach
The patent claims innovations 5-8 (clinical safety, equipment matching, AI features) as if implemented, but the code shows these are **PLANNED**, not implemented. This creates a discrepancy between claims and reality.

**Options:**
- A) Implement features before non-provisional filing (Jan 12, 2027)
- B) Reduce patent scope to match actual implementation
- C) Acknowledge claims as continuation application for future features

### 2. Unprotected Innovations
Code contains features NOT in any patent:
- Multi-provider SMS failover
- Sticky sender routing
- Per-organization phone pools
- HL7 async slot retrieval

**Recommendation:** Amend Patent #3 before non-provisional filing to add these implemented features.
