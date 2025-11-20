/**
 * Signaling Service - WebRTC Signaling for Agent Communication
 *
 * Simplified architecture: No rooms, just documentId-based signaling
 * Agent pre-generates WebRTC offer, service returns it to user
 */

import { DurableObject } from "cloudflare:workers";

interface Env {
  SIGNALING: DurableObjectNamespace;
  AGENT_MANAGER_URL?: string;
}

type PeerType = 'user' | 'agent';

interface SignalingMessage {
  type: 'answer' | 'ice-candidate' | 'join' | 'ready';
  from?: PeerType;
  data?: any;
}

/**
 * SignalingChannel - Durable Object for WebRTC signaling per document
 */
export class SignalingChannel extends DurableObject {
  private userConnection: WebSocket | null = null;
  private agentConnection: WebSocket | null = null;
  private documentId: string;
  private createdAt: number;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    // documentId is derived from Durable Object ID (set via idFromName)
    this.documentId = state.id.toString();
    this.createdAt = Date.now();
  }

  /**
   * Handle HTTP and WebSocket requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade for signaling
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    // Status endpoint
    if (request.method === 'GET' && url.pathname.endsWith('/status')) {
      return this.handleStatusRequest();
    }

    return new Response('Not found', { status: 404 });
  }

  /**
   * Handle status check
   */
  private handleStatusRequest(): Response {
    return new Response(JSON.stringify({
      documentId: this.documentId,
      userConnected: this.userConnection !== null,
      agentConnected: this.agentConnection !== null,
      createdAt: this.createdAt,
      uptime: Date.now() - this.createdAt
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Handle WebSocket upgrade
   */
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    this.ctx.acceptWebSocket(server as any);

    console.log(`[Signaling ${this.documentId}] WebSocket connection established`);

    return new Response(null, {
      status: 101,
      webSocket: client as any,
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      if (typeof message !== 'string') {
        console.warn('[Signaling] Received binary message, ignoring');
        return;
      }

      const data = JSON.parse(message) as SignalingMessage;

      console.log(`[Signaling ${this.documentId}] Received:`, data.type, 'from', data.from);

      // Identify peer type on first message
      if (data.type === 'join') {
        const peerType = data.data?.peerType as PeerType;

        if (peerType === 'user') {
          this.userConnection = ws;
          console.log(`[Signaling ${this.documentId}] User connected`);
        } else if (peerType === 'agent') {
          this.agentConnection = ws;
          console.log(`[Signaling ${this.documentId}] Agent connected`);
        }

        // Notify peer if both are connected
        if (this.userConnection && this.agentConnection) {
          this.sendToUser({ type: 'ready', data: { message: 'Agent connected' } });
          this.sendToAgent({ type: 'ready', data: { message: 'User connected' } });
        }

        return;
      }

      // Forward signaling messages between peers
      if (data.type === 'answer' || data.type === 'ice-candidate') {
        if (data.from === 'user' && this.agentConnection) {
          this.sendToAgent(data);
        } else if (data.from === 'agent' && this.userConnection) {
          this.sendToUser(data);
        } else {
          console.warn(`[Signaling ${this.documentId}] Cannot forward message, peer not connected`);
        }
      }
    } catch (error) {
      console.error('[Signaling] Error handling message:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    console.log(`[Signaling ${this.documentId}] WebSocket closed - code: ${code}, reason: ${reason}`);

    if (ws === this.userConnection) {
      console.log(`[Signaling ${this.documentId}] User disconnected`);
      this.userConnection = null;

      if (this.agentConnection) {
        this.sendToAgent({ type: 'peer-disconnected' as any, data: { peer: 'user' } });
      }
    } else if (ws === this.agentConnection) {
      console.log(`[Signaling ${this.documentId}] Agent disconnected`);
      this.agentConnection = null;

      if (this.userConnection) {
        this.sendToUser({ type: 'peer-disconnected' as any, data: { peer: 'agent' } });
      }
    }

    // Clean up if both disconnected
    if (!this.userConnection && !this.agentConnection) {
      console.log(`[Signaling ${this.documentId}] Channel empty, ready for cleanup`);
    }
  }

  /**
   * Handle WebSocket errors
   */
  async webSocketError(ws: WebSocket, error: unknown) {
    console.error(`[Signaling ${this.documentId}] WebSocket error:`, error);
  }

  /**
   * Send message to user
   */
  private sendToUser(message: SignalingMessage) {
    if (this.userConnection) {
      try {
        this.userConnection.send(JSON.stringify(message));
      } catch (error) {
        console.error('[Signaling] Error sending to user:', error);
      }
    }
  }

  /**
   * Send message to agent
   */
  private sendToAgent(message: SignalingMessage) {
    if (this.agentConnection) {
      try {
        this.agentConnection.send(JSON.stringify(message));
      } catch (error) {
        console.error('[Signaling] Error sending to agent:', error);
      }
    }
  }
}

/**
 * Main Worker entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // POST /connect/{documentId} - Request agent connection
    if (request.method === 'POST' && url.pathname.startsWith('/connect/')) {
      const documentId = url.pathname.split('/')[2];

      if (!documentId) {
        return new Response(JSON.stringify({ error: 'Document ID required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log(`[Service] Connection request for document: ${documentId}`);

      // Notify agent-manager to spawn agent and get offer
      const agentManagerUrl = env.AGENT_MANAGER_URL || 'http://localhost:3000';

      try {
        const response = await fetch(`${agentManagerUrl}/agent/spawn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId })
        });

        if (!response.ok) {
          throw new Error(`Agent-manager returned ${response.status}`);
        }

        const result = await response.json();
        console.log(`[Service] Agent spawned:`, result);

        // Return connection details to user
        return new Response(JSON.stringify({
          success: true,
          documentId,
          signalingUrl: `ws://localhost:8787/signal/${documentId}`,
          offer: result.offer,  // Agent's WebRTC offer
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          agentId: result.agentId
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('[Service] Failed to spawn agent:', error);
        return new Response(JSON.stringify({
          error: 'Failed to spawn agent',
          details: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // WebSocket signaling: /signal/{documentId}
    if (url.pathname.startsWith('/signal/')) {
      const documentId = url.pathname.split('/')[2];

      if (!documentId) {
        return new Response('Document ID required', { status: 400 });
      }

      // Get or create Durable Object for this document
      const id = env.SIGNALING.idFromName(documentId);
      const stub = env.SIGNALING.get(id);

      // Forward request to Durable Object
      return stub.fetch(request);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'signaling' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
} satisfies ExportedHandler<Env>;
