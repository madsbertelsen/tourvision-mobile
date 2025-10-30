-- Add missing approval_count and rejection_count columns to proposals table
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS approval_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rejection_count INTEGER DEFAULT 0;

-- Update existing proposals with current counts
UPDATE proposals p
SET
    approval_count = COALESCE((
        SELECT COUNT(*) FROM proposal_votes
        WHERE proposal_id = p.id AND vote_type = 'approve'
    ), 0),
    rejection_count = COALESCE((
        SELECT COUNT(*) FROM proposal_votes
        WHERE proposal_id = p.id AND vote_type = 'reject'
    ), 0);

-- Add column for applied_at if missing
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone;