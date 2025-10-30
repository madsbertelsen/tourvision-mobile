-- Add columns for diff-based proposals
ALTER TABLE proposals
ADD COLUMN IF NOT EXISTS proposal_operations JSONB,
ADD COLUMN IF NOT EXISTS diff_decorations JSONB;

-- Add comment explaining the new columns
COMMENT ON COLUMN proposals.proposal_operations IS 'ProseMirror operations/steps to transform current_content to proposed_content';
COMMENT ON COLUMN proposals.diff_decorations IS 'Decoration positions for visualizing diffs in the editor';

-- Make proposed_content optional since we'll use operations instead
ALTER TABLE proposals
ALTER COLUMN proposed_content DROP NOT NULL;

-- Add index on proposal_operations for faster queries
CREATE INDEX IF NOT EXISTS idx_proposals_operations ON proposals USING gin (proposal_operations);