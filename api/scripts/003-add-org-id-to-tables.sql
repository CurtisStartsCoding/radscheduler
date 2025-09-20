-- Migration: Add organization_id to existing tables
-- Purpose: ONLY adds tenant isolation columns
-- Single Responsibility: Schema modification for multi-tenancy

BEGIN TRANSACTION;

-- Add organization_id to appointments table
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Add organization_id to users table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
    END IF;
END $$;

-- Add organization_id to hl7_transactions table
ALTER TABLE hl7_transactions
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_org_id ON appointments(organization_id);
CREATE INDEX IF NOT EXISTS idx_hl7_transactions_org_id ON hl7_transactions(organization_id);

-- Add composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_appointments_org_datetime
ON appointments(organization_id, datetime);

CREATE INDEX IF NOT EXISTS idx_appointments_org_status
ON appointments(organization_id, status);

COMMIT;