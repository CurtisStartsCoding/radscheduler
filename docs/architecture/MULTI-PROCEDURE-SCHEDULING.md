# Multi-Procedure Scheduling Architecture

**Date:** October 16, 2025
**Status:** Architecture & Implementation Guide
**Related:** INTEGRATION-ARCHITECTURE-PLAN.md

---

## Executive Summary

This document defines how RadScheduler handles **grouped procedures** (multiple imaging exams ordered together) via SMS self-scheduling. This mirrors real-world RIS behavior where doctors frequently order multiple related exams in a single visit (e.g., "CT Chest + CT Abdomen/Pelvis").

**Key Principle:** Multiple procedures in one order = ONE appointment with extended duration.

---

## Problem Statement

### Current Behavior (Single Procedure)

```
Doctor orders: CT Chest (CPT 71275)
    ↓
ONE HL7 message → ONE order → ONE webhook
    ↓
RadScheduler: "You have a CT scan order"
    ↓
Patient books: 30-minute appointment
    ↓
✅ Works perfectly
```

### Current Problem (Multiple Procedures)

```
Doctor orders: CT Chest + CT Abdomen/Pelvis
    ↓
TWO separate HL7 messages → TWO orders → TWO webhooks
    ↓
RadScheduler:
  - SMS #1: "You have a CT scan order"
  - SMS #2: "You have a CT scan order" (5 seconds later)
    ↓
Patient confusion: "Do I need to book twice? Is this a duplicate?"
    ↓
❌ Poor user experience
```

### Real-World RIS Behavior (Fuji, Epic, etc.)

```
Doctor orders: CT Chest + CT Abdomen/Pelvis
    ↓
ONE HL7 message (multiple OBR segments) → ONE order → ONE appointment
    ↓
RIS scheduler: "CT Chest + Abdomen/Pelvis - 60 minutes"
    ↓
Patient books: ONE appointment, 60-minute block
    ↓
Scheduler reserves: TWO consecutive 30-min slots
    ↓
✅ Professional, clear, efficient
```

---

## HL7 Message Structure (Multiple Procedures)

### Standard HL7 ORM Format

From IHE Radiology Technical Framework (Section 7.1.3: Multiple Studies in One ORM Message):

```
MSH|^~\&|ADT|XYZ CLINIC|PACS|XYZ HOSPITAL|20251016143000||ORM^O01|MSG12345|P|2.5
PID|1||12345678^^^MRN^MR||DOE^JOHN^A||19700101|M|||123 MAIN ST^^FORT MYERS^FL^33901||2393229966
PV1|1|O|OP^^^OP|||||DOC123^SMITH^JOHN^A^^^MD|||||||||REF123||||||||||||||||||||||||20251016

ORC|NW|26020^PLW^IHEDEM|647||SC||||20251016143000|DOC123^SMITH^JOHN^A
OBR|1|26020^PLW^IHEDEM|647|71275^CT Chest without contrast^CPT4||||||||||||||||||CT|||||||||||||||||||||
ZDS|1.2.840.113696.647^SMS^Application^DICOM|

ORC|NW|26021^PLW^IHEDEM|648||SC||||20251016143000|DOC123^SMITH^JOHN^A
OBR|2|26021^PLW^IHEDEM|648|74175^CT Abd/Pelvis without contrast^CPT4||||||||||||||||||CT|||||||||||||||||||||
ZDS|1.2.840.113696.648^SMS^Application^DICOM|
```

**Key Points:**
- ONE MSH, ONE PID, ONE PV1 (message header + patient info)
- MULTIPLE ORC/OBR pairs (one per procedure)
- Each OBR has unique Placer Order Number but same patient
- Same ordering provider (ORC-12)
- Same requested date/time

---

