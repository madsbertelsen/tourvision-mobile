/**
 * Minimal Supabase Realtime client for WebView
 * Uses WebSocket directly without the full Supabase SDK
 */

export class MinimalRealtimeClient {
  constructor(supabaseUrl, supabaseKey) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.ws = null;
    this.channels = new Map();
    this.messageHandlers = new Map();
    this.connected = false;
    this.accessToken = supabaseKey; // Using anon key as access token
  }

  connect() {
    return new Promise((resolve, reject) => {
      // Extract host from URL (e.g., http://127.0.0.1:54321 -> 127.0.0.1:54321)
      const url = new URL(this.supabaseUrl);
      const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${url.host}/realtime/v1/websocket?apikey=${this.supabaseKey}&vsn=1.0.0`;

      console.log('[MinimalRealtimeClient] Connecting to:', wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[MinimalRealtimeClient] WebSocket connected');
        this.connected = true;
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('[MinimalRealtimeClient] WebSocket error:', error);
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[MinimalRealtimeClient] Error parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('[MinimalRealtimeClient] WebSocket closed');
        this.connected = false;
      };
    });
  }

  handleMessage(message) {
    const [joinRef, ref, topic, event, payload] = message;

    // Find channel by topic
    for (const [channelName, channelInfo] of this.channels.entries()) {
      if (channelInfo.topic === topic) {
        const handlers = this.messageHandlers.get(channelName) || [];

        // Call all handlers for this channel
        handlers.forEach(handler => {
          if (handler.event === event || handler.event === '*') {
            handler.callback(payload);
          }
        });
      }
    }
  }

  channel(channelName, options = {}) {
    const topic = `realtime:${channelName}`;

    const channelObj = {
      topic,
      on: (type, filter, callback) => {
        const handlers = this.messageHandlers.get(channelName) || [];

        if (type === 'broadcast') {
          handlers.push({
            event: filter.event,
            callback: (payload) => {
              callback(payload);
            }
          });
        }

        this.messageHandlers.set(channelName, handlers);
        return channelObj;
      },
      subscribe: (statusCallback) => {
        // Send join message
        const joinRef = this.generateRef();
        const ref = this.generateRef();

        this.channels.set(channelName, {
          topic,
          joinRef,
          ref
        });

        const joinMessage = [
          joinRef,
          ref,
          topic,
          'phx_join',
          {
            config: {
              broadcast: { self: false, ack: false },
              presence: { key: '' }
            }
          }
        ];

        this.ws.send(JSON.stringify(joinMessage));

        // Listen for join reply
        const originalOnMessage = this.ws.onmessage;
        this.ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          const [msgJoinRef, msgRef, msgTopic, msgEvent, msgPayload] = message;

          if (msgTopic === topic && msgEvent === 'phx_reply' && msgPayload.status === 'ok') {
            console.log('[MinimalRealtimeClient] Channel subscribed:', channelName);
            statusCallback('SUBSCRIBED');
          }

          // Call original handler
          if (originalOnMessage) {
            originalOnMessage.call(this.ws, event);
          }
        };

        return channelObj;
      },
      send: ({ type, event, payload }) => {
        if (type === 'broadcast') {
          const channelInfo = this.channels.get(channelName);
          if (!channelInfo) {
            console.error('[MinimalRealtimeClient] Channel not subscribed:', channelName);
            return;
          }

          const ref = this.generateRef();
          const broadcastMessage = [
            null, // joinRef
            ref,
            channelInfo.topic,
            'broadcast',
            {
              type: 'broadcast',
              event,
              payload
            }
          ];

          this.ws.send(JSON.stringify(broadcastMessage));
        }
      }
    };

    return channelObj;
  }

  removeChannel(channelObj) {
    // Find and remove channel
    for (const [channelName, channelInfo] of this.channels.entries()) {
      if (channelInfo.topic === channelObj.topic) {
        // Send leave message
        const ref = this.generateRef();
        const leaveMessage = [
          channelInfo.joinRef,
          ref,
          channelInfo.topic,
          'phx_leave',
          {}
        ];

        this.ws.send(JSON.stringify(leaveMessage));

        this.channels.delete(channelName);
        this.messageHandlers.delete(channelName);

        console.log('[MinimalRealtimeClient] Channel removed:', channelName);
        break;
      }
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.channels.clear();
    this.messageHandlers.clear();
    this.connected = false;
  }

  generateRef() {
    return Math.random().toString(36).substring(2, 15);
  }
}
