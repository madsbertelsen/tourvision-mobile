/**
 * Database client for Agent Management System
 * Wraps Supabase operations for agent_connections, document_activity, and agent_metrics
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  AgentConnection,
  DocumentActivity,
  AgentMetrics,
  SystemStats,
  ActivitySignal,
  AgentStatus
} from './types.js';

export class AgentDatabase {
  private supabase: SupabaseClient;
  private supabaseRealtime: SupabaseClient;

  constructor(supabaseUrl: string, supabaseServiceKey: string, supabaseAnonKey?: string) {
    // Admin client for operations (service key)
    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    // Realtime client for subscriptions (anon key)
    // Service role keys DO NOT work with Supabase realtime subscriptions
    this.supabaseRealtime = createClient(
      supabaseUrl,
      supabaseAnonKey || supabaseServiceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          },
          timeout: 30000, // 30 second timeout
          heartbeatIntervalMs: 15000 // Send heartbeat every 15 seconds
        }
      }
    );
  }

  /**
   * Register a new agent connection
   */
  async registerAgent(
    documentId: string,
    agentId: string,
    managerId: string,
    managerHost: string,
    pid?: number
  ): Promise<AgentConnection | null> {
    const { data, error } = await this.supabase
      .from('agent_connections')
      .insert({
        document_id: documentId,
        agent_id: agentId,
        agent_pid: pid || null,
        status: 'connecting',
        manager_id: managerId,
        manager_host: managerHost
      })
      .select()
      .single();

    if (error) {
      console.error('[DB] Failed to register agent:', error.message);
      return null;
    }

    return data as AgentConnection;
  }

  /**
   * Update agent PID after process spawned
   */
  async updateAgentPid(agentId: string, pid: number): Promise<void> {
    await this.supabase
      .from('agent_connections')
      .update({ agent_pid: pid })
      .eq('agent_id', agentId);
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
    await this.supabase
      .from('agent_connections')
      .update({
        status,
        last_activity_at: new Date().toISOString()
      })
      .eq('agent_id', agentId);
  }

  /**
   * Mark agent as disconnected
   */
  async disconnectAgent(agentId: string, reason?: string): Promise<void> {
    await this.supabase
      .from('agent_connections')
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
        error_message: reason || null
      })
      .eq('agent_id', agentId);
  }

  /**
   * Find active agent for a specific document
   */
  async findAgentForDocument(documentId: string): Promise<AgentConnection | null> {
    const { data, error } = await this.supabase
      .from('agent_connections')
      .select('*')
      .eq('document_id', documentId)
      .in('status', ['connecting', 'active'])
      .maybeSingle();

    if (error) {
      console.error('[DB] Error finding agent for document:', error.message);
      return null;
    }

    return data as AgentConnection | null;
  }

  /**
   * Get all active agents for a specific manager
   */
  async getActiveAgents(managerId: string): Promise<AgentConnection[]> {
    const { data, error } = await this.supabase
      .from('agent_connections')
      .select('*')
      .eq('manager_id', managerId)
      .in('status', ['connecting', 'active'])
      .order('connected_at', { ascending: false });

    if (error) {
      console.error('[DB] Error getting active agents:', error.message);
      return [];
    }

    return (data as AgentConnection[]) || [];
  }

  /**
   * Get agents using RPC function
   */
  async getManagerActiveAgentsRPC(managerId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .rpc('get_manager_active_agents', { manager_id_param: managerId });

    if (error) {
      console.error('[DB] Error calling get_manager_active_agents:', error.message);
      return [];
    }

    return data || [];
  }

  /**
   * Increment a metric counter
   */
  async incrementMetric(agentId: string, metricName: 'llm_calls_count' | 'locations_marked_count'): Promise<void> {
    const { error } = await this.supabase
      .rpc('increment_agent_metric', {
        agent_id_param: agentId,
        metric_name: metricName
      });

    if (error) {
      console.error('[DB] Error incrementing metric:', error.message);
    }
  }

  /**
   * Record performance metrics
   */
  async recordMetrics(
    agentConnectionId: string,
    documentId: string,
    metrics: {
      memory_mb?: number;
      cpu_percent?: number;
      websocket_latency_ms?: number;
      llm_response_time_ms?: number;
    }
  ): Promise<void> {
    await this.supabase
      .from('agent_metrics')
      .insert({
        agent_connection_id: agentConnectionId,
        document_id: documentId,
        ...metrics
      });
  }

  /**
   * Log document activity event
   */
  async logDocumentActivity(signal: ActivitySignal): Promise<void> {
    await this.supabase
      .from('document_activity')
      .insert({
        document_id: signal.document_id,
        event_type: signal.event_type,
        user_count: signal.user_count,
        metadata: signal.metadata || null
      });
  }

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<SystemStats | null> {
    const { data, error } = await this.supabase
      .rpc('get_agent_system_stats')
      .single();

    if (error) {
      console.error('[DB] Error getting system stats:', error.message);
      return null;
    }

    return data as SystemStats;
  }

  /**
   * Find least recently active document for eviction
   */
  async findLeastActiveDocument(managerId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('agent_connections')
      .select('document_id, last_activity_at')
      .eq('manager_id', managerId)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.document_id;
  }

  /**
   * Get document activity history
   */
  async getDocumentActivityHistory(documentId: string, limit: number = 50): Promise<DocumentActivity[]> {
    const { data, error } = await this.supabase
      .from('document_activity')
      .select('*')
      .eq('document_id', documentId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[DB] Error getting document activity:', error.message);
      return [];
    }

    return (data as DocumentActivity[]) || [];
  }

  /**
   * Subscribe to document_activity changes
   * NOTE: Uses supabaseRealtime client with anon key because
   * service role keys DO NOT work with Supabase realtime subscriptions
   */
  subscribeToDocumentActivity(
    callback: (event: DocumentActivity) => void
  ): () => void {
    let channel: any;
    let retryAttempt = 0;
    const maxRetries = 5;
    const retryDelay = 5000; // 5 seconds
    let fallbackToPolling = false;

    const subscribe = () => {
      channel = this.supabaseRealtime
        .channel('document-activity-changes')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'document_activity'
          },
          (payload) => {
            callback(payload.new as DocumentActivity);
          }
        )
        .subscribe((status, err) => {
          console.log('[DB] Realtime subscription status:', status);
          if (err) {
            console.error('[DB] Realtime subscription error:', err);
          }
          if (status === 'SUBSCRIBED') {
            console.log('[DB] ✅ Successfully subscribed to document_activity changes');
            retryAttempt = 0; // Reset retry counter on success
          } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            if (retryAttempt < maxRetries) {
              retryAttempt++;
              console.log(`[DB] ⚠️  Subscription failed (${status}). Retrying in ${retryDelay/1000}s (attempt ${retryAttempt}/${maxRetries})...`);

              // Remove failed channel
              this.supabaseRealtime.removeChannel(channel);

              // Retry after delay
              setTimeout(() => subscribe(), retryDelay);
            } else {
              console.error(`[DB] ❌ Realtime subscription failed after ${maxRetries} attempts`);
              console.log('[DB] 🔄 Falling back to polling mode...');
              fallbackToPolling = true;
            }
          }
        });
    };

    // Initial subscription
    subscribe();

    // Return cleanup function
    return () => {
      if (channel) {
        this.supabaseRealtime.removeChannel(channel);
      }
    };
  }

  /**
   * Poll for new document_activity events (fallback when Realtime fails)
   */
  pollDocumentActivity(
    callback: (event: DocumentActivity) => void,
    intervalMs: number = 5000
  ): () => void {
    let lastTimestamp: string | null = null;
    let intervalId: NodeJS.Timeout;

    const poll = async () => {
      try {
        const query = this.supabase
          .from('document_activity')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(10);

        // Only get events after last seen timestamp
        if (lastTimestamp) {
          query.gt('timestamp', lastTimestamp);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[DB] Polling error:', error.message);
          return;
        }

        if (data && data.length > 0) {
          // Process in chronological order (oldest first)
          const events = data.reverse() as DocumentActivity[];

          for (const event of events) {
            callback(event);
          }

          // Update last seen timestamp
          lastTimestamp = data[0].timestamp;
        }
      } catch (error) {
        console.error('[DB] Polling exception:', error);
      }
    };

    // Initial poll
    console.log(`[DB] 📊 Starting polling mode (interval: ${intervalMs}ms)`);
    poll();

    // Set up interval
    intervalId = setInterval(poll, intervalMs);

    // Return cleanup function
    return () => {
      clearInterval(intervalId);
      console.log('[DB] Stopped polling');
    };
  }

  /**
   * Get Supabase client (for custom queries)
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }
}

// Export singleton instance factory
export function createAgentDatabase(
  supabaseUrl: string,
  supabaseServiceKey: string,
  supabaseAnonKey?: string
): AgentDatabase {
  return new AgentDatabase(supabaseUrl, supabaseServiceKey, supabaseAnonKey);
}
