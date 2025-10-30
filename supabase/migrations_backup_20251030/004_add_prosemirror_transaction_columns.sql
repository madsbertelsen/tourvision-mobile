-- Add columns for ProseMirror transaction persistence
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS transaction_steps JSONB,
ADD COLUMN IF NOT EXISTS operation_metadata JSONB,
ADD COLUMN IF NOT EXISTS ai_confidence FLOAT CHECK (ai_confidence >= 0 AND ai_confidence <= 1);

-- Add columns to ai_suggestions table for transaction data
ALTER TABLE ai_suggestions
ADD COLUMN IF NOT EXISTS transaction_steps JSONB,
ADD COLUMN IF NOT EXISTS operation_metadata JSONB,
ADD COLUMN IF NOT EXISTS affected_range JSONB,
ADD COLUMN IF NOT EXISTS ai_confidence FLOAT CHECK (ai_confidence >= 0 AND ai_confidence <= 1);

-- Create a new table for tracking AI-generated operations history
CREATE TABLE IF NOT EXISTS ai_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Original state
    original_document JSONB NOT NULL,
    user_prompt TEXT NOT NULL,

    -- AI processing metadata
    ai_model TEXT,
    ai_confidence FLOAT CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
    ai_reasoning TEXT,
    processing_time_ms INTEGER,

    -- ProseMirror transaction data
    transaction_steps JSONB NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('insert_after', 'insert_before', 'replace', 'delete', 'append')),
    target_position INTEGER,
    html_reference TEXT,

    -- Result
    modified_document JSONB NOT NULL,
    affected_range JSONB,
    diff_decorations JSONB,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected', 'reverted')),
    applied_at TIMESTAMP WITH TIME ZONE,
    reverted_at TIMESTAMP WITH TIME ZONE,

    -- Rollback data
    inverse_steps JSONB,
    checkpoint_state JSONB
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_operations_trip_id ON ai_operations(trip_id);
CREATE INDEX IF NOT EXISTS idx_ai_operations_user_id ON ai_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_operations_created_at ON ai_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_operations_status ON ai_operations(status);
CREATE INDEX IF NOT EXISTS idx_proposals_transaction_steps ON proposals USING gin (transaction_steps);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_transaction_steps ON ai_suggestions USING gin (transaction_steps);

-- Add comments explaining the new columns
COMMENT ON COLUMN proposals.transaction_steps IS 'ProseMirror transaction steps for precise document transformation';
COMMENT ON COLUMN proposals.operation_metadata IS 'Additional metadata about the operation (user prompt, AI reasoning, etc)';
COMMENT ON COLUMN proposals.ai_confidence IS 'AI confidence score for the suggested change (0-1)';

COMMENT ON COLUMN ai_suggestions.transaction_steps IS 'ProseMirror transaction steps for the AI suggestion';
COMMENT ON COLUMN ai_suggestions.operation_metadata IS 'Metadata about how the AI generated this suggestion';
COMMENT ON COLUMN ai_suggestions.affected_range IS 'The document range affected by this suggestion {from: pos, to: pos}';
COMMENT ON COLUMN ai_suggestions.ai_confidence IS 'AI confidence score for this suggestion (0-1)';

COMMENT ON TABLE ai_operations IS 'Complete history of AI-generated document operations with full transaction data for rollback and auditing';

-- Add RLS policies for the new table
ALTER TABLE ai_operations ENABLE ROW LEVEL SECURITY;

-- Users can view AI operations for trips they have access to
CREATE POLICY "Users can view AI operations for accessible trips"
    ON ai_operations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM trips t
            WHERE t.id = ai_operations.trip_id
            AND (
                t.created_by = auth.uid()
                OR t.is_public = true
            )
        )
    );

-- Users can create AI operations for trips they can edit
CREATE POLICY "Users can create AI operations for editable trips"
    ON ai_operations FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM trips t
            WHERE t.id = ai_operations.trip_id
            AND t.created_by = auth.uid()
        )
    );

-- Users can update AI operations they created
CREATE POLICY "Users can update their own AI operations"
    ON ai_operations FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());