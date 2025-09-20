-- Migration: Add organization_settings table
-- Purpose: ONLY manages organization configuration storage
-- Single Responsibility: Configuration data persistence

BEGIN TRANSACTION;

-- Organization settings: Separate table for configuration (SRP)
CREATE TABLE IF NOT EXISTS organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    setting_key VARCHAR(100) NOT NULL,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50) NOT NULL, -- 'ris', 'scheduling', 'features', 'branding'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique settings per org
    CONSTRAINT unique_org_setting UNIQUE(organization_id, setting_key)
);

-- Indexes for performance
CREATE INDEX idx_org_settings_org_id ON organization_settings(organization_id);
CREATE INDEX idx_org_settings_key ON organization_settings(setting_key);
CREATE INDEX idx_org_settings_type ON organization_settings(setting_type);

-- Trigger for updated_at
CREATE TRIGGER trigger_org_settings_updated_at
    BEFORE UPDATE ON organization_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_organizations_updated_at();

COMMIT;