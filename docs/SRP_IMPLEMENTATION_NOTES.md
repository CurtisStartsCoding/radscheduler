# Single Responsibility Principle Implementation

## Overview
This document details how the multi-tenant architecture strictly follows the Single Responsibility Principle (SRP), ensuring each component has exactly one reason to change.

## Core Principle
> "A class should have only one reason to change" - Robert C. Martin

## Implementation by Layer

### 1. Repository Layer
**Single Responsibility**: Database Operations Only

#### ✅ organization.repository.js
- **Responsibility**: CRUD operations for organizations table
- **What it does**: SQL queries only
- **What it doesn't do**: Business logic, validation, HTTP handling
- **Reason to change**: Database schema changes

#### ✅ organization-settings.repository.js
- **Responsibility**: CRUD operations for settings table
- **What it does**: Settings persistence only
- **What it doesn't do**: Settings validation, default values, caching
- **Reason to change**: Settings table structure changes

### 2. Service Layer
**Single Responsibility**: Business Logic Only

#### ✅ organization.service.js
- **Responsibility**: Organization business rules
- **What it does**: Validation, orchestration, business logic
- **What it doesn't do**: Database access, HTTP handling, caching
- **Reason to change**: Business rule changes

#### ✅ configuration-provider.js
- **Responsibility**: Configuration access with caching
- **What it does**: Retrieve and cache configurations
- **What it doesn't do**: Validate configs, persist configs, transform configs
- **Reason to change**: Caching strategy changes

### 3. Middleware Layer
**Single Responsibility**: Request Processing Only

#### ✅ tenant-resolver.js
- **Responsibility**: Identify organization from request
- **What it does**: Extract org identifier from subdomain/path/header/query
- **What it doesn't do**: Load org data, validate org, handle errors
- **Reason to change**: Identification strategy changes

#### ✅ tenant-context.js
- **Responsibility**: Load organization into request
- **What it does**: Fetch org data and attach to request
- **What it doesn't do**: Identify org, validate permissions, cache data
- **Reason to change**: Context loading strategy changes

### 4. Adapter Layer
**Single Responsibility**: External System Integration Only

#### ✅ base-ris-adapter.js
- **Responsibility**: Define adapter interface
- **What it does**: Specify contract for RIS adapters
- **What it doesn't do**: Implement integration, handle specific RIS
- **Reason to change**: Interface contract changes

#### ✅ generic-hl7-adapter.js
- **Responsibility**: Generic HL7 communication
- **What it does**: Send/receive HL7 messages
- **What it doesn't do**: Business logic, data persistence, authentication
- **Reason to change**: HL7 protocol changes

#### ✅ avreo-adapter.js
- **Responsibility**: Avreo API communication
- **What it does**: Avreo-specific API calls
- **What it doesn't do**: Generic logic, data persistence, caching
- **Reason to change**: Avreo API changes

### 5. Factory Layer
**Single Responsibility**: Object Creation Only

#### ✅ ris-adapter-factory.js
- **Responsibility**: Create adapter instances
- **What it does**: Instantiate correct adapter class
- **What it doesn't do**: Configure adapters, manage connections, business logic
- **Reason to change**: New adapter types

### 6. Controller Layer
**Single Responsibility**: HTTP Handling Only

#### ✅ organizations.js (routes)
- **Responsibility**: HTTP request/response handling
- **What it does**: Parse requests, format responses, HTTP status codes
- **What it doesn't do**: Business logic, data access, validation logic
- **Reason to change**: API endpoint changes

## Benefits Achieved

### 1. Maintainability
- Each file has a clear, single purpose
- Changes are isolated to specific components
- Easy to understand what each component does

### 2. Testability
```javascript
// Each component can be tested in isolation
describe('OrganizationRepository', () => {
  it('should only test database operations', () => {
    // Mock database, test CRUD operations
  });
});

describe('OrganizationService', () => {
  it('should only test business logic', () => {
    // Mock repository, test business rules
  });
});
```

### 3. Reusability
Components can be reused in different contexts:
- Repository can be used by multiple services
- Adapters can be used by different features
- Middleware can be applied to any route

### 4. Flexibility
Easy to swap implementations:
```javascript
// Switch from PostgreSQL to MongoDB
// Only change: repository layer

// Switch from Avreo to Epic
// Only change: create new adapter

// Change org identification from subdomain to header
// Only change: tenant-resolver middleware
```

## Anti-Patterns Avoided

### ❌ God Object
We avoided creating a single `OrganizationManager` that does everything:
```javascript
// BAD - Multiple responsibilities
class OrganizationManager {
  createOrg() { /* database + business logic + validation */ }
  authenticate() { /* auth logic */ }
  loadConfig() { /* config logic */ }
  sendNotification() { /* notification logic */ }
}
```

### ❌ Mixed Concerns
We separated concerns clearly:
```javascript
// BAD - Repository with business logic
class OrganizationRepo {
  async create(data) {
    // Validation (business logic - wrong place!)
    if (!isValidSlug(data.slug)) throw Error();

    // Database operation (correct)
    return db.query('INSERT...');
  }
}

// GOOD - Repository only does database
class OrganizationRepository {
  async create(data) {
    // Only database operation
    return db.query('INSERT...', [data.slug, data.name]);
  }
}
```

### ❌ Leaky Abstractions
Each layer doesn't know about layers above it:
```javascript
// BAD - Service knows about HTTP
class OrganizationService {
  create(req, res) {
    // Service shouldn't know about HTTP
    const data = req.body;
    res.json({ success: true });
  }
}

// GOOD - Service is HTTP-agnostic
class OrganizationService {
  create(data) {
    // Only business logic
    return this.repository.create(data);
  }
}
```

## Code Metrics

### Lines of Code per Responsibility
- **organization.repository.js**: ~130 lines (ONLY database)
- **organization.service.js**: ~200 lines (ONLY business logic)
- **tenant-resolver.js**: ~120 lines (ONLY identification)
- **tenant-context.js**: ~110 lines (ONLY context loading)
- **base-ris-adapter.js**: ~150 lines (ONLY interface)
- **ris-adapter-factory.js**: ~70 lines (ONLY creation)

### Coupling Metrics
- **Low Coupling**: Each component depends on 1-2 other components max
- **High Cohesion**: All methods in a class relate to its single responsibility

## Future Extensions

When adding new features, maintain SRP:

### Adding Payment Processing
```javascript
// Create new single-responsibility components:
payment.repository.js     // ONLY payment database operations
payment.service.js        // ONLY payment business logic
payment-gateway.adapter.js // ONLY gateway communication
payment.controller.js     // ONLY HTTP handling
```

### Adding Notification System
```javascript
// Create new single-responsibility components:
notification.repository.js  // ONLY notification persistence
notification.service.js     // ONLY notification logic
email.adapter.js           // ONLY email sending
sms.adapter.js            // ONLY SMS sending
notification.controller.js // ONLY HTTP handling
```

## Validation Checklist

Use this checklist when creating new components:

- [ ] Does this class have only one reason to change?
- [ ] Can I describe its responsibility in one sentence without "and"?
- [ ] Are all methods related to the single responsibility?
- [ ] Does it depend on minimal external components?
- [ ] Can it be tested in isolation?
- [ ] Is the responsibility clear from the filename?

## Conclusion

By strictly following SRP:
1. **No refactoring needed**: Each component does one thing well
2. **Easy to extend**: Add new components without changing existing ones
3. **Easy to maintain**: Clear boundaries and responsibilities
4. **Easy to test**: Each component can be tested independently
5. **Easy to understand**: Purpose is immediately clear

This architecture will scale to hundreds of organizations without requiring structural changes.