-- Add flags for AI generation tracking
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS ai_generation_requested BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_generation_in_progress BOOLEAN DEFAULT false;

-- Add index for efficient polling
CREATE INDEX IF NOT EXISTS idx_documents_ai_generation_requested
ON documents(ai_generation_requested)
WHERE ai_generation_requested = true;

-- Add comment
COMMENT ON COLUMN documents.ai_generation_requested IS 'Flag set by frontend to request AI generation from local agent';
COMMENT ON COLUMN documents.ai_generation_in_progress IS 'Flag set by local agent while processing AI generation';
