-- CDS HL7 Connector Database Schema
-- Run this script to set up the required tables

-- RIS Clients Configuration Table
CREATE TABLE IF NOT EXISTS ris_clients (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  connection_config JSONB NOT NULL,
  hl7_config JSONB NOT NULL,
  features JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HL7 Transactions Log Table
CREATE TABLE IF NOT EXISTS hl7_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(50) NOT NULL,
  message_type VARCHAR(10) NOT NULL,
  message_content TEXT NOT NULL,
  data JSONB,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged BOOLEAN DEFAULT false,
  ack_message TEXT,
  retry_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'queued', -- 'queued', 'sent', 'acknowledged', 'failed', 'retry'
  response JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hl7_transactions_client_id ON hl7_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_hl7_transactions_sent_at ON hl7_transactions(sent_at);
CREATE INDEX IF NOT EXISTS idx_hl7_transactions_status ON hl7_transactions(status);
CREATE INDEX IF NOT EXISTS idx_hl7_transactions_message_type ON hl7_transactions(message_type);

-- Sample RIS Client Configuration
INSERT INTO ris_clients (id, name, connection_config, hl7_config, features) VALUES
(
  'pilot_radiology',
  'Pilot Radiology Group',
  '{
    "type": "http",
    "endpoint": "https://pilot-ris.example.com/hl7",
    "timeout": 10000
  }',
  '{
    "version": "2.5.1",
    "sendingApp": "CDSPLATFORM",
    "sendingFacility": "CDS",
    "receivingApp": "PILOTRIS",
    "receivingFacility": "PILOT"
  }',
  '{
    "documents": true,
    "orders": true,
    "scheduling": false,
    "bidirectional": false
  }'
),
(
  'test_ris',
  'Test RIS System',
  '{
    "type": "mllp",
    "host": "localhost",
    "port": 6661,
    "timeout": 10000
  }',
  '{
    "version": "2.5.1",
    "sendingApp": "CDSPLATFORM",
    "sendingFacility": "CDS",
    "receivingApp": "TESTRIS",
    "receivingFacility": "TEST"
  }',
  '{
    "documents": true,
    "orders": true,
    "scheduling": false,
    "bidirectional": false
  }'
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_ris_clients_updated_at 
    BEFORE UPDATE ON ris_clients 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- View for recent transactions
CREATE OR REPLACE VIEW recent_hl7_transactions AS
SELECT 
  t.id,
  t.client_id,
  c.name as client_name,
  t.message_type,
  t.status,
  t.sent_at,
  t.retry_count,
  t.acknowledged
FROM hl7_transactions t
JOIN ris_clients c ON t.client_id = c.id
WHERE t.sent_at > NOW() - INTERVAL '24 hours'
ORDER BY t.sent_at DESC;

-- Function to get transaction statistics
CREATE OR REPLACE FUNCTION get_hl7_stats(hours_back INTEGER DEFAULT 24)
RETURNS TABLE (
  client_id VARCHAR(50),
  client_name VARCHAR(200),
  total_messages BIGINT,
  successful_messages BIGINT,
  failed_messages BIGINT,
  success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as client_id,
    c.name as client_name,
    COUNT(t.id) as total_messages,
    COUNT(CASE WHEN t.status = 'acknowledged' THEN 1 END) as successful_messages,
    COUNT(CASE WHEN t.status = 'failed' THEN 1 END) as failed_messages,
    ROUND(
      (COUNT(CASE WHEN t.status = 'acknowledged' THEN 1 END)::NUMERIC / COUNT(t.id)::NUMERIC) * 100, 
      2
    ) as success_rate
  FROM ris_clients c
  LEFT JOIN hl7_transactions t ON c.id = t.client_id 
    AND t.sent_at > NOW() - (hours_back || ' hours')::INTERVAL
  WHERE c.active = true
  GROUP BY c.id, c.name
  ORDER BY total_messages DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust as needed for your setup)
GRANT SELECT, INSERT, UPDATE ON ris_clients TO your_app_user;
GRANT SELECT, INSERT, UPDATE ON hl7_transactions TO your_app_user;
GRANT SELECT ON recent_hl7_transactions TO your_app_user;
GRANT EXECUTE ON FUNCTION get_hl7_stats(INTEGER) TO your_app_user; 