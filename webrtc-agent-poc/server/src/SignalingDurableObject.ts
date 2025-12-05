/**
 * SignalingDurableObject - Cloudflare Durable Object for WebSocket signaling
 *
 * Adapted from SignalingServer.ts to use Cloudflare's native WebSocket API
 * Each Durable Object instance handles signaling for one document
 */

import type { SignalingMessage, HealthResponse } from './types/signaling.js';

interface ConnectionMetadata {
  id: string;
  documentId: string;
  ip: string;
  userAgent: string;
  connectedAt: Date;
  messageCount: number;
  lastActivity: Date;
  subscribedTopics: string[];
}

interface MessageLog {
  timestamp: Date;
  clientId: string;
  documentId: string;
  type: string;
  topic?: string;
  dataType?: string;
  direction: 'inbound' | 'outbound';
  data?: any;
}

export class SignalingDurableObject implements DurableObject {
  private sessions: Set<WebSocket> = new Set();
  private topics: Map<string, Set<WebSocket>> = new Map();
  private connections: Map<WebSocket, ConnectionMetadata> = new Map();
  private messageLog: MessageLog[] = [];
  private debugClients: Set<WebSocket> = new Set();
  private readonly MAX_MESSAGE_LOG = 100;
  private documentId: string;

  constructor(private state: DurableObjectState, private env: any) {
    // Extract document ID from the Durable Object ID
    this.documentId = '';
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Extract document ID from path or use a default for debug
    const match = pathname.match(/^\/signaling\/([^/]+)$/);
    if (match) {
      this.documentId = decodeURIComponent(match[1]);
    } else if (pathname === '/debug-ws') {
      this.documentId = '__debug__';
    }

    // Check for WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      return this.handleWebSocket(request);
    }

