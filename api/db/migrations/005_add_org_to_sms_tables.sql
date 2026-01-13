-- Migration: Add organization_id to SMS tables for multi-tenant isolation
-- Purpose: Enable per-organization SMS configuration and number isolation
-- Also adds from_number tracking for sticky sender support

BEGIN;

-- Add organization_id to sms_conversations
ALTER TABLE sms_conversations
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Add from_number to track which number was used (for sticky sender)
ALTER TABLE sms_conversations
ADD COLUMN IF NOT EXISTS from_number VARCHAR(20);

-- Add organization_id to sms_audit_log
ALTER TABLE sms_audit_log
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Add from_number to audit log
ALTER TABLE sms_audit_log
ADD COLUMN IF NOT EXISTS from_number VARCHAR(20);

-- Add organization_id to patient_sms_consents
ALTER TABLE patient_sms_consents
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sms_conversations_org_id
ON sms_conversations(organization_id);

CREATE INDEX IF NOT EXISTS idx_sms_conversations_org_phone
ON sms_conversations(organization_id, phone_hash);

CREATE INDEX IF NOT EXISTS idx_sms_audit_org_id
ON sms_audit_log(organization_id);

CREATE INDEX IF NOT EXISTS idx_sms_consents_org_id
ON patient_sms_consents(organization_id);

-- Composite index for finding consent by org + phone
CREATE INDEX IF NOT EXISTS idx_sms_consents_org_phone
ON patient_sms_consents(organization_id, phone_hash);

COMMIT;
