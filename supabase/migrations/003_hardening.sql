-- 003_hardening.sql
-- Adds deduplication, conversation state, message traces, and registration_date

-- Messages: dedup + processing status + intent
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_hash text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'completed' CHECK (processing_status IN ('processing', 'completed', 'failed'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS intent text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedup ON messages (mother_id, message_hash, direction) WHERE message_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_processing ON messages (processing_status) WHERE processing_status = 'processing';

-- Conversation state
CREATE TABLE IF NOT EXISTS conversation_state (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'idle' CHECK (state IN ('idle', 'awaiting_followup', 'awaiting_registration', 'awaiting_clarification')),
  pending_question text,
  pending_context jsonb DEFAULT '{}'::jsonb,
  last_intent text,
  last_risk_level text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mother_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_state_mother ON conversation_state (mother_id);
ALTER TABLE conversation_state ENABLE ROW LEVEL SECURITY;

-- Message traces for observability
CREATE TABLE IF NOT EXISTS message_traces (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  mother_id uuid NOT NULL REFERENCES mothers(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  phone text NOT NULL,
  raw_message text NOT NULL,
  channel text NOT NULL,
  detected_language text,
  intent text,
  extracted_symptoms jsonb DEFAULT '[]'::jsonb,
  pregnancy_week integer,
  risk_level text,
  response_text text,
  processing_time_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traces_mother ON message_traces (mother_id);
CREATE INDEX IF NOT EXISTS idx_traces_created ON message_traces (created_at DESC);
ALTER TABLE message_traces ENABLE ROW LEVEL SECURITY;

-- Mothers: registration date
ALTER TABLE mothers ADD COLUMN IF NOT EXISTS registration_date date DEFAULT CURRENT_DATE;
