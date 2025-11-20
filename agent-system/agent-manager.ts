/**
 * Agent Manager - Orchestrates multiple agent worker processes
 *
 * Responsibilities:
 * - Subscribes to Supabase Realtime for document activity events
 * - Spawns agent workers for active documents
 * - Kills agents when documents become idle
 * - Enforces max concurrent agent limit with LRU eviction
 * - Handles crash recovery
 */

import { fork, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as dotenv from 'dotenv';
import express, { Express, Request, Response } from 'express';
import { createAgentDatabase, AgentDatabase } from './shared/database.js';
import type { DocumentActivity, AgentWorkerMessage, ManagerMessage } from './shared/types.js';
import { RedisStreamsClient, PunctuationEvent } from './shared/redis-streams.js';

// Load environment variables
dotenv.config();

// Configuration
const MANAGER_ID = process.env.MANAGER_ID || `manager-${uuidv4().substring(0, 8)}`;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_AGENTS || '10');
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS || '30000');
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000');
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Validation
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  console.error('[Manager] Missing required environment variables:');
  console.error('[Manager] - SUPABASE_URL');
  console.error('[Manager] - SUPABASE_ANON_KEY (for realtime subscriptions)');
  console.error('[Manager] - SUPABASE_SERVICE_KEY (for admin operations)');
  process.exit(1);
}

class AgentManager {
  private db: AgentDatabase;
  private agents = new Map<string, ChildProcess>();  // documentId -> process
  private agentIds = new Map<string, string>();      // documentId -> agentId
  private agentOffers = new Map<string, any>();      // documentId -> WebRTC offer (SDP)
  private healthCheckTimers = new Map<string, NodeJS.Timeout>();
  private realtimeUnsubscribe: (() => void) | null = null;
  private punctuationUnsubscribe: (() => void) | null = null;
  private redis: RedisStreamsClient;
  private httpServer: Express;

