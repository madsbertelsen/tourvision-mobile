-- Agent Connections System for Multi-Document Agent Management
-- This migration creates tables for tracking agent processes, document activity, and metrics

-- Table: agent_connections
-- Tracks active agent processes and their connection state
CREATE TABLE IF NOT EXISTS agent_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Document & Agent Identity
  document_id TEXT NOT NULL,
  agent_id TEXT NOT NULL UNIQUE,
  agent_pid INTEGER,

  -- Connection State
  status TEXT NOT NULL CHECK (status IN ('connecting', 'active', 'idle', 'detaching', 'disconnected', 'error')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Resource Tracking
  memory_mb INTEGER,
  cpu_percent DECIMAL(5,2),
  llm_calls_count INTEGER DEFAULT 0,
  locations_marked_count INTEGER DEFAULT 0,

  -- Manager Info
  manager_id TEXT NOT NULL,
  manager_host TEXT,

  -- Metadata
  error_message TEXT,
  metadata JSONB,

  -- Constraints
  -- Only one active agent per document at a time
  CONSTRAINT unique_active_document UNIQUE (document_id, status)
    WHERE status IN ('connecting', 'active')
);

-- Indexes for agent_connections
CREATE INDEX idx_agent_status ON agent_connections(status);
CREATE INDEX idx_agent_document ON agent_connections(document_id);
CREATE INDEX idx_agent_manager ON agent_connections(manager_id);
CREATE INDEX idx_agent_activity ON agent_connections(last_activity_at DESC);
CREATE INDEX idx_agent_connected_at ON agent_connections(connected_at DESC);

-- Table: document_activity
-- Logs activity signals from Durable Objects
CREATE TABLE IF NOT EXISTS document_activity (
  id BIGSERIAL PRIMARY KEY,

  document_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('active', 'idle', 'user_joined', 'user_left')),
  user_count INTEGER NOT NULL DEFAULT 0,

  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata
  metadata JSONB
);

-- Indexes for document_activity
CREATE INDEX idx_doc_activity_document ON document_activity(document_id, timestamp DESC);
CREATE INDEX idx_doc_activity_timestamp ON document_activity(timestamp DESC);
CREATE INDEX idx_doc_activity_type ON document_activity(event_type);

-- Table: agent_metrics
-- Time-series performance metrics for agents
CREATE TABLE IF NOT EXISTS agent_metrics (
  id BIGSERIAL PRIMARY KEY,

  agent_connection_id UUID REFERENCES agent_connections(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,

  -- Performance Metrics
  memory_mb INTEGER,
  cpu_percent DECIMAL(5,2),
  websocket_latency_ms INTEGER,
  llm_response_time_ms INTEGER,

  -- Metadata
  metadata JSONB,

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for agent_metrics
CREATE INDEX idx_metrics_time ON agent_metrics(recorded_at DESC);
CREATE INDEX idx_metrics_agent ON agent_metrics(agent_connection_id);
CREATE INDEX idx_metrics_document ON agent_metrics(document_id, recorded_at DESC);

-- Function: Increment agent metric counters
CREATE OR REPLACE FUNCTION increment_agent_metric(
  agent_id_param TEXT,
  metric_name TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Validate metric name to prevent SQL injection
  IF metric_name NOT IN ('llm_calls_count', 'locations_marked_count') THEN
    RAISE EXCEPTION 'Invalid metric name: %', metric_name;
  END IF;

  -- Dynamic SQL to increment the specified counter
  EXECUTE format(
    'UPDATE agent_connections SET %I = %I + 1, last_activity_at = NOW() WHERE agent_id = $1',
    metric_name, metric_name
  ) USING agent_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get system statistics
CREATE OR REPLACE FUNCTION get_agent_system_stats()
RETURNS TABLE (
  total_agents BIGINT,
  active_agents BIGINT,
  connecting_agents BIGINT,
  avg_memory_mb NUMERIC,
  total_llm_calls BIGINT,
  total_locations_marked BIGINT,
  unique_documents BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_agents,
    COUNT(*) FILTER (WHERE status = 'active') as active_agents,
    COUNT(*) FILTER (WHERE status = 'connecting') as connecting_agents,
    ROUND(AVG(memory_mb)::numeric, 2) as avg_memory_mb,
    SUM(llm_calls_count) as total_llm_calls,
    SUM(locations_marked_count) as total_locations_marked,
    COUNT(DISTINCT document_id) as unique_documents
  FROM agent_connections
  WHERE disconnected_at IS NULL OR disconnected_at > NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get active connections for a manager
CREATE OR REPLACE FUNCTION get_manager_active_agents(manager_id_param TEXT)
RETURNS TABLE (
  agent_id TEXT,
  document_id TEXT,
  status TEXT,
  connected_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  memory_mb INTEGER,
  llm_calls_count INTEGER,
  locations_marked_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ac.agent_id,
    ac.document_id,
    ac.status,
    ac.connected_at,
    ac.last_activity_at,
    ac.memory_mb,
    ac.llm_calls_count,
    ac.locations_marked_count
  FROM agent_connections ac
  WHERE ac.manager_id = manager_id_param
    AND ac.status IN ('connecting', 'active')
  ORDER BY ac.last_activity_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable Row Level Security (RLS) on tables
ALTER TABLE agent_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow service role full access (for agent manager)
CREATE POLICY "Service role has full access to agent_connections"
  ON agent_connections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to document_activity"
  ON document_activity
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to agent_metrics"
  ON agent_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies: Authenticated users can read stats (for dashboard/monitoring)
CREATE POLICY "Authenticated users can read agent_connections"
  ON agent_connections
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read document_activity"
  ON document_activity
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read agent_metrics"
  ON agent_metrics
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant permissions to service role
GRANT ALL ON agent_connections TO service_role;
GRANT ALL ON document_activity TO service_role;
GRANT ALL ON agent_metrics TO service_role;
GRANT USAGE, SELECT ON SEQUENCE document_activity_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE agent_metrics_id_seq TO service_role;

-- Grant read permissions to authenticated users
GRANT SELECT ON agent_connections TO authenticated;
GRANT SELECT ON document_activity TO authenticated;
GRANT SELECT ON agent_metrics TO authenticated;

-- Comments for documentation
COMMENT ON TABLE agent_connections IS 'Tracks active agent processes managing document collaboration';
COMMENT ON TABLE document_activity IS 'Logs document activity events from Durable Objects';
COMMENT ON TABLE agent_metrics IS 'Time-series performance metrics for agent processes';
COMMENT ON FUNCTION increment_agent_metric IS 'Atomically increments agent metric counters';
COMMENT ON FUNCTION get_agent_system_stats IS 'Returns aggregated statistics across all agents';
COMMENT ON FUNCTION get_manager_active_agents IS 'Returns active agents for a specific manager';
