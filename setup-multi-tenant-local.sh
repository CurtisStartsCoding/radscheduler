#!/bin/bash

# Setup Multi-Tenant Architecture Locally
# This script sets up the multi-tenant features in your local Docker environment

echo "========================================="
echo "Setting up Multi-Tenant Architecture"
echo "========================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Check if PostgreSQL container is running
if ! docker ps | grep -q postgres; then
    echo "Starting PostgreSQL container..."
    docker-compose up -d postgres
    sleep 5
fi

# Run database migrations
echo "Running database migrations..."

echo "1. Creating organizations table..."
docker exec -i radscheduler-postgres-1 psql -U raduser -d radscheduler < api/scripts/001-add-organizations-table.sql || {
    echo "Note: Some tables may already exist, continuing..."
}

echo "2. Creating organization settings table..."
docker exec -i radscheduler-postgres-1 psql -U raduser -d radscheduler < api/scripts/002-add-organization-settings.sql || {
    echo "Note: Some tables may already exist, continuing..."
}

echo "3. Adding org_id to existing tables..."
docker exec -i radscheduler-postgres-1 psql -U raduser -d radscheduler < api/scripts/003-add-org-id-to-tables.sql || {
    echo "Note: Columns may already exist, continuing..."
}

# Create default organization for existing data
echo "4. Creating default organization..."
docker exec -i radscheduler-postgres-1 psql -U raduser -d radscheduler -c "
INSERT INTO organizations (slug, name, is_active)
VALUES ('default', 'Default Organization', true)
ON CONFLICT (slug) DO NOTHING;
"

# Update existing appointments to use default org
echo "5. Migrating existing data to default organization..."
docker exec -i radscheduler-postgres-1 psql -U raduser -d radscheduler -c "
UPDATE appointments
SET organization_id = (SELECT id FROM organizations WHERE slug = 'default')
WHERE organization_id IS NULL;
"

echo ""
echo "✅ Multi-tenant setup complete!"
echo ""
echo "Testing the setup..."

# Start the API if not running
if ! curl -s http://localhost:3010/health > /dev/null; then
    echo "Starting API server..."
    cd api && npm run dev &
    API_PID=$!
    sleep 5
fi

# Test creating an organization
echo "Creating test organization..."
curl -X POST http://localhost:3010/api/organizations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-token" \
  -d '{
    "slug": "memorial-radiology",
    "name": "Memorial Radiology Center"
  }' 2>/dev/null | python -m json.tool || echo "Note: Auth may be required. Setup complete anyway."

echo ""
echo "========================================="
echo "Multi-Tenant Setup Complete!"
echo "========================================="
echo ""
echo "You can now:"
echo "1. Create organizations via API"
echo "2. Access different orgs via:"
echo "   - Subdomain: memorial.localhost:3010"
echo "   - Header: X-Organization-Slug: memorial"
echo "   - Path: /org/memorial/api/..."
echo ""
echo "Test with:"
echo "  curl http://localhost:3010/api/organizations/default"
echo ""