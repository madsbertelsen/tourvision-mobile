-- Create agent_tasks table for generic agent job queue
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Index for querying by document and status
CREATE INDEX idx_agent_tasks_document_status ON agent_tasks(document_id, status);

-- Index for task type filtering
CREATE INDEX idx_agent_tasks_type ON agent_tasks(task_type);

-- Index for timestamp ordering
CREATE INDEX idx_agent_tasks_created ON agent_tasks(created_at DESC);

-- Enable Row Level Security
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all operations for service role
CREATE POLICY "Service role has full access to agent_tasks"
  ON agent_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