    // HTTP API endpoints for debugging
    if (pathname === '/api/health') {
      return new Response(JSON.stringify(this.getHealthStats()), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (pathname === '/api/connections') {
      return new Response(JSON.stringify({ connections: this.getConnectionDetails() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle WebSocket upgrade and connection
   */
  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket connection
    server.accept();

    // Get client info
    const ip = request.headers.get('CF-Connecting-IP') ||
               request.headers.get('X-Forwarded-For') ||
               'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';

    // Handle the connection
    if (this.documentId === '__debug__') {
      this.handleDebugConnection(server);
    } else {
      this.handleConnection(server, this.documentId, ip, userAgent);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle a new WebSocket connection for signaling
   */
  private handleConnection(ws: WebSocket, documentId: string, ip: string, userAgent: string): void {
    this.sessions.add(ws);

    const connectionId = `${documentId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const metadata: ConnectionMetadata = {
      id: connectionId,
      documentId,
      ip,
      userAgent,
      connectedAt: new Date(),
      messageCount: 0,
      lastActivity: new Date(),
      subscribedTopics: [],
    };
    this.connections.set(ws, metadata);

    const subscribedTopics = new Set<string>();

    console.log(`[SignalingDO] New WebSocket connection for document: ${documentId}. Total:`, this.sessions.size);

    // Send TURN credentials immediately
    this.sendTurnCredentials(ws);

    // Handle messages
    ws.addEventListener('message', (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data as string);
        this.handleMessage(ws, message, documentId, subscribedTopics);
      } catch (error) {
        console.error('[SignalingDO] Error handling message:', error);
      }
    });

    // Handle close
    ws.addEventListener('close', () => {
      console.log(`[SignalingDO] WebSocket closed for document: ${documentId}`);

      // Clean up subscriptions
      subscribedTopics.forEach((topic) => {
        const subs = this.topics.get(topic);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) {
            this.topics.delete(topic);
          }
        }
      });

      this.sessions.delete(ws);
      this.connections.delete(ws);
      console.log('[SignalingDO] Total connections remaining:', this.sessions.size);
    });

    // Handle errors
    ws.addEventListener('error', (event) => {
      console.error('[SignalingDO] WebSocket error:', event);
    });
  }

  /**
   * Handle a signaling message
   */
  private handleMessage(
    ws: WebSocket,
    message: SignalingMessage,
    documentId: string,
    subscribedTopics: Set<string>
  ): void {
    const metadata = this.connections.get(ws);
    if (metadata) {
      metadata.messageCount++;
      metadata.lastActivity = new Date();
    }

    this.logMessage({
      timestamp: new Date(),
      clientId: metadata?.id || 'unknown',
      documentId,
      type: message.type,
      topic: message.topic,
      dataType: message.data && typeof message.data === 'object' ? message.data.type : undefined,
      direction: 'inbound',
      data: message.data,
    });

    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(ws, message.topics || [], documentId, subscribedTopics);
        break;

      case 'unsubscribe':
        this.handleUnsubscribe(ws, message.topics || [], subscribedTopics);
        break;

      case 'publish':
        this.handlePublish(ws, message, documentId);
        break;

      case 'ping':
        this.handlePing(ws);
        break;

      default:
        console.warn('[SignalingDO] Unknown message type:', (message as any).type);
    }
  }

  /**
   * Handle subscribe message
   */
  private handleSubscribe(
    ws: WebSocket,
    topics: string[],
    documentId: string,
    subscribedTopics: Set<string>
  ): void {
    const metadata = this.connections.get(ws);

    topics.forEach((topic) => {
      const topicKey = `${documentId}:${topic}`;

      if (!this.topics.has(topicKey)) {
        this.topics.set(topicKey, new Set());
      }
      this.topics.get(topicKey)!.add(ws);
      subscribedTopics.add(topicKey);

      if (metadata && !metadata.subscribedTopics.includes(topicKey)) {
        metadata.subscribedTopics.push(topicKey);
      }

      console.log(`[SignalingDO] Client subscribed to topic: ${topicKey}. Subscribers:`, this.topics.get(topicKey)!.size);
    });
  }

  /**
   * Handle unsubscribe message
   */
  private handleUnsubscribe(
    ws: WebSocket,
    topics: string[],
    subscribedTopics: Set<string>
  ): void {
    topics.forEach((topic) => {
      const subs = this.topics.get(topic);
      if (subs) {
        subs.delete(ws);
        if (subs.size === 0) {
          this.topics.delete(topic);
        }
        console.log(`[SignalingDO] Client unsubscribed from topic: ${topic}`);
      }
      subscribedTopics.delete(topic);
    });
  }

  /**
   * Handle publish message
   */
  private handlePublish(_ws: WebSocket, message: SignalingMessage, documentId: string): void {
    if (!message.topic) {
      return;
    }

    const topicKey = `${documentId}:${message.topic}`;
    const subscribers = this.topics.get(topicKey);

    if (subscribers) {
      const publishMessage = JSON.stringify({
        type: 'publish',
        topic: message.topic,
        data: message.data,
        clients: subscribers.size,
      });

      let messageType = 'unknown';
      if (message.data && typeof message.data === 'object') {
        messageType = message.data.type || 'data';
      }
      console.log(`[SignalingDO] Broadcasting to ${subscribers.size} subscribers on topic: ${topicKey} (message type: ${messageType})`);

      subscribers.forEach((subscriber) => {
        try {
          subscriber.send(publishMessage);
        } catch (error) {
          console.error('[SignalingDO] Error sending to subscriber:', error);
        }
      });
    } else {
      console.log(`[SignalingDO] No subscribers for topic: ${topicKey}`);
    }
  }

  /**
   * Handle ping message
   */
  private handlePing(ws: WebSocket): void {
    try {
      ws.send(JSON.stringify({ type: 'pong' }));
    } catch (error) {
      console.error('[SignalingDO] Error sending pong:', error);
    }
  }

  /**
   * Send TURN credentials to client
   */
  private async sendTurnCredentials(ws: WebSocket): Promise<void> {
    // In Cloudflare Workers, TURN credentials would be fetched from env
    // For now, we'll skip this or implement it later
    console.log('[SignalingDO] TURN credentials not yet implemented for Durable Objects');
  }

  /**
   * Handle debug connection
   */
  private handleDebugConnection(ws: WebSocket): void {
    this.debugClients.add(ws);
    console.log(`[SignalingDO] Debug client connected. Total debug clients:`, this.debugClients.size);

    ws.addEventListener('close', () => {
      this.debugClients.delete(ws);
      console.log(`[SignalingDO] Debug client disconnected. Remaining:`, this.debugClients.size);
    });

    // Send initial snapshot
    const update = {
      type: 'debug-update',
      data: {
        connections: this.getConnectionDetails(),
        topics: this.getTopicCounts(),
        recentMessages: this.messageLog.slice(-20),
      },
    };
    ws.send(JSON.stringify(update));
  }

  /**
   * Get health statistics
   */
  private getHealthStats(): HealthResponse {
    return {
      status: 'ok',
      connections: this.sessions.size,
      topics: Array.from(this.topics.keys()),
      topicCounts: Array.from(this.topics.entries()).map(([topic, subs]) => ({
        topic,
        subscribers: subs.size,
      })),
    };
  }

  /**
   * Get detailed connection information
   */
  private getConnectionDetails(): Array<ConnectionMetadata & { connected: boolean }> {
    return Array.from(this.connections.entries()).map(([ws, metadata]) => ({
      ...metadata,
      connected: ws.readyState === WebSocket.READY_STATE_OPEN,
    }));
  }

  /**
   * Get topic counts
   */
  private getTopicCounts(): Array<{ topic: string; subscribers: number }> {
    return Array.from(this.topics.entries()).map(([topic, subs]) => ({
      topic,
      subscribers: subs.size,
    }));
  }

  /**
   * Log a message
   */
  private logMessage(logEntry: MessageLog): void {
    this.messageLog.push(logEntry);
    if (this.messageLog.length > this.MAX_MESSAGE_LOG) {
      this.messageLog.shift();
    }
  }
}
