# RadScheduler API Documentation

## Authentication API

### POST `/api/auth/login`
- **Description:** Authenticate user and receive JWT token.
- **Body:**
```json
{
  "email": "admin@radscheduler.com", // required, valid email
  "password": "password" // required, minimum 6 characters
}
```
- **Validation:** Email must be valid format. Password minimum 6 characters.
- **Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "name": "Admin User",
    "email": "admin@radscheduler.com",
    "role": "admin"
  }
}
```

### POST `/api/auth/register`
- **Description:** Register new user (admin only).
- **Headers:** `Authorization: Bearer <token>` (admin token required)
- **Body:**
```json
{
  "name": "New User", // required, 2-100 characters
  "email": "user@example.com", // required, valid email
  "password": "password123", // required, minimum 8 characters
  "role": "viewer" // optional: admin, radiologist, technologist, scheduler, viewer
}
```
- **Validation:** All fields validated. Role must be valid enum.
- **Response:**
```json
{
  "success": true,
  "user": {
    "id": "4",
    "name": "New User",
    "email": "user@example.com",
    "role": "viewer"
  }
}
```

### GET `/api/auth/profile`
- **Description:** Get current user profile.
- **Headers:** `Authorization: Bearer <token>` (required)
- **Response:**
```json
{
  "success": true,
  "user": {
    "id": "1",
    "name": "Admin User",
    "email": "admin@radscheduler.com",
    "role": "admin"
  }
}
```

### POST `/api/auth/logout`
- **Description:** Logout user (client-side token removal).
- **Headers:** `Authorization: Bearer <token>` (required)
- **Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### POST `/api/auth/refresh`
- **Description:** Refresh JWT token.
- **Headers:** `Authorization: Bearer <token>` (required)
- **Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### GET `/api/auth/users`
- **Description:** Get all users (admin only).
- **Headers:** `Authorization: Bearer <token>` (admin token required)
- **Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "1",
      "name": "Admin User",
      "email": "admin@radscheduler.com",
      "role": "admin"
    }
  ]
}
```

---

## User Roles & Permissions

### Roles
- **admin:** Full system access
- **radiologist:** Read/write appointments, read analytics, read clinical data
- **technologist:** Read/write appointments, read analytics
- **scheduler:** Read/write appointments, read analytics, write clinical data
- **viewer:** Read appointments, read analytics

### Permissions
- `read:appointments` - View appointments
- `write:appointments` - Create/update appointments
- `read:analytics` - View analytics
- `read:clinical` - View clinical data
- `write:clinical` - Create/update clinical data
- `*` - All permissions (admin only)

---

## Appointments API

## Appointments (`/api/appointments`)
- **GET `/`**: List all appointments (with optional filters: date, modality, status)
- **GET `/:id`**: Get a single appointment by ID
- **PATCH `/:id`**: Update appointment (status, notes, datetime)
- **GET `/latest`**: Get the latest appointment for today
- **GET `/stats/today`**: Get today's appointment stats

## Clinical Integration (`/api/clinical`)
- **POST `/clinical-decision`**: Create appointment from clinical decision support
- **GET `/available-slots`**: Get available slots for clinical scheduling
- **POST `/send-clinical-sms`**: Send enhanced SMS with clinical context
- **GET `/clinical-analytics`**: Get clinical analytics (risk scores, modality breakdown, etc.)

## Analytics (`/api/analytics`)
- **POST `/optimize`**: AI schedule optimization
- **GET `/utilization`**: Utilization metrics
- **GET `/performance`**: Performance metrics
- **GET `/dashboard`**: Real-time dashboard data

## HL7 Integration (`/api/hl7`)
- **POST `/appointment`**: Receive HL7 appointment message (from Mirth)
- **POST `/raw`**: Receive raw HL7 message
- **POST `/simulate`**: Simulate HL7 message for testing

## Avreo Integration (`/api/avreo`)
- **POST `/sync`**: Manual sync appointments from Avreo (admin, scheduler)
- **GET `/status`**: Get Avreo sync status and connection info
- **POST `/test-connection`**: Test Avreo API connection (admin)
- **GET `/config`**: Get Avreo configuration (admin)
- **POST `/schedule-sync`**: Schedule automatic sync every 5 minutes (admin)

