/**
 * SignalingServer - Implements y-webrtc signaling protocol
 *
 * Ported from Cloudflare Durable Object to Express + ws
 * Maintains 100% protocol compatibility with the original implementation
 */

import { WebSocket } from 'ws';
import type { SignalingMessage, HealthResponse } from './types/signaling.js';
import { fetchTurnCredentials } from './utils/turnCredentials.js';

/**
 * Connection metadata for debugging and monitoring
 */
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

/**
 * Message log entry for debugging
 */
interface MessageLog {
  timestamp: Date;
  clientId: string;
  documentId: string;
  type: string;
  topic?: string;
  dataType?: string;
  direction: 'inbound' | 'outbound';
  data?: any; // Full message data payload
}

export class SignalingServer {
  // Track all active WebSocket connections
  private sessions: Set<WebSocket> = new Set();

  // Track topic subscriptions: topic -> Set of WebSocket connections
  private topics: Map<string, Set<WebSocket>> = new Map();

  // Debug and monitoring data
  private connections: Map<WebSocket, ConnectionMetadata> = new Map();
  private messageLog: MessageLog[] = [];
  private debugClients: Set<WebSocket> = new Set();
  private readonly MAX_MESSAGE_LOG = 100;

  // Track which documents have been seen (for auto-launching agents)
  private documentsSeen: Map<string, boolean> = new Map();

