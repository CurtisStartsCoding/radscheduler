# Multi-Tenant Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [Component Structure](#component-structure)
4. [Implementation Guide](#implementation-guide)
5. [API Reference](#api-reference)
6. [Configuration Guide](#configuration-guide)
7. [Migration Guide](#migration-guide)
8. [Troubleshooting](#troubleshooting)

## Overview

RadScheduler's multi-tenant architecture enables a single deployment to serve multiple radiology organizations with complete data isolation, customizable configurations, and organization-specific RIS integrations.

### Key Features
- **Complete Data Isolation**: Each organization's data is separated at the database level
- **Flexible RIS Support**: Each organization can use different RIS systems (Avreo, Epic, Cerner, Generic HL7)
- **Configuration-Driven**: No code changes required to add new organizations
- **SRP Compliance**: Every component has a single, clear responsibility
- **Scalable**: Supports hundreds of organizations on a single deployment

## Architecture Principles

### Single Responsibility Principle (SRP)
Every class and module has exactly one reason to change:

```
Repository → ONLY database operations
Service → ONLY business logic
Middleware → ONLY request processing
Controller → ONLY HTTP handling
Adapter → ONLY external system integration
Factory → ONLY object creation
Provider → ONLY configuration access
```

### Separation of Concerns
```
┌─────────────────────────────────────┐
│         HTTP Layer (Routes)         │
├─────────────────────────────────────┤
│      Middleware (Auth, Tenant)      │
├─────────────────────────────────────┤
│     Business Logic (Services)       │
├─────────────────────────────────────┤
│      Data Access (Repository)       │
├─────────────────────────────────────┤
│         Database (PostgreSQL)       │
└─────────────────────────────────────┘
```

## Component Structure

### 1. Database Layer

#### Organizations Table
```sql
organizations
├── id (UUID, Primary Key)
├── slug (VARCHAR, Unique) - URL-safe identifier
├── name (VARCHAR) - Display name
├── is_active (BOOLEAN) - Enable/disable access
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Organization Settings Table
```sql
organization_settings
├── id (UUID, Primary Key)
├── organization_id (UUID, Foreign Key)
├── setting_key (VARCHAR)
├── setting_value (JSONB)
├── setting_type (VARCHAR) - 'ris', 'scheduling', 'features', 'branding'
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### 2. Repository Layer

**File**: `api/src/repositories/organization.repository.js`
- **Responsibility**: Database operations for organizations
- **Methods**:
  - `findById(id)` - Find organization by UUID
  - `findBySlug(slug)` - Find organization by slug
  - `create(data)` - Create new organization
  - `update(id, data)` - Update organization
  - `listActive()` - List all active organizations
  - `slugExists(slug)` - Check if slug exists

**File**: `api/src/repositories/organization-settings.repository.js`
- **Responsibility**: Database operations for settings
- **Methods**:
  - `getSetting(orgId, key)` - Get single setting
  - `getAllSettings(orgId)` - Get all settings for organization
  - `setSetting(orgId, key, value, type)` - Set a setting
  - `deleteSetting(orgId, key)` - Delete a setting
  - `getSettingsByType(orgId, type)` - Get settings by type

### 3. Service Layer

**File**: `api/src/services/organization.service.js`
- **Responsibility**: Business logic for organizations
- **Methods**:
  - `createOrganization(data)` - Create with validation and defaults
  - `getOrganization(identifier)` - Get by ID or slug
  - `updateSettings(orgId, type, settings)` - Update with validation
  - `getRISConfiguration(orgId)` - Get RIS config with defaults
  - `isFeatureEnabled(orgId, feature)` - Check feature flags

### 4. Middleware Layer

**File**: `api/src/middleware/tenant-resolver.js`
- **Responsibility**: Identify organization from request
- **Resolution Order**:
  1. Subdomain (memorial.radscheduler.com)
  2. Path prefix (/org/memorial/...)
  3. Header (X-Organization-Id or X-Organization-Slug)
  4. Query parameter (?org=memorial)
  5. Default (from environment)

**File**: `api/src/middleware/tenant-context.js`
- **Responsibility**: Load organization data into request
- **Methods**:
  - `load(options)` - Load organization context
  - `require()` - Require organization context
  - `optional()` - Optionally load context
  - `getOrganization(req)` - Helper to get org from request
  - `getOrganizationId(req)` - Helper to get org ID

### 5. Adapter Layer

**File**: `api/src/adapters/base-ris-adapter.js`
- **Responsibility**: Define interface for RIS adapters
- **Abstract Methods**:
  - `connect()` - Establish connection
  - `disconnect()` - Close connection
  - `fetchAppointments(startDate, endDate)` - Get appointments
  - `createAppointment(data)` - Create appointment
  - `updateAppointment(id, data)` - Update appointment
  - `cancelAppointment(id, reason)` - Cancel appointment
  - `getAvailableSlots(date, modality, duration)` - Get slots
  - `sendHL7Message(type, data)` - Send HL7 message

**File**: `api/src/adapters/ris-adapter-factory.js`
- **Responsibility**: Create appropriate adapter instances
- **Methods**:
  - `create(type, config)` - Create adapter by type
  - `registerAdapter(type, class)` - Register custom adapter
  - `getAvailableTypes()` - List available types
  - `hasAdapter(type)` - Check if type exists

### 6. Configuration Provider

**File**: `api/src/services/configuration-provider.js`
- **Responsibility**: Provide configuration with caching
- **Methods**:
  - `getRISConfig(orgId)` - Get RIS configuration
  - `getSchedulingConfig(orgId)` - Get scheduling rules
  - `getFeatures(orgId)` - Get feature flags
  - `getBrandingConfig(orgId)` - Get branding settings
  - `getValue(orgId, key, default)` - Get specific value
  - `clearCache(orgId)` - Clear organization cache

## Implementation Guide

### Step 1: Run Database Migrations

```bash
# Run migrations in order
psql -U raduser -d radscheduler -f api/scripts/001-add-organizations-table.sql
psql -U raduser -d radscheduler -f api/scripts/002-add-organization-settings.sql
psql -U raduser -d radscheduler -f api/scripts/003-add-org-id-to-tables.sql
```

### Step 2: Update Server Configuration

Add middleware to `api/src/server.js`:

```javascript
const tenantResolver = require('./middleware/tenant-resolver');
const tenantContext = require('./middleware/tenant-context');
const organizationRoutes = require('./routes/organizations');

// Add after other middleware
app.use(tenantResolver.resolve());
app.use(tenantContext.optional()); // or .require() for mandatory

// Add organization management routes
app.use('/api/organizations', organizationRoutes);
```

### Step 3: Update Existing Routes

Modify existing routes to use organization context:

```javascript
// Example: Update appointments route
router.get('/appointments',
  authenticate,
  tenantContext.require(), // Require organization context
  async (req, res) => {
    const orgId = req.organizationId; // Now available
    const appointments = await getAppointments({
      organization_id: orgId,
      ...req.query
    });
    res.json({ success: true, appointments });
  }
);
```

### Step 4: Create RIS Adapter Instance

```javascript
const configProvider = require('./services/configuration-provider');
const adapterFactory = require('./adapters/ris-adapter-factory');

async function getRISAdapter(organizationId) {
  const risConfig = await configProvider.getRISConfig(organizationId);
  return adapterFactory.create(risConfig.ris_type, risConfig);
}
```

## API Reference

### Organization Management

#### Create Organization
```http
POST /api/organizations
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "slug": "memorial-radiology",
  "name": "Memorial Radiology Center"
}

Response: 201 Created
{
  "success": true,
  "organization": {
    "id": "uuid",
    "slug": "memorial-radiology",
    "name": "Memorial Radiology Center",
    "is_active": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### Get Organization
```http
GET /api/organizations/{id_or_slug}
Authorization: Bearer {token}

Response: 200 OK
{
  "success": true,
  "organization": {
    "id": "uuid",
    "slug": "memorial-radiology",
    "name": "Memorial Radiology Center",
    "settings": {
      "ris": {...},
      "scheduling": {...},
      "features": {...},
      "branding": {...}
    }
  }
}
```

#### Update Organization Settings
```http
PUT /api/organizations/{id}/settings
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "type": "ris",
  "settings": {
    "ris_type": "avreo",
    "api_url": "https://api.avreo.com",
    "username": "user",
    "password": "pass"
  }
}

Response: 200 OK
{
  "success": true,
  "message": "Settings updated successfully"
}
```

## Configuration Guide

### RIS Configuration

```javascript
{
  "type": "ris",
  "settings": {
    "ris_type": "avreo|epic|cerner|generic",
    "api_url": "https://ris-api.example.com",
    "api_key": "secret_key",
    "username": "username",
    "password": "password",
    "hl7_endpoint": "https://hl7.example.com",
    "hl7_version": "2.5.1",
    "sending_facility": "RADSCHEDULER",
    "receiving_facility": "RIS",
    "sync_enabled": true,
    "sync_interval": 300000
  }
}
```

### Scheduling Configuration

```javascript
{
  "type": "scheduling",
  "settings": {
    "patient_self_scheduling": true,
    "allowed_modalities": ["X-Ray", "Ultrasound", "CT", "MRI"],
    "restricted_modalities": ["PET", "Nuclear"],
    "business_hours_start": 8,
    "business_hours_end": 18,
    "slot_duration": 30,
    "max_advance_booking_days": 30,
    "min_advance_booking_hours": 24,
    "require_approval_modalities": ["MRI", "CT"]
  }
}
```

### Feature Flags

```javascript
{
  "type": "features",
  "settings": {
    "sms_notifications": true,
    "email_notifications": false,
    "ai_scheduling": true,
    "patient_portal": true,
    "hl7_integration": true,
    "document_upload": false,
    "video_consultation": false,
    "automated_reminders": true
  }
}
```

### Branding Configuration

```javascript
{
  "type": "branding",
  "settings": {
    "logo_url": "https://example.com/logo.png",
    "primary_color": "#1e40af",
    "secondary_color": "#3b82f6",
    "company_name": "Memorial Radiology",
    "support_email": "support@memorial.com",
    "support_phone": "+1-555-0100",
    "custom_css": ".header { background: #custom; }"
  }
}
```

## Migration Guide

### Migrating from Single-Tenant

1. **Create Default Organization**
```sql
INSERT INTO organizations (slug, name)
VALUES ('default', 'Default Organization');
```

2. **Update Existing Data**
```sql
UPDATE appointments
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default');

UPDATE users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default');
```

3. **Migrate Environment Variables to Settings**
```javascript
// Script to migrate env vars to database
const settings = {
  ris: {
    ris_type: process.env.RIS_TYPE || 'generic',
    api_url: process.env.AVREO_API_URL,
    // ... other settings
  }
};

await organizationService.updateSettings(defaultOrgId, 'ris', settings.ris);
```

## Troubleshooting

### Common Issues

#### Organization Not Found
- **Cause**: Invalid slug or ID
- **Solution**: Check organization exists and is active
```bash
SELECT * FROM organizations WHERE slug = 'memorial-radiology';
```

#### Tenant Resolution Failing
- **Cause**: No identifier in request
- **Solution**: Set DEFAULT_ORG_SLUG environment variable
```bash
export DEFAULT_ORG_SLUG=default
```

#### RIS Adapter Connection Failed
- **Cause**: Invalid credentials or endpoint
- **Solution**: Verify settings in database
```sql
SELECT setting_value FROM organization_settings
WHERE organization_id = 'uuid' AND setting_type = 'ris';
```

### Debug Mode

Enable debug logging:
```javascript
// In tenant-resolver.js
logger.debug('Tenant resolved', req.tenantInfo);

// In organization.service.js
logger.debug('Loading organization:', identifier);
```

### Performance Optimization

1. **Enable Configuration Caching**
   - Default cache timeout: 60 seconds
   - Adjust in configuration-provider.js

2. **Database Indexes**
   - Ensure all foreign keys are indexed
   - Add composite indexes for common queries

3. **Connection Pooling**
   - Reuse RIS adapter connections
   - Implement adapter connection pool

## Security Considerations

1. **Data Isolation**
   - Always filter queries by organization_id
   - Use row-level security in PostgreSQL

2. **Authentication**
   - Validate organization access in JWT claims
   - Implement organization-level API keys

3. **Rate Limiting**
   - Apply per-organization rate limits
   - Monitor usage by organization

## Support

For questions or issues:
- Review this documentation
- Check logs in `/var/log/radscheduler/`
- Contact: support@radscheduler.com