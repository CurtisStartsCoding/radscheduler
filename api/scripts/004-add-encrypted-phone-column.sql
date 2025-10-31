-- Migration 004: Add encrypted_phone column to sms_conversations table
-- Date: 2025-10-31
-- Purpose: Support AES-256-GCM encrypted phone storage for HIPAA-compliant SMS scheduling

-- Add encrypted_phone column
ALTER TABLE sms_conversations
ADD COLUMN IF NOT EXISTS encrypted_phone TEXT;

-- Add comment for documentation
COMMENT ON COLUMN sms_conversations.encrypted_phone IS
  'AES-256-GCM encrypted phone number for secure storage. Decrypt using PHONE_ENCRYPTION_KEY before sending SMS.';

-- Note: phone_hash column remains for lookups (one-way hash cannot be decrypted)
-- encrypted_phone allows decryption for sending SMS via webhooks