  /**
   * Handle a new WebSocket connection
   */
  handleConnection(ws: WebSocket, documentId: string, ip: string = 'unknown', userAgent: string = 'unknown'): void {
    // Add to sessions
    this.sessions.add(ws);

    // Create connection metadata
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

    // Track which topics this connection subscribes to
    const subscribedTopics = new Set<string>();

    console.log(`[SignalingServer] New WebSocket connection for document: ${documentId}. Total:`, this.sessions.size);

    // Check if this is the first connection for this document
    const isNewDocument = !this.documentsSeen.has(documentId);
    if (isNewDocument) {
      this.documentsSeen.set(documentId, true);
      console.log(`[SignalingServer] First connection for document: ${documentId}. Broadcasting new-document event.`);
      this.broadcastNewDocument(documentId);
    }

    this.broadcastDebugUpdate();

    // Send TURN credentials to client immediately on connection
    this.sendTurnCredentialsToClient(ws);

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message: SignalingMessage = JSON.parse(data.toString());
        this.handleMessage(ws, message, documentId, subscribedTopics);
      } catch (error) {
        console.error('[SignalingServer] Error handling WebSocket message:', error);
      }
    });

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[SignalingServer] WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);

      // Clean up subscriptions
      subscribedTopics.forEach((topic) => {
        const subs = this.topics.get(topic);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) {
            this.topics.delete(topic);
          }
          console.log(`[SignalingServer] Cleaned up subscription for topic: ${topic}`);
        }
      });

      // Remove from sessions and connections
      this.sessions.delete(ws);
      this.connections.delete(ws);

      console.log('[SignalingServer] Total connections remaining:', this.sessions.size);
      this.broadcastDebugUpdate();
    });

    // Handle WebSocket errors
    ws.on('error', (error: Error) => {
      console.error('[SignalingServer] WebSocket error:', error);
      try {
        ws.close();
      } catch (e) {
        // Already closed
      }
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
    // Update connection metadata
    const metadata = this.connections.get(ws);
    if (metadata) {
      metadata.messageCount++;
      metadata.lastActivity = new Date();
    }

    // Log message
    this.logMessage({
      timestamp: new Date(),
      clientId: metadata?.id || 'unknown',
      documentId,
      type: message.type,
      topic: message.topic,
      dataType: message.data && typeof message.data === 'object' ? message.data.type : undefined,
      direction: 'inbound',
      data: message.data, // Include full data payload for debugging
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
        console.warn('[SignalingServer] Unknown message type:', (message as any).type);
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
      // Namespace topic by documentId for isolation
      const topicKey = `${documentId}:${topic}`;

      if (!this.topics.has(topicKey)) {
        this.topics.set(topicKey, new Set());
      }
      this.topics.get(topicKey)!.add(ws);
      subscribedTopics.add(topicKey);

      // Update metadata
      if (metadata && !metadata.subscribedTopics.includes(topicKey)) {
        metadata.subscribedTopics.push(topicKey);
      }

      console.log(`[SignalingServer] Client subscribed to topic: ${topicKey}. Subscribers:`, this.topics.get(topicKey)!.size);
    });

    this.broadcastDebugUpdate();
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
        console.log(`[SignalingServer] Client unsubscribed from topic: ${topic}`);
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

    // Namespace topic by documentId (must match handleSubscribe)
    const topicKey = `${documentId}:${message.topic}`;
    const subscribers = this.topics.get(topicKey);
    if (subscribers) {
      const publishMessage = JSON.stringify({
        type: 'publish',
        topic: message.topic,
        data: message.data,
        clients: subscribers.size,
      });

      // Log WebRTC message details for debugging
      let messageType = 'unknown';
      if (message.data && typeof message.data === 'object') {
        messageType = message.data.type || 'data';
      }
      console.log(`[SignalingServer] Broadcasting to ${subscribers.size} subscribers on topic: ${topicKey} (message type: ${messageType})`);

      // Send to all subscribers
      subscribers.forEach((subscriber) => {
        try {
          if (subscriber.readyState === WebSocket.OPEN) {
            subscriber.send(publishMessage);
          }
        } catch (error) {
          console.error('[SignalingServer] Error sending to subscriber:', error);
        }
      });
    } else {
      console.log(`[SignalingServer] No subscribers for topic: ${topicKey}`);
    }
  }

  /**
   * Handle ping message
   */
  private handlePing(ws: WebSocket): void {
    try {
      ws.send(JSON.stringify({ type: 'pong' }));
    } catch (error) {
      console.error('[SignalingServer] Error sending pong:', error);
    }
  }

  /**
   * Get health statistics
   */
  getHealthStats(): HealthResponse {
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
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get topic list
   */
  getTopics(): string[] {
    return Array.from(this.topics.keys());
  }

  /**
   * Get topic counts
   */
  getTopicCounts(): Array<{ topic: string; subscribers: number }> {
    return Array.from(this.topics.entries()).map(([topic, subs]) => ({
      topic,
      subscribers: subs.size,
    }));
  }

  /**
   * Log a message (circular buffer)
   */
  private logMessage(logEntry: MessageLog): void {
    this.messageLog.push(logEntry);
    if (this.messageLog.length > this.MAX_MESSAGE_LOG) {
      this.messageLog.shift();
    }
    this.broadcastDebugUpdate();
  }

  /**
   * Broadcast debug update to all debug clients
   */
  private broadcastDebugUpdate(): void {
    if (this.debugClients.size === 0) {
      return;
    }

    const update = {
      type: 'debug-update',
      data: {
        connections: this.getConnectionDetails(),
        documents: this.getDocumentGroups(),
        topics: this.getTopicCounts(),
        recentMessages: this.messageLog.slice(-20), // Last 20 messages
      },
    };

    const message = JSON.stringify(update);

    this.debugClients.forEach((debugClient) => {
      try {
        if (debugClient.readyState === WebSocket.OPEN) {
          debugClient.send(message);
        }
      } catch (error) {
        console.error('[SignalingServer] Error sending debug update:', error);
      }
    });
  }

  /**
   * Broadcast new document event to debug clients (for auto-launching agents)
   */
  private broadcastNewDocument(documentId: string): void {
    if (this.debugClients.size === 0) {
      return;
    }

    const event = {
      type: 'new-document',
      documentId,
      timestamp: new Date().toISOString()
    };

    const message = JSON.stringify(event);

    this.debugClients.forEach((debugClient) => {
      try {
        if (debugClient.readyState === WebSocket.OPEN) {
          debugClient.send(message);
        }
      } catch (error) {
        console.error('[SignalingServer] Error sending new-document event:', error);
      }
    });
  }

  /**
   * Register a debug client
   */
  registerDebugClient(ws: WebSocket): void {
    this.debugClients.add(ws);
    console.log(`[SignalingServer] Debug client connected. Total debug clients:`, this.debugClients.size);

    // Send initial snapshot
    this.broadcastDebugUpdate();

    // Clean up on disconnect
    ws.on('close', () => {
      this.debugClients.delete(ws);
      console.log(`[SignalingServer] Debug client disconnected. Remaining:`, this.debugClients.size);
    });
  }

  /**
   * Unregister a debug client
   */
  unregisterDebugClient(ws: WebSocket): void {
    this.debugClients.delete(ws);
  }

  /**
   * Get detailed connection information
   */
  getConnectionDetails(): Array<ConnectionMetadata & { connected: boolean }> {
    return Array.from(this.connections.entries()).map(([ws, metadata]) => ({
      ...metadata,
      connected: ws.readyState === WebSocket.OPEN,
    }));
  }

  /**
   * Get recent message log
   */
  getMessageLog(limit?: number): MessageLog[] {
    if (limit) {
      return this.messageLog.slice(-limit);
    }
    return [...this.messageLog];
  }

  /**
   * Get connections grouped by document ID
   */
  getDocumentGroups(): Array<{
    documentId: string;
    clientCount: number;
    clients: Array<ConnectionMetadata & { connected: boolean }>;
    lastActivity: Date;
    totalMessages: number;
  }> {
    // Group connections by documentId
    const documentMap = new Map<string, Array<ConnectionMetadata & { connected: boolean }>>();

    Array.from(this.connections.entries()).forEach(([ws, metadata]) => {
      if (!documentMap.has(metadata.documentId)) {
        documentMap.set(metadata.documentId, []);
      }
      documentMap.get(metadata.documentId)!.push({
        ...metadata,
        connected: ws.readyState === WebSocket.OPEN,
      });
    });

    // Convert to array and calculate aggregate stats
    return Array.from(documentMap.entries()).map(([documentId, clients]) => {
      const lastActivity = new Date(Math.max(...clients.map(c => c.lastActivity.getTime())));
      const totalMessages = clients.reduce((sum, c) => sum + c.messageCount, 0);

      return {
        documentId,
        clientCount: clients.length,
        clients,
        lastActivity,
        totalMessages,
      };
    }).sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()); // Sort by most recent activity
  }

  /**
   * Inject test message for debugging
   */
  injectTestMessage(documentId: string, topic: string, data: any): void {
    const topicKey = `${documentId}:${topic}`;
    const subscribers = this.topics.get(topicKey);

    if (!subscribers || subscribers.size === 0) {
      console.log(`[SignalingServer] No subscribers for test message to topic: ${topicKey}`);
      return;
    }

    const publishMessage = JSON.stringify({
      type: 'publish',
      topic,
      data,
      clients: subscribers.size,
    });

    console.log(`[SignalingServer] Injecting test message to ${subscribers.size} subscribers on topic: ${topicKey}`);

    subscribers.forEach((subscriber) => {
      try {
        if (subscriber.readyState === WebSocket.OPEN) {
          subscriber.send(publishMessage);
        }
      } catch (error) {
        console.error('[SignalingServer] Error sending test message:', error);
      }
    });

    // Log the injected message
    this.logMessage({
      timestamp: new Date(),
      clientId: 'admin-inject',
      documentId,
      type: 'publish',
      topic,
      dataType: data?.type || 'test',
      direction: 'outbound',
      data: data,
    });
  }

  /**
   * Send TURN credentials to client via WebSocket
   */
  private async sendTurnCredentialsToClient(ws: WebSocket): Promise<void> {
    try {
      const turnCredentials = await fetchTurnCredentials();

      if (turnCredentials) {
        // Send TURN credentials as a special message type
        const turnMessage = JSON.stringify({
          type: 'turn-credentials',
          data: turnCredentials
        });

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(turnMessage);
          console.log('[SignalingServer] ✅ Sent TURN credentials to client');
        }
      } else {
        console.warn('[SignalingServer] ⚠️  TURN credentials not available (not configured)');
      }
    } catch (error) {
      console.error('[SignalingServer] Error sending TURN credentials:', error);
    }
  }
}
