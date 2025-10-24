-- Add flags for AI generation tracking
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS ai_generation_requested BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_generation_in_progress BOOLEAN DEFAULT false;

-- Add index for efficient polling
CREATE INDEX IF NOT EXISTS idx_trips_ai_generation_requested
ON trips(ai_generation_requested)
WHERE ai_generation_requested = true;

-- Add comment
COMMENT ON COLUMN trips.ai_generation_requested IS 'Flag set by frontend to request AI generation from local agent';
COMMENT ON COLUMN trips.ai_generation_in_progress IS 'Flag set by local agent while processing AI generation';
