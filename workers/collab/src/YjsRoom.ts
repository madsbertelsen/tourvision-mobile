/**
 * YjsRoom - Durable Object for Y.js document collaboration
 *
 * This implements the Y.js sync protocol for real-time collaboration:
 * - Maintains Y.Doc state in memory
 * - Persists state to Durable Object storage
 * - Broadcasts updates to all connected WebSocket clients
 * - Handles awareness protocol for cursor/presence
 */

import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export interface Env {
  YJS_ROOM: DurableObjectNamespace;
}

export class YjsRoom implements DurableObject {
  private state: DurableObjectState;
  private ydoc: Y.Doc;
  private awareness: awarenessProtocol.Awareness;
  private connections: Set<WebSocket>;
  private saveTimeout: ReturnType<typeof setTimeout> | null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.ydoc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.ydoc);
    this.connections = new Set();
    this.saveTimeout = null;

    // Listen to Y.Doc updates to persist state
    this.ydoc.on('update', (update: Uint8Array, origin: any) => {
      // Don't persist updates that came from loading storage
      if (origin === 'storage-load') return;

      // Debounce saves (every 2 seconds)
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(() => this.persistState(), 2000);
    });

    console.log('[YjsRoom] Durable Object initialized');
  }

  async fetch(request: Request): Promise<Response> {
    // Check for WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    // Load persisted state if not already loaded
    if (this.ydoc.store.clients.size === 0) {
      await this.loadState();
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket connection
    this.state.acceptWebSocket(server);
    this.connections.add(server);

    console.log('[YjsRoom] WebSocket connection established. Total connections:', this.connections.size);

    // Send initial sync message (Step 1: send full document state)
    this.sendSyncStep1(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    try {
      // Convert message to Uint8Array
      const data = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : new Uint8Array(message);

      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MESSAGE_SYNC:
          this.handleSyncMessage(decoder, ws);
          break;
        case MESSAGE_AWARENESS:
          this.handleAwarenessMessage(decoder, ws);
          break;
        default:
          console.warn('[YjsRoom] Unknown message type:', messageType);
      }
    } catch (error) {
      console.error('[YjsRoom] Error handling WebSocket message:', error);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.connections.delete(ws);
    console.log('[YjsRoom] WebSocket closed. Remaining connections:', this.connections.size);

    // Remove client from awareness
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
      this.awareness,
      [this.awareness.clientID],
      new Map()
    );
    this.broadcastAwareness(awarenessUpdate, ws);

    // If no more connections, persist state immediately
    if (this.connections.size === 0) {
      console.log('[YjsRoom] Last connection closed, persisting state');
      await this.persistState();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error('[YjsRoom] WebSocket error:', error);
    this.connections.delete(ws);
  }

  /**
   * Send Sync Step 1: Full document state to newly connected client
   */
  private sendSyncStep1(ws: WebSocket) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.ydoc);
    const message = encoding.toUint8Array(encoder);

    try {
      ws.send(message);
      console.log('[YjsRoom] Sent Sync Step 1 to client');
    } catch (error) {
      console.error('[YjsRoom] Error sending Sync Step 1:', error);
    }
  }

  /**
   * Handle incoming sync messages from clients
   */
  private handleSyncMessage(decoder: decoding.Decoder, sender: WebSocket) {
    const syncMessageType = syncProtocol.readSyncMessage(decoder, this.ydoc, sender);

    // Broadcast sync update to other clients
    if (syncMessageType === syncProtocol.messageYjsUpdate) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, decoding.readVarUint8Array(decoder));
      const message = encoding.toUint8Array(encoder);

      this.broadcast(message, sender);
      console.log('[YjsRoom] Broadcasted sync update to', this.connections.size - 1, 'clients');
    }

    // If we received Sync Step 1, send Sync Step 2 back
    if (syncMessageType === syncProtocol.messageYjsSyncStep1) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep2(encoder, this.ydoc);
      const message = encoding.toUint8Array(encoder);

      try {
        sender.send(message);
        console.log('[YjsRoom] Sent Sync Step 2 to client');
      } catch (error) {
        console.error('[YjsRoom] Error sending Sync Step 2:', error);
      }
    }
  }

  /**
   * Handle incoming awareness messages (cursor position, user presence)
   */
  private handleAwarenessMessage(decoder: decoding.Decoder, sender: WebSocket) {
    const update = decoding.readVarUint8Array(decoder);
    awarenessProtocol.applyAwarenessUpdate(this.awareness, update, sender);

    // Broadcast awareness to all clients (including sender for initial state)
    this.broadcastAwareness(update, null);
    console.log('[YjsRoom] Broadcasted awareness update');
  }

  /**
   * Broadcast message to all connected clients except the sender
   */
  private broadcast(message: Uint8Array, exclude: WebSocket | null = null) {
    for (const ws of this.connections) {
      if (ws !== exclude && ws.readyState === WebSocket.READY_STATE_OPEN) {
        try {
          ws.send(message);
        } catch (error) {
          console.error('[YjsRoom] Error broadcasting to client:', error);
        }
      }
    }
  }

  /**
   * Broadcast awareness update to all clients
   */
  private broadcastAwareness(update: Uint8Array, exclude: WebSocket | null = null) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, update);
    const message = encoding.toUint8Array(encoder);

    this.broadcast(message, exclude);
  }

  /**
   * Load Y.Doc state from Durable Object storage
   */
  private async loadState() {
    try {
      const stored = await this.state.storage.get<number[]>('ydoc-state');
      if (stored && stored.length > 0) {
        const state = new Uint8Array(stored);
        Y.applyUpdate(this.ydoc, state, 'storage-load');
        console.log('[YjsRoom] Loaded state from storage, size:', state.length, 'bytes');
      } else {
        console.log('[YjsRoom] No stored state found, starting with empty document');
      }
    } catch (error) {
      console.error('[YjsRoom] Error loading state:', error);
    }
  }

  /**
   * Persist Y.Doc state to Durable Object storage
   */
  private async persistState() {
    try {
      const state = Y.encodeStateAsUpdate(this.ydoc);
      await this.state.storage.put('ydoc-state', Array.from(state));
      console.log('[YjsRoom] Persisted state to storage, size:', state.length, 'bytes');
    } catch (error) {
      console.error('[YjsRoom] Error persisting state:', error);
    }
  }
}
