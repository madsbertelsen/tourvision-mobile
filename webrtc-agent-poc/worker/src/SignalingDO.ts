/**
 * Signaling Durable Object
 *
 * Implements y-webrtc signaling protocol over WebSocket.
 * Provides topic-based pub/sub for WebRTC peer discovery.
 *
 * Each document gets its own Durable Object instance.
 */

export interface Env {
  SIGNALING: DurableObjectNamespace;
}

interface SignalingMessage {
  type: 'subscribe' | 'unsubscribe' | 'publish' | 'ping';
  topics?: string[];
  topic?: string;
  data?: any;
}

export class SignalingDurableObject {
  state: DurableObjectState;
  env: Env;

  // Track all WebSocket connections
  sessions: Set<WebSocket>;

  // Track topic subscriptions: topic -> Set of WebSocket connections
  topics: Map<string, Set<WebSocket>>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.topics = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for browser access
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Handle this WebSocket connection
      this.handleWebSocket(server);

      // Return the client-side WebSocket
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // GET /health - Health check
    if (request.method === 'GET' && path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        connections: this.sessions.size,
        topics: Array.from(this.topics.keys()),
        topicCounts: Array.from(this.topics.entries()).map(([topic, subs]) => ({
          topic,
          subscribers: subs.size
        }))
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 404 for unknown routes
    return new Response('Not found. Use WebSocket connection for signaling.', {
      status: 404,
      headers: corsHeaders
    });
  }

  handleWebSocket(ws: WebSocket) {
    // Accept the WebSocket connection
    ws.accept();

    // Add to sessions
    this.sessions.add(ws);

    // Track which topics this connection subscribes to
    const subscribedTopics = new Set<string>();

    console.log('[SignalingDO] New WebSocket connection. Total:', this.sessions.size);

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data as string);

        switch (message.type) {
          case 'subscribe':
            // Subscribe to topics
            if (message.topics) {
              message.topics.forEach((topic: string) => {
                if (!this.topics.has(topic)) {
                  this.topics.set(topic, new Set());
                }
                this.topics.get(topic)!.add(ws);
                subscribedTopics.add(topic);

                console.log(`[SignalingDO] Client subscribed to topic: ${topic}. Subscribers:`, this.topics.get(topic)!.size);
              });
            }
            break;

          case 'unsubscribe':
            // Unsubscribe from topics
            if (message.topics) {
              message.topics.forEach((topic: string) => {
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
            break;

          case 'publish':
            // Broadcast to all subscribers of the topic
            if (message.topic) {
              const subscribers = this.topics.get(message.topic);
              if (subscribers) {
                const publishMessage = JSON.stringify({
                  type: 'publish',
                  topic: message.topic,
                  data: message.data,
                  clients: subscribers.size,
                });

                console.log(`[SignalingDO] Broadcasting to ${subscribers.size} subscribers on topic: ${message.topic}`);

                // Send to all subscribers
                subscribers.forEach((subscriber) => {
                  try {
                    if (subscriber.readyState === WebSocket.READY_STATE_OPEN) {
                      subscriber.send(publishMessage);
                    }
                  } catch (error) {
                    console.error('[SignalingDO] Error sending to subscriber:', error);
                  }
                });
              } else {
                console.log(`[SignalingDO] No subscribers for topic: ${message.topic}`);
              }
            }
            break;

          case 'ping':
            // Respond to ping with pong
            try {
              ws.send(JSON.stringify({ type: 'pong' }));
            } catch (error) {
              console.error('[SignalingDO] Error sending pong:', error);
            }
            break;

          default:
            console.warn('[SignalingDO] Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('[SignalingDO] Error handling WebSocket message:', error);
      }
    });

    ws.addEventListener('close', (event: CloseEvent) => {
      console.log(`[SignalingDO] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);

      // Clean up subscriptions
      subscribedTopics.forEach((topic) => {
        const subs = this.topics.get(topic);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) {
            this.topics.delete(topic);
          }
          console.log(`[SignalingDO] Cleaned up subscription for topic: ${topic}`);
        }
      });

      // Remove from sessions
      this.sessions.delete(ws);

      console.log('[SignalingDO] Total connections remaining:', this.sessions.size);
    });

    ws.addEventListener('error', (event: Event) => {
      console.error('[SignalingDO] WebSocket error:', event);
      try {
        ws.close();
      } catch (e) {
        // Already closed
      }
    });
  }
}