  constructor() {
    this.db = createAgentDatabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY);
    this.redis = new RedisStreamsClient(REDIS_URL);
    this.httpServer = express();
    this.httpServer.use(express.json());
  }

  async initialize() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║         Agent Manager - Multi-Document System       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`[Manager] ID: ${MANAGER_ID}`);
    console.log(`[Manager] Host: ${os.hostname()}`);
    console.log(`[Manager] Max Concurrent: ${MAX_CONCURRENT}`);
    console.log(`[Manager] Idle Timeout: ${IDLE_TIMEOUT_MS}ms`);
    console.log(`[Manager] Redis URL: ${REDIS_URL}`);
    console.log('');

    // Connect to Redis
    await this.redis.connect();

    // Recover existing agents on startup
    await this.recoverAgents();

    // Subscribe to document activity events
    this.subscribeToActivity();

    // Subscribe to punctuation detection from Redis
    this.subscribeToPunctuationRedis();

    // Setup HTTP server for lobby notifications
    this.setupHttpServer();

    console.log('[Manager] 🚀 Ready to manage agents');
    console.log('[Manager] Listening for document activity events and punctuation from Redis Streams...');
    console.log('');
  }

  /**
   * Wait for agent to generate and send its WebRTC offer
   * Returns the offer or null if timeout occurs
   */
  private async waitForAgentOffer(documentId: string, timeoutMs: number): Promise<any | null> {
    return new Promise((resolve) => {
      const checkInterval = 100; // Check every 100ms
      let elapsed = 0;

      const interval = setInterval(() => {
        const offer = this.agentOffers.get(documentId);
        if (offer) {
          clearInterval(interval);
          resolve(offer);
          return;
        }

        elapsed += checkInterval;
        if (elapsed >= timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, checkInterval);
    });
  }

  private setupHttpServer() {
    // POST /agent/spawn - Receive spawn requests from signaling service
    this.httpServer.post('/agent/spawn', async (req: Request, res: Response) => {
      try {
        const { documentId } = req.body;

        if (!documentId) {
          return res.status(400).json({
            success: false,
            error: 'Missing required field: documentId'
          });
        }

        console.log(`[Manager] 📨 Spawn request from signaling service: document=${documentId}`);

        // Spawn agent for this document
        await this.attachAgent(documentId);

        const agentId = this.agentIds.get(documentId);

        // Wait for agent to generate WebRTC offer (with timeout)
        const offer = await this.waitForAgentOffer(documentId, 5000);

        if (!offer) {
          console.error(`[Manager] ❌ Agent failed to generate offer within timeout`);
          return res.status(500).json({
            success: false,
            error: 'Agent failed to generate WebRTC offer'
          });
        }

        res.json({
          success: true,
          agentId,
          documentId,
          offer  // WebRTC offer from agent
        });
      } catch (error) {
        console.error('[Manager] Error spawning agent:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to spawn agent'
        });
      }
    });

    // Start HTTP server
    this.httpServer.listen(HTTP_PORT, () => {
      console.log(`[Manager] 🌐 HTTP server listening on http://localhost:${HTTP_PORT}`);
      console.log(`[Manager] Ready to receive lobby spawn requests at POST /agent/spawn`);
    });
  }

  private subscribeToActivity() {
    console.log('[Manager] 📡 Subscribing to Supabase Realtime...');

    // Try Realtime first
    this.realtimeUnsubscribe = this.db.subscribeToDocumentActivity(
      (event: DocumentActivity) => {
        this.handleActivityEvent(event);
      }
    );
  }

  private subscribeToPunctuation() {
    console.log('[Manager] 📡 Subscribing to punctuation broadcasts...');

    this.punctuationUnsubscribe = this.db.subscribeToPunctuationEvents(
      (event: any) => {
        this.handlePunctuationEvent(event);
      }
    );
  }

  private async subscribeToPunctuationRedis() {
    console.log('[Manager] 📡 Subscribing to Redis Streams for punctuation events...');

    this.punctuationUnsubscribe = await this.redis.consumePunctuationEvents(
      MANAGER_ID,
      (event: PunctuationEvent) => {
        this.handlePunctuationEvent({
          documentId: event.documentId,
          character: event.character,
          timestamp: event.timestamp
        });
      }
    );
  }

  private async handlePunctuationEvent(event: any) {
    console.log(`[Manager] 🔴 Punctuation detected: "${event.character}" in document ${event.documentId}`);

    // Check if an agent is already attached to this document
    const existingAgent = this.agents.get(event.documentId);

    if (existingAgent) {
      // Agent already attached - send it a message to trigger LLM processing
      console.log(`[Manager] 📤 Sending punctuation trigger to existing agent for ${event.documentId}`);
      const triggerMsg = {
        type: 'punctuation_trigger',
        character: event.character,
        timestamp: event.timestamp
      };
      existingAgent.send(triggerMsg);
    } else {
      // No agent attached - spawn one to handle the punctuation event
      console.log(`[Manager] 🚀 Spawning agent to process punctuation in ${event.documentId}`);
      await this.attachAgent(event.documentId);

      // After spawning, send the punctuation trigger
      setTimeout(() => {
        const agent = this.agents.get(event.documentId);
        if (agent) {
          const triggerMsg = {
            type: 'punctuation_trigger',
            character: event.character,
            timestamp: event.timestamp
          };
          agent.send(triggerMsg);
        }
      }, 2000); // Give agent 2 seconds to connect
    }
  }

  private async handleActivityEvent(event: DocumentActivity) {
    const { document_id, event_type, user_count } = event;

    console.log(`[Manager] 📨 Activity: ${event_type} for ${document_id} (users: ${user_count})`);

    if (event_type === 'active') {
      await this.attachAgent(document_id);
    } else if (event_type === 'idle') {
      await this.detachAgent(document_id, 'Document became idle');
    }
  }

  private async attachAgent(documentId: string) {
    // Check if already attached locally
    if (this.agents.has(documentId)) {
      console.log(`[Manager] ⏭️  Agent already attached to ${documentId}`);
      return;
    }

    // Check if another manager is handling this document
    const existing = await this.db.findAgentForDocument(documentId);
    if (existing) {
      console.log(`[Manager] ⏭️  Document ${documentId} already has agent (manager: ${existing.manager_id})`);
      return;
    }

    // Check concurrent limit
    if (this.agents.size >= MAX_CONCURRENT) {
      console.log(`[Manager] ⚠️  Max concurrent limit reached (${MAX_CONCURRENT}), evicting least active agent`);
      await this.evictLeastActiveAgent();
    }

    // Spawn new agent
    await this.spawnAgent(documentId);
  }

  private async spawnAgent(documentId: string) {
    const agentId = `agent-${documentId}-${Date.now()}`;

    console.log(`[Manager] 🔄 Spawning agent ${agentId} for ${documentId}...`);

    // Register in database BEFORE spawning
    const registered = await this.db.registerAgent(
      documentId,
      agentId,
      MANAGER_ID,
      os.hostname()
    );

    if (!registered) {
      console.error(`[Manager] ❌ Failed to register agent in database`);
      return;
    }

    try {
      // Fork worker launcher process (Playwright-based browser agent)
      const child = fork('./agent-worker-launcher.js', [documentId], {
        env: {
          ...process.env,
          DOCUMENT_ID: documentId,
          AGENT_ID: agentId,
          WS_PORT: process.env.WS_PORT || '8787',  // Ensure WS_PORT is passed
          AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY  // Pass AI Gateway key explicitly
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']  // Inherit stdout/stderr for logs
      });

      // Update with actual PID
      await this.db.updateAgentPid(agentId, child.pid!);

      // Setup message handler
      child.on('message', (msg: AgentWorkerMessage) => {
        this.handleAgentMessage(agentId, documentId, msg);
      });

      // Setup exit handler
      child.on('exit', (code, signal) => {
        this.handleAgentExit(agentId, documentId, code, signal);
      });

      // Setup error handler
      child.on('error', (error) => {
        console.error(`[Manager] ❌ Agent ${agentId} process error:`, error.message);
      });

      // Store references
      this.agents.set(documentId, child);
      this.agentIds.set(documentId, agentId);

      // Start health checks
      this.startHealthChecks(documentId, child);

      console.log(`[Manager] ✅ Spawned agent ${agentId} for ${documentId} (PID: ${child.pid})`);

    } catch (error: any) {
      console.error(`[Manager] ❌ Failed to spawn agent:`, error.message);
      await this.db.updateAgentStatus(agentId, 'error');
      await this.db.disconnectAgent(agentId, `Spawn failed: ${error.message}`);
    }
  }

  private async handleAgentMessage(agentId: string, documentId: string, msg: AgentWorkerMessage) {
    switch (msg.type) {
      case 'connected':
        console.log(`[Manager] ✅ Agent ${agentId} connected and synced`);
        await this.db.updateAgentStatus(agentId, 'active');
        break;

      case 'webrtc_offer':
        // Agent has generated its WebRTC offer
        console.log(`[Manager] 📡 Received WebRTC offer from agent ${agentId}`);
        this.agentOffers.set(documentId, msg.offer);
        break;

      case 'metrics':
        // Update metrics in database
        await this.db.recordMetrics(agentId, documentId, {
          memory_mb: msg.memory_mb,
          cpu_percent: msg.cpu_percent,
          websocket_latency_ms: msg.latency_ms
        });
        break;

      case 'llm_call':
        await this.db.incrementMetric(agentId, 'llm_calls_count');
        break;

      case 'location_marked':
        await this.db.incrementMetric(agentId, 'locations_marked_count');
        break;

      case 'error':
        console.error(`[Manager] ❌ Agent ${agentId} error:`, msg.error);
        await this.db.updateAgentStatus(agentId, 'error');
        break;

      case 'pong':
        // Health check response
        break;
    }
  }

  private async handleAgentExit(
    agentId: string,
    documentId: string,
    code: number | null,
    signal: string | null
  ) {
    console.log(`[Manager] 🛑 Agent ${agentId} exited (code: ${code}, signal: ${signal})`);

    // Clear health check timer
    const timer = this.healthCheckTimers.get(documentId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(documentId);
    }

    // Update database
    const reason = signal ? `Killed by signal: ${signal}` : `Exited with code: ${code}`;
    await this.db.disconnectAgent(agentId, reason);

    // Remove from tracking
    this.agents.delete(documentId);
    this.agentIds.delete(documentId);
  }

  private async detachAgent(documentId: string, reason: string) {
    const agent = this.agents.get(documentId);
    if (!agent) {
      console.log(`[Manager] ⏭️  No agent attached to ${documentId}`);
      return;
    }

    const agentId = this.agentIds.get(documentId)!;

    console.log(`[Manager] 🔄 Detaching agent ${agentId} from ${documentId} (${reason})`);

    // Update status
    await this.db.updateAgentStatus(agentId, 'detaching');

    // Send graceful shutdown message
    const shutdownMsg: ManagerMessage = { type: 'shutdown' };
    agent.send(shutdownMsg);

    // Wait for graceful exit or force kill after 5 seconds
    await Promise.race([
      new Promise(resolve => agent.on('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5000))
    ]);

    if (!agent.killed) {
      console.log(`[Manager] ⚠️  Agent ${agentId} did not exit gracefully, force killing`);
      agent.kill('SIGKILL');
    }
  }

  private async evictLeastActiveAgent() {
    const leastActiveDoc = await this.db.findLeastActiveDocument(MANAGER_ID);

    if (leastActiveDoc) {
      console.log(`[Manager] 🔄 Evicting least active document: ${leastActiveDoc}`);
      await this.detachAgent(leastActiveDoc, 'Evicted (LRU)');
    }
  }

  private startHealthChecks(documentId: string, child: ChildProcess) {
    const timer = setInterval(() => {
      const pingMsg: ManagerMessage = { type: 'ping' };
      child.send(pingMsg);

      // If no pong within 5 seconds, consider unhealthy
      const timeout = setTimeout(() => {
        console.error(`[Manager] ❌ Agent for ${documentId} unresponsive to ping`);
        // Could kill and restart here
      }, 5000);

      // Clear timeout when pong received
      const pongHandler = (msg: AgentWorkerMessage) => {
        if (msg.type === 'pong') {
          clearTimeout(timeout);
          child.off('message', pongHandler);
        }
      };

      child.on('message', pongHandler);
    }, 30000); // Ping every 30 seconds

    this.healthCheckTimers.set(documentId, timer);
  }

  private async recoverAgents() {
    console.log(`[Manager] 🔍 Recovering agents from previous session...`);

    const existingAgents = await this.db.getActiveAgents(MANAGER_ID);

    if (existingAgents.length === 0) {
      console.log(`[Manager] ℹ️  No existing agents to recover`);
      return;
    }

    console.log(`[Manager] Found ${existingAgents.length} potentially orphaned agent(s)`);

    for (const agent of existingAgents) {
      // Check if process still exists
      try {
        if (agent.agent_pid) {
          process.kill(agent.agent_pid, 0); // Signal 0 = check existence
          console.log(`[Manager] ⚠️  Orphaned agent found: ${agent.agent_id} (PID: ${agent.agent_pid})`);
          // Could attempt to kill or reconnect here
          // For now, just mark as disconnected
          await this.db.disconnectAgent(agent.agent_id, 'Process found running but not managed after restart');
        }
      } catch {
        // Process doesn't exist
        console.log(`[Manager] 🧹 Cleaning up dead agent: ${agent.agent_id}`);
        await this.db.disconnectAgent(agent.agent_id, 'Process not found on manager restart');
      }
    }
  }

  async shutdown() {
    console.log('');
    console.log('[Manager] 🛑 Shutting down...');

    // Unsubscribe from realtime
    if (this.realtimeUnsubscribe) {
      this.realtimeUnsubscribe();
    }

    // Unsubscribe from punctuation broadcasts
    if (this.punctuationUnsubscribe) {
      this.punctuationUnsubscribe();
    }

    // Disconnect Redis
    await this.redis.disconnect();

    // Shutdown all agents
    const documentIds = Array.from(this.agents.keys());
    console.log(`[Manager] Shutting down ${documentIds.length} agent(s)`);

    for (const documentId of documentIds) {
      await this.detachAgent(documentId, 'Manager shutdown');
    }

    console.log('[Manager] ✅ Shutdown complete');
    process.exit(0);
  }

  async printStats() {
    const stats = await this.db.getSystemStats();
    if (stats) {
      console.log('');
      console.log('╔══════════════════════════════════════════════════════╗');
      console.log('║                  System Statistics                   ║');
      console.log('╚══════════════════════════════════════════════════════╝');
      console.log(`Total Agents:      ${stats.total_agents}`);
      console.log(`Active Agents:     ${stats.active_agents}`);
      console.log(`Connecting Agents: ${stats.connecting_agents}`);
      console.log(`Unique Documents:  ${stats.unique_documents}`);
      console.log(`Avg Memory:        ${stats.avg_memory_mb?.toFixed(2)} MB`);
      console.log(`Total LLM Calls:   ${stats.total_llm_calls}`);
      console.log(`Total Locations:   ${stats.total_locations_marked}`);
      console.log('');
    }
  }
}

// Start the manager
const manager = new AgentManager();

manager.initialize().catch((error) => {
  console.error('[Manager] ❌ Failed to initialize:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => manager.shutdown());
process.on('SIGTERM', () => manager.shutdown());

// Print stats every 60 seconds
setInterval(() => manager.printStats(), 60000);
