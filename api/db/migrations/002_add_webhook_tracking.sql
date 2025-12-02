-- Migration 002: Add webhook tracking columns to sms_conversations
-- Purpose: Track pending webhook requests for timeout/retry handling
--
-- This enables:
-- 1. Detection of stuck conversations waiting for webhook responses
-- 2. Automatic retry of failed slot requests
-- 3. Patient notification when retries are exhausted

-- Add columns to track webhook state
ALTER TABLE sms_conversations
ADD COLUMN IF NOT EXISTS slot_request_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS slot_retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS slot_request_failed_at TIMESTAMP;

-- Index for timeout queries (find conversations waiting for webhooks)
-- Partial index only includes active CHOOSING_TIME conversations with pending requests
CREATE INDEX IF NOT EXISTS idx_sms_conversations_slot_request
ON sms_conversations(slot_request_sent_at)
WHERE slot_request_sent_at IS NOT NULL AND state = 'CHOOSING_TIME';

-- Comments for documentation
COMMENT ON COLUMN sms_conversations.slot_request_sent_at IS
  'Timestamp when slot request was sent to QIE - used for timeout detection';
COMMENT ON COLUMN sms_conversations.slot_retry_count IS
  'Number of retry attempts for this slot request (max 1 before notifying patient)';
COMMENT ON COLUMN sms_conversations.slot_request_failed_at IS
  'Timestamp when slot request permanently failed - patient was notified to call';
