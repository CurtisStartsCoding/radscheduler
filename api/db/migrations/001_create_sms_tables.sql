-- Phase 5.2 SMS Scheduling Tables
-- HIPAA-compliant schema with phone number hashing

-- Patient SMS Consent Management
CREATE TABLE IF NOT EXISTS patient_sms_consents (
  id SERIAL PRIMARY KEY,
  phone_hash VARCHAR(64) NOT NULL UNIQUE,
  consent_given BOOLEAN NOT NULL,
  consent_timestamp TIMESTAMP NOT NULL,
  consent_method VARCHAR(50) NOT NULL, -- 'SMS_REPLY', 'WEB_FORM', 'VERBAL'
  revoked_at TIMESTAMP,
  revocation_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sms_consents_phone_hash ON patient_sms_consents(phone_hash);
CREATE INDEX idx_sms_consents_consent_given ON patient_sms_consents(consent_given);

COMMENT ON TABLE patient_sms_consents IS 'Stores patient SMS consent with hashed phone numbers for HIPAA compliance';
COMMENT ON COLUMN patient_sms_consents.phone_hash IS 'SHA-256 hash of normalized phone number';

-- SMS Audit Log (7-year retention for HIPAA)
CREATE TABLE IF NOT EXISTS sms_audit_log (
  id SERIAL PRIMARY KEY,
  phone_hash VARCHAR(64) NOT NULL,
  message_type VARCHAR(50) NOT NULL, -- 'OUTBOUND_CONSENT', 'INBOUND_REPLY', 'OUTBOUND_LOCATION', etc.
  message_direction VARCHAR(10) NOT NULL, -- 'INBOUND' or 'OUTBOUND'
  consent_status VARCHAR(20), -- 'CONSENTED', 'NOT_CONSENTED', 'REVOKED'
  session_id VARCHAR(100),
  twilio_sid VARCHAR(100),
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sms_audit_phone_hash ON sms_audit_log(phone_hash);
CREATE INDEX idx_sms_audit_timestamp ON sms_audit_log(timestamp);
CREATE INDEX idx_sms_audit_session_id ON sms_audit_log(session_id);
CREATE INDEX idx_sms_audit_type_direction ON sms_audit_log(message_type, message_direction);

COMMENT ON TABLE sms_audit_log IS 'HIPAA audit log for all SMS interactions (7-year retention)';
COMMENT ON COLUMN sms_audit_log.phone_hash IS 'SHA-256 hash of normalized phone number - NO PLAINTEXT PHI';

-- SMS Conversation State Machine
CREATE TABLE IF NOT EXISTS sms_conversations (
  id SERIAL PRIMARY KEY,
  phone_hash VARCHAR(64) NOT NULL,
  state VARCHAR(50) NOT NULL, -- 'CONSENT_PENDING', 'CHOOSING_ORDER', 'CHOOSING_LOCATION', 'CHOOSING_TIME', 'CONFIRMED', 'EXPIRED', 'CANCELLED'
  order_data JSONB, -- Stores order details without PHI
  selected_location_id VARCHAR(100),
  selected_slot_time TIMESTAMP,
  expires_at TIMESTAMP NOT NULL, -- 24 hour expiry
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sms_conversations_phone_hash ON sms_conversations(phone_hash);
CREATE INDEX idx_sms_conversations_state ON sms_conversations(state);
CREATE INDEX idx_sms_conversations_expires_at ON sms_conversations(expires_at);
CREATE INDEX idx_sms_conversations_started_at ON sms_conversations(started_at);

COMMENT ON TABLE sms_conversations IS 'SMS conversation state for patient scheduling (auto-expires after 24 hours)';
COMMENT ON COLUMN sms_conversations.expires_at IS 'Session automatically expires 24 hours after creation';

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_patient_sms_consents_updated_at BEFORE UPDATE ON patient_sms_consents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sms_conversations_updated_at BEFORE UPDATE ON sms_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sms_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Mark expired conversations
    UPDATE sms_conversations
    SET state = 'EXPIRED',
        completed_at = CURRENT_TIMESTAMP
    WHERE state NOT IN ('EXPIRED', 'CONFIRMED', 'CANCELLED')
      AND expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_sms_sessions IS 'Marks conversations as EXPIRED after 24 hours - run periodically via cron';