## Architectural Design

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   RadOrderPad Frontend                       │
│  Doctor selects: CT Chest + CT Abd/Pelvis                   │
│  Creates order_group with two line items                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              RadOrderPad: Send to Radiology                  │
│                                                               │
│  1. Detect order_group_id exists                             │
│  2. Fetch ALL orders in group (2 orders)                    │
│  3. Build ONE HL7 message with TWO OBR segments             │
│  4. Calculate total duration: 30 + 30 = 60 min              │
│                                                               │
│  Output: Single HL7 ORM^O01 message                         │
└────────────────────────┬────────────────────────────────────┘
                         │ ONE HL7 Message
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    QIE Integration Engine                    │
│                                                               │
│  Parse HL7:                                                  │
│    - Extract patient phone (PID-13/ORC-14)                  │
│    - Parse ALL OBR segments (count = 2)                     │
│    - Normalize modalities: CT, CT → Same modality           │
│    - Calculate total duration: 60 min                       │
│    - Extract procedure descriptions                          │
│    - Format provider name from ORC-12                        │
│                                                               │
│  Transform to webhook JSON:                                  │
│  {                                                            │
│    "orderId": "ORD-26020",                                   │
│    "orderGroupId": "GRP-647",                                │
│    "procedures": [                                            │
│      {"cpt": "71275", "description": "CT Chest",             │
│       "modality": "CT", "duration": 30},                     │
│      {"cpt": "74175", "description": "CT Abd/Pelvis",        │
│       "modality": "CT", "duration": 30}                      │
│    ],                                                         │
│    "modality": "CT",  // Primary                             │
│    "modalityDisplay": "CT Scan",                             │
│    "totalDuration": 60,                                       │
│    "canScheduleTogether": true,  // Same modality            │
│    "orderingProvider": "Dr. John Smith",                     │
│    "patientPhone": "+12393229966",                           │
│    "priority": "routine"                                      │
│  }                                                            │
└────────────────────────┬────────────────────────────────────┘
                         │ ONE Webhook (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Mock RIS / Calendar                     │
│                                                               │
│  Store as ONE order with multiple procedures:                │
│    - order_id: ORD-26020                                     │
│    - procedures: [CT Chest, CT Abd/Pelvis]                  │
│    - total_duration: 60                                      │
│                                                               │
│  Forward webhook to RadScheduler                             │
└────────────────────────┬────────────────────────────────────┘
                         │ ONE Webhook
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                       RadScheduler                           │
│                    SMS Scheduling Flow                       │
│                                                               │
│  1. Consent SMS:                                             │
│     "You have a new imaging order: CT Chest + CT Abd/Pelvis │
│      (approx. 60 min). Schedule via text?"                   │
│                                                               │
│  2. Location selection:                                      │
│     Query RIS: getLocations(modality="CT")                  │
│     Show available CT centers                                │
│                                                               │
│  3. Time slot selection:                                     │
│     Query RIS: getSlots(location, modality="CT",            │
│                         duration=60)  ← NEW: duration param  │
│     RIS finds consecutive 30-min slots                       │
│     Show: "Tomorrow 9am-10am", "Fri 2pm-3pm"                │
│                                                               │
│  4. Booking:                                                 │
│     POST /book-appointment                                   │
│     {                                                         │
│       "orderId": "ORD-26020",                                │
│       "procedures": [...],                                    │
│       "slotIds": [slot1, slot2],  ← Book BOTH slots         │
│       "duration": 60                                          │
│     }                                                         │
│                                                               │
│  5. Confirmation:                                            │
│     "Appointment confirmed!                                  │
│      CT Chest + CT Abd/Pelvis                                │
│      Tomorrow 9am-10am (60 min)                              │
│      Confirmation #: RD-12345"                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. RadOrderPad: Detect and Group Orders

**File:** `src/controllers/admin-order/send-to-radiology.controller.ts`

**Current behavior (problematic):**
```typescript
// Processes one order at a time
async function sendToRadiology(orderId: string) {
  const order = await getOrder(orderId);
  const hl7Message = buildHL7(order);  // ONE order → ONE HL7
  await sendToQIE(hl7Message);
}

// Called for each order separately
sendToRadiology('ORD-123-1');  // First order
sendToRadiology('ORD-123-2');  // Second order (5 seconds later)
```

**New behavior (correct):**
```typescript
async function sendToRadiology(orderId: string) {
  const order = await getOrder(orderId);

  // Check if part of a group
  if (order.order_group_id) {
    // Fetch ALL orders in the same group
    const groupOrders = await db.query(
      'SELECT * FROM orders WHERE order_group_id = $1 ORDER BY created_at',
      [order.order_group_id]
    );

    // Build ONE HL7 message with multiple OBR segments
    const hl7Message = buildHL7MultiProcedure(groupOrders.rows);
    await sendToQIE(hl7Message);

    // Mark ALL orders as sent (prevent duplicate sends)
    await db.query(
      'UPDATE orders SET sent_to_ris = true WHERE order_group_id = $1',
      [order.order_group_id]
    );
  } else {
    // Single order - existing logic
    const hl7Message = buildHL7(order);
    await sendToQIE(hl7Message);
  }
}
```

**File:** `src/services/hl7/hl7-builder.ts`

```typescript
function buildHL7MultiProcedure(orders: Order[]): string {
  const firstOrder = orders[0];

  // Build message header (ONE MSH, PID, PV1)
  const msh = buildMSH();
  const pid = buildPID(firstOrder.patient);
  const pv1 = buildPV1(firstOrder);

  // Build ORC/OBR pairs for EACH procedure
  const orcObrSegments = orders.map((order, index) => {
    const orc = buildORC(order, index + 1);
    const obr = buildOBR(order, index + 1);
    const zds = buildZDS(order); // Optional: DICOM Study UID
    return `${orc}\r${obr}\r${zds}`;
  }).join('\r');

  // Combine into complete message
  return `${msh}\r${pid}\r${pv1}\r${orcObrSegments}\r`;
}
```

---

### 2. QIE: Parse Multiple OBR Segments

**QIE JavaScript Transformer**

```javascript
function parseMultiProcedureHL7(hl7Message) {
  // Parse patient info (once)
  const patientPhone = getHL7Field(hl7Message, 'PID', 13, 0) ||
                       getHL7Field(hl7Message, 'ORC', 14, 0);
  const orderingProvider = getHL7Field(hl7Message, 'ORC', 12, 0);
  const orderingFacility = getHL7Field(hl7Message, 'ORC', 21, 0);

  // Extract ALL OBR segments
  const obrSegments = getAllSegments(hl7Message, 'OBR');

  // Parse each procedure
  const procedures = obrSegments.map(obr => {
    const cptCode = getField(obr, 4, 1);
    const description = getField(obr, 4, 2);
    const modalityCode = getField(obr, 24, 0);

    return {
      cpt: cptCode,
      description: description,
      modality: normalizeModality(modalityCode).code,
      modalityDisplay: normalizeModality(modalityCode).display,
      duration: getModalityDuration(modalityCode) // e.g., CT = 30 min
    };
  });

  // Determine if procedures can be scheduled together
  const modalities = [...new Set(procedures.map(p => p.modality))];
  const canScheduleTogether = modalities.length === 1; // Same modality

  // Calculate total duration
  const totalDuration = procedures.reduce((sum, p) => sum + p.duration, 0);

  // Build webhook payload
  return {
    orderId: getField(hl7Message, 'ORC', 2, 0),
    orderGroupId: `GRP-${Date.now()}`, // Or extract from ORC-2
    procedures: procedures,
    modality: modalities[0], // Primary modality
    modalityDisplay: procedures[0].modalityDisplay,
    totalDuration: totalDuration,
    canScheduleTogether: canScheduleTogether,
    orderingProvider: formatProviderName(orderingProvider),
    orderingFacility: orderingFacility,
    patientPhone: normalizePhoneE164(patientPhone),
    priority: 'routine',
    queuedAt: new Date().toISOString()
  };
}

// Helper: Get standard duration for modality
function getModalityDuration(modalityCode) {
  const durations = {
    'MR': 45, 'MRI': 45,
    'CT': 30,
    'US': 30,
    'XR': 15, 'CR': 15, 'DX': 15,
    'MG': 30,
    'PT': 60, 'NM': 60,
    'RF': 30
  };
  return durations[modalityCode.toUpperCase()] || 30;
}
```

---

### 3. Mock RIS: Store and Query Multi-Procedure Orders

**Database Schema Update**

```sql
-- Add procedures JSONB column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS procedures JSONB DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_duration INTEGER DEFAULT 30;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS can_schedule_together BOOLEAN DEFAULT true;

-- Example data structure
INSERT INTO orders (
  order_id,
  modality,
  procedures,
  total_duration,
  can_schedule_together,
  patient_phone
) VALUES (
  'ORD-26020',
  'CT',
  '[
    {"cpt": "71275", "description": "CT Chest", "duration": 30},
    {"cpt": "74175", "description": "CT Abd/Pelvis", "duration": 30}
  ]'::jsonb,
  60,
  true,
  '+12393229966'
);
```

**API Endpoint: Get Available Slots (Duration-Aware)**

```typescript
// GET /api/available-slots?location=downtown&modality=CT&date=2025-10-17&duration=60
async function getAvailableSlots(req, res) {
  const { location, modality, date, duration = 30 } = req.query;

  // Get base slots (30-min increments)
  const baseSlots = await db.query(
    `SELECT * FROM calendar_slots
     WHERE location = $1
       AND modality = $2
       AND date = $3
       AND available = true
     ORDER BY datetime`,
    [location, modality, date]
  );

  // If duration > 30 min, need to find consecutive available slots
  const blocksNeeded = Math.ceil(duration / 30);

  if (blocksNeeded === 1) {
    // Simple case: return individual slots
    return res.json({ slots: baseSlots.rows });
  }

  // Complex case: find consecutive blocks
  const availableBlocks = [];

  for (let i = 0; i <= baseSlots.rows.length - blocksNeeded; i++) {
    const consecutiveSlots = baseSlots.rows.slice(i, i + blocksNeeded);

    // Verify slots are truly consecutive (30-min apart)
    const isConsecutive = consecutiveSlots.every((slot, idx) => {
      if (idx === 0) return true;
      const prevTime = new Date(consecutiveSlots[idx - 1].datetime);
      const currTime = new Date(slot.datetime);
      return (currTime - prevTime) === 30 * 60 * 1000; // 30 min
    });

    // Check all slots are available
    const allAvailable = consecutiveSlots.every(s => s.available);

    if (isConsecutive && allAvailable) {
      availableBlocks.push({
        id: consecutiveSlots.map(s => s.id).join(','), // "slot1,slot2"
        datetime: consecutiveSlots[0].datetime,
        endtime: new Date(
          new Date(consecutiveSlots[0].datetime).getTime() +
          duration * 60 * 1000
        ),
        duration: duration,
        displayTime: formatTimeBlock(consecutiveSlots[0].datetime, duration),
        slotIds: consecutiveSlots.map(s => s.id)
      });
    }
  }

  return res.json({ slots: availableBlocks });
}

function formatTimeBlock(startTime, duration) {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + duration * 60 * 1000);
  return `${formatTime(start)}-${formatTime(end)}`; // "9:00am-10:00am"
}
```

**API Endpoint: Book Multi-Procedure Appointment**

```typescript
// POST /api/book-appointment
async function bookAppointment(req, res) {
  const {
    orderId,
    procedures,    // NEW: Array of procedures
    slotId,        // May be comma-separated: "slot1,slot2"
    datetime,
    location,
    modality,
    patientPhone
  } = req.body;

  // Parse slot IDs (may be multiple)
  const slotIds = slotId.split(',').map(id => id.trim());

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Book ALL slots
    for (const slotIdToBook of slotIds) {
      await client.query(
        'UPDATE calendar_slots SET available = false WHERE id = $1',
        [slotIdToBook]
      );
    }

    // 2. Create appointment with procedures
    const appointment = await client.query(
      `INSERT INTO appointments (
        appointment_id,
        order_id,
        procedures,  -- JSONB array
        location,
        modality,
        datetime,
        duration,
        patient_phone,
        confirmation_code
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        generateAppointmentId(),
        orderId,
        JSON.stringify(procedures),
        location,
        modality,
        datetime,
        slotIds.length * 30, // Total duration
        patientPhone,
        generateConfirmationCode()
      ]
    );

    // 3. Update order status to scheduled
    await client.query(
      'UPDATE orders SET status = $1 WHERE order_id = $2',
      ['scheduled', orderId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      appointment: {
        appointmentId: appointment.rows[0].appointment_id,
        confirmationCode: appointment.rows[0].confirmation_code,
        procedures: procedures,
        datetime: datetime,
        duration: slotIds.length * 30
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

### 4. RadScheduler: Multi-Procedure SMS Flow

**File:** `api/src/services/sms-conversation.js`

**Update consent request (line 89):**

```javascript
async function sendConsentRequest(phoneNumber, conversation) {
  const orderData = typeof conversation.order_data === 'string'
    ? JSON.parse(conversation.order_data)
    : conversation.order_data;

  // Build procedure description
  let procedureText = '';

  if (orderData.procedures && orderData.procedures.length > 1) {
    // Multiple procedures
    const modalityName = orderData.modalityDisplay || orderData.modality;
    const descriptions = orderData.procedures.map(p => p.description).join(' + ');
    const duration = orderData.totalDuration;

    procedureText = ` for ${descriptions} (approx. ${duration} min)`;
  } else if (orderData.procedures && orderData.procedures.length === 1) {
    // Single procedure (explicit)
    procedureText = ` for ${orderData.procedures[0].description}`;
  }

  // Add provider context if available
  const providerInfo = orderData.orderingProvider
    ? ` from ${orderData.orderingProvider}`
    : '';

  const message = `Hello! You have a new imaging order${procedureText}${providerInfo}. Would you like to schedule your appointment via text message? Reply YES to continue or STOP to opt out.`;

  await sendSMS(phoneNumber, message);

  await logSMSInteraction({
    phoneNumber,
    messageType: MESSAGE_TYPES.OUTBOUND_CONSENT,
    messageDirection: 'OUTBOUND',
    consentStatus: CONSENT_STATUS.PENDING,
    sessionId: conversation.id.toString()
  });
}
```

**Update location selection (line 124):**

```javascript
async function sendLocationOptions(phoneNumber, conversation) {
  const pool = getPool();

  try {
    const orderData = typeof conversation.order_data === 'string'
      ? JSON.parse(conversation.order_data)
      : conversation.order_data;

    // Get available locations from RIS
    const locations = await risClient.getLocations(orderData.modality);

    if (locations.length === 0) {
      await sendSMS(phoneNumber, 'Sorry, there are no available locations at this time. Please call us to schedule.');
      await updateConversationState(conversation.id, STATES.CANCELLED);
      return;
    }

    // Build location selection message
    const modalityName = orderData.modalityDisplay || orderData.modality;

    // Show procedure count if multiple
    let examText = `${modalityName} exam`;
    if (orderData.procedures && orderData.procedures.length > 1) {
      examText = `${orderData.procedures.length} ${modalityName} exams`;
    }

    let message = `Please select a location for your ${examText}:\n\n`;
    locations.slice(0, 5).forEach((loc, index) => {
      message += `${index + 1}. ${loc.name} - ${loc.address}\n`;
    });
    message += `\nReply with the number (1-${Math.min(locations.length, 5)})`;

    await sendSMS(phoneNumber, message);

    // Store locations in conversation data
    await pool.query(
      `UPDATE sms_conversations
       SET order_data = jsonb_set(order_data, '{availableLocations}', $1::jsonb)
       WHERE id = $2`,
      [JSON.stringify(locations.slice(0, 5)), conversation.id]
    );

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_LOCATION_LIST,
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString()
    });
  } catch (error) {
    logger.error('Failed to send location options', {
      error: error.message,
      conversationId: conversation.id
    });
    await sendSMS(phoneNumber, 'Sorry, there was an error. Please try again later or call us to schedule.');
  }
}
```

**Update time slot selection (line 159):**

```javascript
async function sendTimeSlotOptions(phoneNumber, conversation) {
  const pool = getPool();

  try {
    const orderData = typeof conversation.order_data === 'string'
      ? JSON.parse(conversation.order_data)
      : conversation.order_data;

    const locationId = conversation.selected_location_id;
    const startDate = new Date();
    const endDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // NEW: Pass duration to get appropriate time blocks
    const duration = orderData.totalDuration || 30;

    // Get available slots from RIS (duration-aware)
    const slots = await risClient.getAvailableSlots(
      locationId,
      orderData.modality,
      startDate,
      endDate,
      duration  // NEW parameter
    );

    if (slots.length === 0) {
      await sendSMS(phoneNumber, 'Sorry, there are no available time slots. Please call us to schedule.');
      await updateConversationState(conversation.id, STATES.CANCELLED);
      return;
    }

    // Build time slot selection message
    let message = `Available times`;

    // Show duration if > 30 min
    if (duration > 30) {
      message += ` (${duration} min)`;
    }

    message += `:\n\n`;

    slots.slice(0, 5).forEach((slot, index) => {
      const date = new Date(slot.startTime);

      // For multi-slot appointments, show time range
      if (slot.duration && slot.duration > 30) {
        const endTime = new Date(date.getTime() + slot.duration * 60000);
        message += `${index + 1}. ${date.toLocaleDateString()} ${formatTime(date)}-${formatTime(endTime)}\n`;
      } else {
        // Single slot
        message += `${index + 1}. ${date.toLocaleDateString()} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n`;
      }
    });

    message += `\nReply with the number (1-${Math.min(slots.length, 5)})`;

    await sendSMS(phoneNumber, message);

    // Store slots in conversation data
    await pool.query(
      `UPDATE sms_conversations
       SET order_data = jsonb_set(order_data, '{availableSlots}', $1::jsonb)
       WHERE id = $2`,
      [JSON.stringify(slots.slice(0, 5)), conversation.id]
    );

    await logSMSInteraction({
      phoneNumber,
      messageType: MESSAGE_TYPES.OUTBOUND_TIME_SLOTS,
      messageDirection: 'OUTBOUND',
      consentStatus: CONSENT_STATUS.CONSENTED,
      sessionId: conversation.id.toString()
    });
  } catch (error) {
    logger.error('Failed to send time slot options', {
      error: error.message,
      conversationId: conversation.id
    });
    await sendSMS(phoneNumber, 'Sorry, there was an error. Please try again later or call us to schedule.');
  }
}

// Helper function
function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}
```

**Update confirmation message (line 321):**

```javascript
// In handleTimeSelection function, after booking succeeds:

// Send confirmation
const confirmDate = new Date(selectedSlot.startTime);
let confirmMessage = `Appointment confirmed!\n\n`;

// Show procedure(s)
if (orderData.procedures && orderData.procedures.length > 1) {
  const procedureNames = orderData.procedures.map(p => p.description).join(' + ');
  confirmMessage += `${procedureNames}\n`;
} else if (orderData.procedures && orderData.procedures.length === 1) {
  confirmMessage += `${orderData.procedures[0].description}\n`;
} else {
  confirmMessage += `${orderData.modality} exam\n`;
}

confirmMessage += `Date: ${confirmDate.toLocaleDateString()}\n`;

// Show time range if multi-slot
if (orderData.totalDuration && orderData.totalDuration > 30) {
  const endTime = new Date(confirmDate.getTime() + orderData.totalDuration * 60000);
  confirmMessage += `Time: ${formatTime(confirmDate)}-${formatTime(endTime)}\n`;
} else {
  confirmMessage += `Time: ${confirmDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n`;
}

confirmMessage += `Confirmation #: ${booking.confirmationNumber}\n\nPlease arrive 15 minutes early.`;

await sendSMS(phoneNumber, confirmMessage);
```

---

### 5. Update RIS API Client

**File:** `api/src/services/ris-api-client.js`

**Update getAvailableSlots function (line 130):**

```javascript
async function getAvailableSlots(locationId, modality, startDate, endDate, duration = 30) {
  // Use mock data if RIS not configured
  if (USE_MOCK_RIS) {
    return getMockTimeSlots(locationId, modality, startDate, endDate, duration);
  }

  return retryWithBackoff(async () => {
    try {
      const dateStr = startDate.toISOString().split('T')[0];

      logger.info('Fetching available slots from Mock RIS', {
        location: locationId,
        modality: modality.toLowerCase(),
        date: dateStr,
        duration: duration  // NEW
      });

      const response = await qieClient.get('/available-slots', {
        params: {
          location: locationId,