## Demo/Testing (`/api/demo`) (non-production only)
- **POST `/scenario/:name`**: Trigger demo scenarios (dramatic-save, efficiency-boost, bulk-sms)
- **POST `/reset`**: Reset demo state

## Appointments API

### GET `/api/appointments`
- **Description:** List all appointments, optionally filtered by date, modality, or status.
- **Query Parameters:**
  - `date` (string, ISO 8601, optional)
  - `modality` (string, optional)
  - `status` (string, one of `SCHEDULED`, `COMPLETED`, `CANCELLED`, optional)
- **Validation:** All query params validated. 400 on invalid input.
- **Response:**
```json
{
  "success": true,
  "count": 2,
  "appointments": [
    { "id": "1", "patient_name": "John Smith", ... }
  ]
}
```

### GET `/api/appointments/:id`
- **Description:** Get a single appointment by ID.
- **Path Parameters:**
  - `id` (alphanumeric string, required)
- **Validation:** 400 if invalid ID. 404 if not found.
- **Response:**
```json
{
  "success": true,
  "appointment": { "id": "1", ... }
}
```

### PATCH `/api/appointments/:id`
- **Description:** Update an appointment's status, notes, or datetime.
- **Path Parameters:**
  - `id` (alphanumeric string, required)
- **Body:**
```json
{
  "status": "SCHEDULED", // optional, one of SCHEDULED, COMPLETED, CANCELLED
  "notes": "string",      // optional
  "datetime": "2025-06-27T08:00:10.066Z" // optional, ISO 8601
}
```
- **Validation:** 400 if invalid ID or body. All fields optional, but at least one must be present.
- **Response:**
```json
{
  "success": true,
  "appointment": { ... }
}
```

### GET `/api/appointments/latest`
- **Description:** Get the latest appointment for today (for live demo/testing).
- **Response:**
```json
{
  "success": true,
  "appointment": { ... }
}
```

### GET `/api/appointments/stats/today`
- **Description:** Get today's appointment statistics.
- **Response:**
```json
{
  "success": true,
  "stats": { ... }
}
```

## Clinical Integration API

### POST `/api/clinical-integration/clinical-decision`
- **Description:** Process clinical decisions from decision support platforms and create appointments.
- **Body:**
```json
{
  "patientId": "P12345", // optional
  "patientName": "John Doe", // optional
  "patientPhone": "+1234567890", // optional, E.164 format
  "clinicalData": {
    "riskScore": 75, // optional, 0-100
    "modality": "MRI", // optional
    "recommendedProtocol": "Brain with Contrast", // optional
    "referringPhysician": "Dr. Smith", // optional
    "urgency": "routine", // optional: routine, urgent, emergency
    "analysis": "AI analysis completed", // optional
    "recommendations": ["Follow-up in 3 months"] // optional, array of strings
  }, // optional
  "schedulingPreferences": {
    "preferredDateTime": "2025-06-27T10:00:00Z" // optional, ISO 8601
  }, // optional
  "source": "clinical_decision_platform" // optional
}
```
- **Validation:** Phone number must be E.164 format. Risk score 0-100. Urgency must be valid enum.
- **Response:**
```json
{
  "success": true,
  "appointmentId": "1",
  "clinicalContext": {
    "riskScore": 75,
    "analysis": "AI analysis completed",
    "recommendations": ["Follow-up in 3 months"]
  },
  "schedulingOptions": [],
  "message": "Clinical decision processed and appointment created"
}
```

### GET `/api/clinical-integration/available-slots`
- **Description:** Get available appointment slots for clinical scheduling.
- **Query Parameters:**
  - `modality` (string, optional)
  - `date` (string, ISO 8601, optional)
  - `duration` (number, 15-120 minutes, default: 30)
