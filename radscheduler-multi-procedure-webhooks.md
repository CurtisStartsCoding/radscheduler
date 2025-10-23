# RadScheduler Multi-Procedure Webhook Enhancement

## Overview
RadScheduler needs to be updated to handle enhanced webhook payloads from RIS systems (Mock RIS, Fujifilm Synapse) that send multiple webhooks for multi-procedure orders. Each webhook now contains the full context of all procedures in the group.

## Problem Statement
When a multi-procedure order (e.g., "CT Chest + CT Abdomen/Pelvis") is sent:
- RIS systems create N separate orders from one HL7 message
- Each order triggers a separate webhook to RadScheduler
- Currently, RadScheduler only sees individual procedures
- Patients receive generic "CT exam" messages instead of detailed procedure lists
- Appointments are booked for 30 minutes regardless of actual duration needed

## Enhanced Webhook Format

### Current Format (Single Procedure)
```json
{
  "orderId": "ORD-12345",
  "patientId": "PAT-67890",
  "patientPhone": "+15551234567",
  "modality": "CT",
  "priority": "routine",
  "orderDescription": "CT Chest with Contrast",
  "queuedAt": "2025-10-23T12:30:00Z"
}
```

### New Enhanced Format (Multi-Procedure Aware)
```json
{
  "orderId": "ORD-12345-1",
  "orderGroupId": "ORD-12345",          // Base order number for grouping
  "orderSequence": 1,                   // Position in group (1-based)
  "totalInGroup": 2,                    // Total procedures in group
  "procedures": [                       // ALL procedures in the group
    {
      "orderId": "ORD-12345-1",
      "cptCode": "71275",
      "description": "CT angiography chest with contrast",
      "estimatedMinutes": 30
    },
    {
      "orderId": "ORD-12345-2",
      "cptCode": "74175",
      "description": "CT angiography abdomen/pelvis with contrast",
      "estimatedMinutes": 30
    }
  ],
  "estimatedDuration": 60,              // Total minutes for all procedures
  "patientPhone": "+15551234567",
  "patientName": "John Doe",
  "modality": "ct",
  "priority": "routine",
  "procedureDescription": "CT angiography chest with contrast",  // Legacy field
  "queuedAt": "2025-10-23T12:30:00Z"
}
```

## Required RadScheduler Updates

### 1. Webhook Handler (`order-webhook.js`)
- Extract new fields: `procedures`, `estimatedDuration`, `orderGroupId`, `totalInGroup`
- Maintain backward compatibility with old format
- Pass procedures array to conversation service

### 2. SMS Message Generation (`sms-conversation.js`)
Update message generation to be descriptive:

**Single Procedure:**
```
"Please select a location for your CT chest exam"
```

**Multiple Procedures:**
```
"Please select a location for your 2 imaging exams:
- CT chest
- CT abdomen/pelvis
(Total time: 60 minutes)"
```

### 3. Appointment Booking
- Use `estimatedDuration` instead of hardcoded 30 minutes
- Pass correct duration when requesting available slots
- Ensure booked slots accommodate all procedures

### 4. Conversation State Management
- Store full procedures array in conversation data
- Track which procedures have been scheduled
- Handle partial scheduling scenarios

## Implementation Strategy

### Phase 1: Support Enhanced Format
```javascript
// order-webhook.js
const {
  orderId,
  orderGroupId,        // NEW
  procedures,          // NEW
  estimatedDuration,   // NEW
  patientPhone,
  modality,
  priority,
  orderDescription,    // Fallback
  queuedAt
} = req.body;

// Build order data with procedures
const orderData = {
  orderId,
  orderGroupId: orderGroupId || orderId,
  procedures: procedures || [{
    orderId,
    description: orderDescription || `${modality} exam`,
    estimatedMinutes: 30
  }],
  estimatedDuration: estimatedDuration || 30,
  // ... rest of fields
};
```

### Phase 2: Update SMS Messages
```javascript
// sms-conversation.js
function generateLocationMessage(orderData) {
  const { procedures, modality, estimatedDuration } = orderData;

  if (procedures && procedures.length > 1) {
    let message = `Please select a location for your ${procedures.length} imaging exams:\n`;
    procedures.forEach(proc => {
      message += `- ${proc.description}\n`;
    });
    message += `(Total time: ${estimatedDuration} minutes)\n\n`;
    return message;
  } else {
    const description = procedures?.[0]?.description || `${modality} exam`;
    return `Please select a location for your ${description}:\n\n`;
  }
}
```

### Phase 3: Appointment Duration
```javascript
// When booking appointment
const duration = orderData.estimatedDuration || 30;
const availableSlots = await getRISAvailableSlots(location, modality, duration);
```

## Testing Scenarios

### Test Case 1: Single Procedure (Backward Compatibility)
- Send old format webhook
- Verify SMS shows single procedure
- Confirm 30-minute slot booked

### Test Case 2: Multi-Procedure Order
- Send enhanced webhook with 2 procedures
- Verify SMS lists both procedures with total time
- Confirm 60-minute slot booked

### Test Case 3: Mixed Conversation
- Start with single procedure
- Add multi-procedure order to same conversation
- Verify proper aggregation and messaging

## Benefits
1. **Improved Patient Communication**: Clear listing of all procedures
2. **Accurate Scheduling**: Proper time slots for multi-procedure appointments
3. **Reduced Confusion**: One SMS conversation for related procedures
4. **RIS Compatibility**: Works with Synapse and other RIS systems that create separate orders

## Notes
- Mock RIS already sends the enhanced format as of Phase 5.3
- QIE aggregation layer (if implemented) would consolidate webhooks before RadScheduler
- This enhancement maintains full backward compatibility
- No database schema changes required