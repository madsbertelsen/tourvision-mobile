-- Create suggestion_votes table for tracking votes on AI suggestions
CREATE TABLE IF NOT EXISTS suggestion_votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    suggestion_id UUID NOT NULL REFERENCES ai_suggestions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject')),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one vote per user per suggestion
    UNIQUE(suggestion_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_suggestion_id ON suggestion_votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_votes_user_id ON suggestion_votes(user_id);

-- Enable RLS
ALTER TABLE suggestion_votes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies

-- Users can view all votes for suggestions they can see
CREATE POLICY "Users can view votes for accessible suggestions" ON suggestion_votes
    FOR SELECT
    USING (true);

-- Users can insert their own votes
CREATE POLICY "Users can insert their own votes" ON suggestion_votes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own votes
CREATE POLICY "Users can update their own votes" ON suggestion_votes
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own votes
CREATE POLICY "Users can delete their own votes" ON suggestion_votes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create function to update suggestion approval counts
CREATE OR REPLACE FUNCTION update_suggestion_approval_counts()
RETURNS TRIGGER AS $$
BEGIN
    -- Update approval and rejection counts
    UPDATE ai_suggestions
    SET
        approval_count = (
            SELECT COUNT(*) FROM suggestion_votes
            WHERE suggestion_id = COALESCE(NEW.suggestion_id, OLD.suggestion_id)
            AND vote = 'approve'
        ),
        rejection_count = (
            SELECT COUNT(*) FROM suggestion_votes
            WHERE suggestion_id = COALESCE(NEW.suggestion_id, OLD.suggestion_id)
            AND vote = 'reject'
        )
    WHERE id = COALESCE(NEW.suggestion_id, OLD.suggestion_id);

    -- Check if suggestion should be approved
    UPDATE ai_suggestions
    SET
        status = CASE
            WHEN approval_count >= required_approvals THEN 'approved'
            WHEN rejection_count > (
                SELECT COUNT(DISTINCT tc.user_id)
                FROM trip_members tc
                WHERE tc.trip_id = ai_suggestions.trip_id
            ) / 2 THEN 'rejected'
            ELSE 'pending'
        END,
        approved_at = CASE
            WHEN approval_count >= required_approvals AND status != 'approved'
            THEN NOW()
            ELSE approved_at
        END,
        rejected_at = CASE
            WHEN rejection_count > (
                SELECT COUNT(DISTINCT tc.user_id)
                FROM trip_members tc
                WHERE tc.trip_id = ai_suggestions.trip_id
            ) / 2 AND status != 'rejected'
            THEN NOW()
            ELSE rejected_at
        END
    WHERE id = COALESCE(NEW.suggestion_id, OLD.suggestion_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for vote changes
CREATE TRIGGER update_suggestion_counts_on_vote
AFTER INSERT OR UPDATE OR DELETE ON suggestion_votes
FOR EACH ROW
EXECUTE FUNCTION update_suggestion_approval_counts();