- **Validation:** Duration must be 15-120 minutes. Date must be ISO 8601.
- **Response:**
```json
{
  "success": true,
  "availableSlots": [
    {
      "datetime": "2025-06-27T08:00:00Z",
      "available": true,
      "duration": 30
    }
  ],
  "totalSlots": 20
}
```

### POST `/api/clinical-integration/send-clinical-sms`
- **Description:** Send enhanced SMS with clinical context to patients.
- **Body:**
```json
{
  "patientPhone": "+1234567890", // required, E.164 format
  "clinicalData": {
    "modality": "MRI", // required
    "riskScore": 75, // optional, 0-100
    "recommendedProtocol": "Brain with Contrast", // optional
    "urgency": "routine" // optional: routine, urgent, emergency
  }, // required
  "bookingUrl": "https://patient-portal.com/book/123", // required, valid URL
  "appointmentId": "123" // optional
}
```
- **Validation:** Phone number required and must be E.164. Clinical data required. Booking URL must be valid URI.
- **Response:**
```json
{
  "success": true,
  "messageId": "SM123456789",
  "clinicalContext": {
    "modality": "MRI",
    "riskScore": 75,
    "recommendedProtocol": "Brain with Contrast",
    "urgency": "routine"
  }
}
```

### GET `/api/clinical-integration/clinical-analytics`
- **Description:** Get clinical analytics and metrics.
- **Query Parameters:**
  - `date` (string, ISO 8601, optional)
  - `modality` (string, optional)
- **Validation:** Date must be ISO 8601 format.
- **Response:**
```json
{
  "success": true,
  "analytics": {
    "totalAppointments": 25,
    "averageRiskScore": 68,
    "modalityDistribution": {
      "MRI": 15,
      "CT": 8,
      "X-Ray": 2
    },
    "urgencyBreakdown": {
      "routine": 20,
      "urgent": 4,
      "emergency": 1
    },
    "clinicalDecisions": 12
  }
}
```

## HL7 Integration API

### POST `/api/hl7/appointment`
- **Description:** Process HL7 appointment messages from Mirth or other HL7 systems.
- **Body:**
```json
{
  "patientId": "P12345", // required
  "patientName": "John Doe", // required
  "patientPhone": "+1234567890", // optional, E.164 format
  "modality": "MRI", // required
  "studyType": "Brain with Contrast", // required
  "datetime": "2025-06-27T10:00:00Z", // required, ISO 8601
  "referringPhysician": "Dr. Smith", // required
  "urgency": "routine" // optional: routine, urgent, emergency
}
```
- **Validation:** Required fields must be present. Phone must be E.164. Datetime must be ISO 8601. Urgency must be valid enum.
- **Response:**
```json
{
  "success": true,
  "appointmentId": "1",
  "conflicts": [],
  "message": "Appointment processed successfully"
}
```

### POST `/api/hl7/raw`
- **Description:** Process raw HL7 messages (string format).
- **Body:** Raw HL7 message string (minimum 10 characters)
- **Validation:** Must be non-empty string with minimum length.
- **Response:**
```json
{
  "success": true,
  "message": "HL7 message processed",
  "appointmentId": "1"
}
```

### POST `/api/hl7/simulate`
- **Description:** Simulate HL7 messages for testing and demo purposes.
- **Body:**
```json
{
  "patientName": "Test Patient", // optional
  "modality": "MRI", // optional
  "datetime": "2025-06-27T10:00:00Z", // optional, ISO 8601
  "scenario": "dramatic_save" // optional: dramatic_save, efficiency_boost, bulk_processing
}
```
- **Validation:** All fields optional. Datetime must be ISO 8601. Scenario must be valid enum.
- **Response:**
```json
{
  "success": true,
  "message": "Simulated HL7 processed",
  "result": {
    "appointment": { ... },
    "conflicts": []
  }
}
```

## Analytics API

### POST `/api/analytics/optimize`
- **Description:** Get AI-powered schedule optimization recommendations.
- **Body:**
```json
{
  "date": "2025-06-27", // optional, ISO 8601 date
  "modality": "MRI" // optional
}
```
- **Validation:** Date must be ISO 8601 format if provided.
- **Response:**
```json
{
  "success": true,
  "optimization": {
    "recommendations": [...],
    "efficiencyGain": 25,
    "revenueImpact": 15000
  }
}
```

