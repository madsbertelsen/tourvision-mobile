-- Create proposal_votes table
CREATE TABLE IF NOT EXISTS proposal_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('approve', 'reject')),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure a user can only vote once per proposal
    UNIQUE(proposal_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_proposal_votes_proposal_id ON proposal_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_votes_user_id ON proposal_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_proposal_votes_created_at ON proposal_votes(created_at DESC);

-- Enable RLS
ALTER TABLE proposal_votes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view votes on proposals they can see" ON proposal_votes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM proposals p
            JOIN trips t ON p.trip_id = t.id
            WHERE p.id = proposal_votes.proposal_id
            AND (t.created_by = auth.uid() OR t.is_public = true)
        )
    );

CREATE POLICY "Users can create votes on proposals they can access" ON proposal_votes
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id AND
        EXISTS (
            SELECT 1 FROM proposals p
            JOIN trips t ON p.trip_id = t.id
            WHERE p.id = proposal_votes.proposal_id
            AND (t.created_by = auth.uid() OR t.is_public = true)
        )
    );

CREATE POLICY "Users can update their own votes" ON proposal_votes
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes" ON proposal_votes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Function to update proposal counts when votes change
CREATE OR REPLACE FUNCTION update_proposal_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update approval and rejection counts
        UPDATE proposals
        SET
            approval_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = NEW.proposal_id AND vote_type = 'approve'
            ),
            rejection_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = NEW.proposal_id AND vote_type = 'reject'
            ),
            updated_at = NOW()
        WHERE id = NEW.proposal_id;

        -- Check if proposal should be auto-approved
        UPDATE proposals
        SET
            status = 'approved',
            approved_at = NOW()
        WHERE id = NEW.proposal_id
            AND status = 'pending'
            AND approval_count >= required_approvals;

    ELSIF TG_OP = 'DELETE' THEN
        -- Update counts after deletion
        UPDATE proposals
        SET
            approval_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = OLD.proposal_id AND vote_type = 'approve'
            ),
            rejection_count = (
                SELECT COUNT(*) FROM proposal_votes
                WHERE proposal_id = OLD.proposal_id AND vote_type = 'reject'
            ),
            updated_at = NOW()
        WHERE id = OLD.proposal_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for vote count updates
CREATE TRIGGER update_proposal_counts_on_vote
AFTER INSERT OR UPDATE OR DELETE ON proposal_votes
FOR EACH ROW
EXECUTE FUNCTION update_proposal_vote_counts();