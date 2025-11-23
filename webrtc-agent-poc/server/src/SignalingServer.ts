/**
 * SignalingServer - Implements y-webrtc signaling protocol
 *
 * Ported from Cloudflare Durable Object to Express + ws
 * Maintains 100% protocol compatibility with the original implementation
 */

import { WebSocket } from 'ws';
import type { SignalingMessage, HealthResponse } from './types/signaling.js';

export class SignalingServer {
  // Track all active WebSocket connections
  private sessions: Set<WebSocket> = new Set();

  // Track topic subscriptions: topic -> Set of WebSocket connections
  private topics: Map<string, Set<WebSocket>> = new Map();

  /**
   * Handle a new WebSocket connection
   */
  handleConnection(ws: WebSocket, documentId: string): void {
    // Add to sessions
    this.sessions.add(ws);

    // Track which topics this connection subscribes to
    const subscribedTopics = new Set<string>();

    console.log(`[SignalingServer] New WebSocket connection for document: ${documentId}. Total:`, this.sessions.size);

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

      // Remove from sessions
      this.sessions.delete(ws);

      console.log('[SignalingServer] Total connections remaining:', this.sessions.size);
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
    topics.forEach((topic) => {
      // Namespace topic by documentId for isolation
      const topicKey = `${documentId}:${topic}`;

      if (!this.topics.has(topicKey)) {
        this.topics.set(topicKey, new Set());
      }
      this.topics.get(topicKey)!.add(ws);
      subscribedTopics.add(topicKey);

      console.log(`[SignalingServer] Client subscribed to topic: ${topicKey}. Subscribers:`, this.topics.get(topicKey)!.size);
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
        console.log(`[SignalingServer] Client unsubscribed from topic: ${topic}`);
      }
      subscribedTopics.delete(topic);
    });
  }

  /**
   * Handle publish message
   */
  private handlePublish(ws: WebSocket, message: SignalingMessage, documentId: string): void {
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
}