### GET `/api/analytics/utilization`
- **Description:** Get utilization metrics and efficiency data.
- **Query Parameters:**
  - `date` (string, ISO 8601, optional)
  - `modality` (string, optional)
- **Validation:** Date must be ISO 8601 format if provided.
- **Response:**
```json
{
  "success": true,
  "metrics": {
    "date": "2025-06-27",
    "modality": "ALL",
    "utilization": {
      "current": 72.5,
      "target": 90,
      "improvement": 25
    },
    "efficiency": {
      "waitTime": 47,
      "throughput": 85,
      "satisfaction": 72
    },
    "financial": {
      "dailyRevenue": 125000,
      "costPerSlot": 450,
      "profitMargin": 0.42
    }
  }
}
```

### GET `/api/analytics/performance`
- **Description:** Get system performance metrics.
- **Response:**
```json
{
  "success": true,
  "performance": {
    "processing": {
      "messagesProcessed": 9876,
      "averageTime": 47,
      "successRate": 99.7,
      "errorRate": 0.3
    },
    "system": {
      "uptime": "99.97%",
      "responseTime": 142,
      "throughput": "1000 msg/sec",
      "activeConnections": 27
    },
    "business": {
      "appointmentsScheduled": 4521,
      "noShowReduction": 47,
      "revenueIncrease": 2300000,
      "satisfactionScore": 94
    }
  }
}
```

### GET `/api/analytics/dashboard`
- **Description:** Get real-time dashboard data for monitoring.
- **Response:**
```json
{
  "success": true,
  "dashboard": {
    "overview": {
      "totalToday": 25,
      "completed": 18,
      "scheduled": 5,
      "cancelled": 2
    },
    "realtime": {
      "processingNow": 3,
      "queueLength": 7,
      "activeUsers": 15
    },
    "trends": {
      "hourly": [
        {
          "hour": "8:00",
          "appointments": 8,
          "utilization": 75
        }
      ],
      "modality": [
        {
          "modality": "MRI",
          "count": 45,
          "percentage": 35
        }
      ]
    }
  }
}
```

## Demo API

### POST `/api/demo/scenario/:name`
- **Description:** Trigger demo scenarios for presentations and testing.
- **Path Parameters:**
  - `name` (string, required): One of `dramatic-save`, `efficiency-boost`, `bulk-sms`
- **Body:** Required only for `bulk-sms` scenario:
```json
{
  "phoneNumbers": ["+1234567890", "+1987654321"] // required for bulk-sms, E.164 format
}
```
- **Validation:** Scenario name must be valid enum. Phone numbers must be E.164 format for bulk-sms.
- **Response:**
```json
{
  "success": true,
  "message": "Scenario dramatic-save triggered"
}
```

### POST `/api/demo/reset`
- **Description:** Reset demo state and clear demo-specific data.
- **Response:**
```json
{
  "success": true,
  "message": "Demo state reset"
}
```

---

## Summary

### Common Response Patterns
All endpoints follow a consistent response structure:
- **Success:** `{ "success": true, ... }`
- **Error:** `{ "success": false, "error": "..." }`

### HTTP Status Codes
- **200/201:** Success
- **400:** Validation error (invalid input)
- **404:** Resource not found
- **500:** Server error

### Validation Rules
- **Phone Numbers:** E.164 format (`+1234567890`)
- **Dates:** ISO 8601 format (`2025-06-27T10:00:00Z`)
- **IDs:** Alphanumeric strings
- **Enums:** Specific allowed values (e.g., `routine`, `urgent`, `emergency`)

### Error Handling
All endpoints include:
- Input validation with Joi
- Try-catch error handling
- Structured error responses
- Comprehensive logging

### Security Notes
- Demo endpoints should be disabled in production
- Phone numbers validated for E.164 format
- All inputs sanitized and validated
- Audit logging for sensitive operations