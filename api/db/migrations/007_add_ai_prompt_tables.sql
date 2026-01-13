-- Migration 007: AI prompt tables for intelligent scheduling analysis
-- Supports externalized prompts for A/B testing and AI-powered order analysis

-- AI prompts externalized for A/B testing
CREATE TABLE IF NOT EXISTS scheduling_prompts (
  id SERIAL PRIMARY KEY,
  prompt_key VARCHAR(100) UNIQUE NOT NULL,  -- e.g., 'order_analysis_v1', 'duration_calc_v1'
  prompt_name VARCHAR(255),                  -- Human-readable name
  prompt_template TEXT NOT NULL,             -- The actual prompt with {{placeholders}}
  model VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
  max_tokens INTEGER DEFAULT 1024,
  is_active BOOLEAN DEFAULT FALSE,
  ab_test_weight INTEGER DEFAULT 100,        -- Weight for A/B testing (0-100)
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track AI analysis results for monitoring and A/B comparison
CREATE TABLE IF NOT EXISTS scheduling_analysis_log (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER,                   -- FK to sms_conversations (nullable for testing)
  prompt_id INTEGER REFERENCES scheduling_prompts(id),
  prompt_key VARCHAR(100),                   -- Denormalized for easy querying
  input_data JSONB,                          -- What was sent to AI
  output_data JSONB,                         -- What AI returned
  model_used VARCHAR(100),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sched_prompts_key ON scheduling_prompts(prompt_key);
CREATE INDEX IF NOT EXISTS idx_sched_prompts_active ON scheduling_prompts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_sched_analysis_prompt ON scheduling_analysis_log(prompt_key);
CREATE INDEX IF NOT EXISTS idx_sched_analysis_created ON scheduling_analysis_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sched_analysis_success ON scheduling_analysis_log(success);
CREATE INDEX IF NOT EXISTS idx_sched_analysis_conv ON scheduling_analysis_log(conversation_id);

-- Triggers for updated_at (reuse existing function from migration 001)
DROP TRIGGER IF EXISTS update_scheduling_prompts_updated_at ON scheduling_prompts;
CREATE TRIGGER update_scheduling_prompts_updated_at
  BEFORE UPDATE ON scheduling_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE scheduling_prompts IS 'Externalized AI prompts for scheduling analysis with A/B testing support';
COMMENT ON TABLE scheduling_analysis_log IS 'Audit log of AI analysis calls for monitoring and comparison';
COMMENT ON COLUMN scheduling_prompts.prompt_key IS 'Unique key for prompt lookup (e.g., order_analysis_v1)';
COMMENT ON COLUMN scheduling_prompts.prompt_template IS 'Prompt text with {{placeholder}} syntax for variable interpolation';
COMMENT ON COLUMN scheduling_prompts.ab_test_weight IS 'Weight for A/B test selection (higher = more likely selected)';
COMMENT ON COLUMN scheduling_analysis_log.latency_ms IS 'Total time from request to response in milliseconds';
COMMENT ON COLUMN scheduling_analysis_log.prompt_tokens IS 'Input tokens used (from Claude API usage)';
COMMENT ON COLUMN scheduling_analysis_log.completion_tokens IS 'Output tokens used (from Claude API usage)';
