# Multi-Tenant Quick Start Guide

## 🚀 5-Minute Setup for New Radiology Group

### Prerequisites
- RadScheduler multi-tenant system deployed
- Admin API access token
- Organization details (name, RIS type)

## Step 1: Create Organization (30 seconds)

```bash
curl -X POST http://localhost:3010/api/organizations \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "memorial-radiology",
    "name": "Memorial Radiology Center"
  }'
```

Save the returned `organization.id` for next steps.

## Step 2: Configure RIS Integration (1 minute)

### For Avreo RIS:
```bash
curl -X PUT http://localhost:3010/api/organizations/{ORG_ID}/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ris",
    "settings": {
      "ris_type": "avreo",
      "api_url": "https://memorial.avreo.com/api",
      "username": "memorial_user",
      "password": "secure_password",
      "sync_enabled": true
    }
  }'
```

### For Generic HL7 RIS:
```bash
curl -X PUT http://localhost:3010/api/organizations/{ORG_ID}/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ris",
    "settings": {
      "ris_type": "generic",
      "hl7_endpoint": "https://memorial-ris.com/hl7",
      "sending_facility": "RADSCHEDULER",
      "receiving_facility": "MEMORIAL"
    }
  }'
```

## Step 3: Enable Features (30 seconds)

```bash
curl -X PUT http://localhost:3010/api/organizations/{ORG_ID}/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "features",
    "settings": {
      "sms_notifications": true,
      "ai_scheduling": true,
      "patient_portal": true,
      "hl7_integration": true
    }
  }'
```

## Step 4: Set Scheduling Rules (30 seconds)

```bash
curl -X PUT http://localhost:3010/api/organizations/{ORG_ID}/settings \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "scheduling",
    "settings": {
      "patient_self_scheduling": true,
      "allowed_modalities": ["X-Ray", "Ultrasound"],
      "business_hours_start": 7,
      "business_hours_end": 19,
      "slot_duration": 30
    }
  }'
```

## Step 5: Test Access (30 seconds)

### Via Subdomain:
```bash
curl http://memorial.radscheduler.com/api/appointments \
  -H "Authorization: Bearer USER_TOKEN"
```

### Via Header:
```bash
curl http://radscheduler.com/api/appointments \
  -H "X-Organization-Slug: memorial-radiology" \
  -H "Authorization: Bearer USER_TOKEN"
```

### Via Path:
```bash
curl http://radscheduler.com/org/memorial-radiology/api/appointments \
  -H "Authorization: Bearer USER_TOKEN"
```

## 🎉 Done! Organization is Ready

The new radiology group now has:
- ✅ Isolated data environment
- ✅ Configured RIS integration
- ✅ Enabled features
- ✅ Scheduling rules set
- ✅ Multiple access methods

## Common Configurations by RIS Type

### Avreo Configuration
```javascript
{
  "ris_type": "avreo",
  "patient_self_scheduling": true,
  "allowed_modalities": ["X-Ray", "Ultrasound", "Mammography"],
  "ai_scheduling": true,
  "sync_interval": 300000 // 5 minutes
}
```

### Epic Configuration
```javascript
{
  "ris_type": "epic",
  "patient_self_scheduling": false, // Epic handles this
  "hl7_integration": true,
  "sync_interval": 600000 // 10 minutes
}
```

### Cerner Configuration
```javascript
{
  "ris_type": "cerner",
  "patient_self_scheduling": false, // Cerner handles this
  "hl7_integration": true,
  "sync_interval": 900000 // 15 minutes
}
```

## Testing Checklist

After setup, verify:
- [ ] Organization appears in list: `GET /api/organizations`
- [ ] Settings are saved: `GET /api/organizations/{id}`
- [ ] RIS connection works: Check logs
- [ ] Appointments API works with org context
- [ ] Patient scheduling (if enabled) works

## Troubleshooting

### Organization not accessible?
Check slug format (lowercase, hyphens only):
```bash
# Good: memorial-radiology, city-imaging
# Bad: Memorial_Radiology, City Imaging
```

### RIS connection failing?
Verify credentials in settings:
```bash
curl http://localhost:3010/api/organizations/{ORG_ID}/ris-config \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### Features not working?
Check feature flags:
```bash
curl http://localhost:3010/api/organizations/{ORG_ID}/features/patient_portal \
  -H "Authorization: Bearer TOKEN"
```

## Support
- Documentation: `/docs/MULTI_TENANT_ARCHITECTURE.md`
- API Reference: `/docs/API_ENDPOINTS.md`
- Contact: support@radscheduler.com