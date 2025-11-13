/**
 * Shared TypeScript types for Agent Management System
 */

// Agent connection status
export type AgentStatus =
  | 'connecting'
  | 'active'
  | 'idle'
  | 'detaching'
  | 'disconnected'
  | 'error';

// Document activity event types
export type ActivityEventType = 'active' | 'idle' | 'user_joined' | 'user_left';

// Agent connection record (from agent_connections table)
export interface AgentConnection {
  id: string;
  document_id: string;
  agent_id: string;
  agent_pid: number | null;
  status: AgentStatus;
  connected_at: string;
  disconnected_at: string | null;
  last_activity_at: string;
  memory_mb: number | null;
  cpu_percent: number | null;
  llm_calls_count: number;
  locations_marked_count: number;
  manager_id: string;
  manager_host: string | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
}

// Document activity record (from document_activity table)
export interface DocumentActivity {
  id: number;
  document_id: string;
  event_type: ActivityEventType;
  user_count: number;
  timestamp: string;
  metadata: Record<string, any> | null;
}

// Agent metrics record (from agent_metrics table)
export interface AgentMetrics {
  id: number;
  agent_connection_id: string;
  document_id: string;
  memory_mb: number | null;
  cpu_percent: number | null;
  websocket_latency_ms: number | null;
  llm_response_time_ms: number | null;
  metadata: Record<string, any> | null;
  recorded_at: string;
}

// System statistics (from get_agent_system_stats function)
export interface SystemStats {
  total_agents: number;
  active_agents: number;
  connecting_agents: number;
  avg_memory_mb: number;
  total_llm_calls: number;
  total_locations_marked: number;
  unique_documents: number;
}

// Activity signal sent from Durable Object → Supabase
export interface ActivitySignal {
  document_id: string;
  event_type: ActivityEventType;
  user_count: number;
  timestamp?: string;
  metadata?: Record<string, any>;
}

// IPC messages between manager and agent workers
export type AgentWorkerMessage =
  | { type: 'connected'; documentId: string; agentId: string }
  | { type: 'metrics'; documentId: string; agentId: string; memory_mb: number; cpu_percent: number; latency_ms?: number }
  | { type: 'llm_call'; documentId: string; agentId: string }
  | { type: 'location_marked'; documentId: string; agentId: string }
  | { type: 'error'; documentId: string; agentId: string; error: string }
  | { type: 'pong' };

export type ManagerMessage =
  | { type: 'shutdown' }
  | { type: 'ping' };

// Configuration
export interface AgentConfig {
  managerId: string;
  maxConcurrentAgents: number;
  idleTimeoutMs: number;
  wsPort: string;
  partyName: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  aiGatewayApiKey: string;
}

// Geocode result (existing from agent.ts)
export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

// Custom message data (existing from agent.ts)
export interface CustomMessageData {
  type: string;
  taskId?: string;
  result?: GeocodeResult;
  locationName?: string;
  targetClientId?: number;
  [key: string]: unknown;
}
