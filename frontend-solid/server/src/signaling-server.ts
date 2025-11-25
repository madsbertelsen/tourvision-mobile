import { WebSocketServer, WebSocket } from 'ws';
import * as map from 'lib0/map';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import http from 'http';

// Message types for signaling protocol
const messageTypes = {
  subscribe: 0,
  unsubscribe: 1,
  publish: 2,
  ping: 3,
  pong: 4
};

// Map from topic-name to set of subscribed clients
const topics = new Map<string, Set<WSConnection>>();

interface WSConnection extends WebSocket {
  subscribedTopics: Set<string>;
  isAlive: boolean;
}

export function createSignalingServer(port: number = 4444) {
  const server = http.createServer();
  const wss = new WebSocketServer({ server });

  console.log(`[Signaling] Initializing WebRTC signaling server`);

  wss.on('connection', (ws: WSConnection) => {
    ws.subscribedTopics = new Set();
    ws.isAlive = true;

    console.log('[Signaling] Client connected');

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message: Buffer) => {
      try {
        const decoder = decoding.createDecoder(new Uint8Array(message));
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
          case messageTypes.subscribe: {
            const topic = decoding.readVarString(decoder);
            const subscribers = map.setIfUndefined(topics, topic, () => new Set());
            subscribers.add(ws);
            ws.subscribedTopics.add(topic);
            console.log(`[Signaling] Client subscribed to topic: ${topic} (${subscribers.size} subscribers)`);
            break;
          }

          case messageTypes.unsubscribe: {
            const topic = decoding.readVarString(decoder);
            const subscribers = topics.get(topic);
            if (subscribers) {
              subscribers.delete(ws);
              if (subscribers.size === 0) {
                topics.delete(topic);
              }
            }
            ws.subscribedTopics.delete(topic);
            console.log(`[Signaling] Client unsubscribed from topic: ${topic}`);
            break;
          }

          case messageTypes.publish: {
            const topic = decoding.readVarString(decoder);
            const data = decoding.readVarUint8Array(decoder);
            const subscribers = topics.get(topic);

            if (subscribers) {
              const encoder = encoding.createEncoder();
              encoding.writeVarUint(encoder, messageTypes.publish);
              encoding.writeVarString(encoder, topic);
              encoding.writeVarUint(encoder, subscribers.size); // Number of receivers
              encoding.writeVarUint8Array(encoder, data);

              const message = encoding.toUint8Array(encoder);

              // Forward to all subscribers except sender
              subscribers.forEach(subscriber => {
                if (subscriber !== ws && subscriber.readyState === WebSocket.OPEN) {
                  subscriber.send(message);
                }
              });
            }
            break;
          }

          case messageTypes.ping: {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageTypes.pong);
            ws.send(encoding.toUint8Array(encoder));
            break;
          }
        }
      } catch (err) {
        console.error('[Signaling] Error processing message:', err);
      }
    });

    ws.on('close', () => {
      // Clean up subscriptions when client disconnects
      ws.subscribedTopics.forEach(topic => {
        const subscribers = topics.get(topic);
        if (subscribers) {
          subscribers.delete(ws);
          if (subscribers.size === 0) {
            topics.delete(topic);
            console.log(`[Signaling] Topic removed (no subscribers): ${topic}`);
          }
        }
      });
      console.log('[Signaling] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[Signaling] WebSocket error:', error);
    });
  });

  // Ping clients every 30 seconds to keep connections alive
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws: WSConnection) => {
      if (!ws.isAlive) {
        console.log('[Signaling] Terminating inactive client');
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
    console.log('[Signaling] Server closed');
  });

  server.listen(port, () => {
    console.log(`[Signaling] Server listening on ws://localhost:${port}`);
  });

  return server;
}
