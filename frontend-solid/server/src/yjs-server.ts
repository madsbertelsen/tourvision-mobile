import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as map from 'lib0/map';
import { WebSocket } from 'ws';
import { LeveldbPersistence } from 'y-leveldb';

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;

interface WSConnection {
  ws: WebSocket;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
}

const docs = new Map<string, { doc: Y.Doc; awareness: awarenessProtocol.Awareness; conns: Set<WSConnection> }>();
let persistence: LeveldbPersistence | null = null;

// Initialize persistence
export function initPersistence(storagePath: string) {
  persistence = new LeveldbPersistence(storagePath);
  console.log('[YJS Server] Persistence initialized at:', storagePath);
}

// Get or create document
async function getYDoc(docId: string): Promise<{ doc: Y.Doc; awareness: awarenessProtocol.Awareness; conns: Set<WSConnection> }> {
  const existing = docs.get(docId);
  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  const conns = new Set<WSConnection>();

  // Load document from persistence
  if (persistence) {
    try {
      const persistedDoc = await persistence.getYDoc(docId);
      const persistedState = Y.encodeStateAsUpdate(persistedDoc);
      Y.applyUpdate(doc, persistedState);
      console.log(`[YJS Server] Loaded document ${docId} from persistence`);
    } catch (err) {
      console.log(`[YJS Server] No existing data for ${docId}, starting fresh`);
    }
  }

  // Auto-save on document update
  doc.on('update', (update: Uint8Array) => {
    if (persistence) {
      persistence.storeUpdate(docId, update).catch((err) => {
        console.error(`[YJS Server] Failed to save update for ${docId}:`, err);
      });
    }
  });

  const docData = { doc, awareness, conns };
  docs.set(docId, docData);
  return docData;
}

// Send message to WebSocket
function send(conn: WSConnection, message: Uint8Array) {
  if (conn.ws.readyState !== wsReadyStateConnecting && conn.ws.readyState !== wsReadyStateOpen) {
    conn.doc.emit('close', [conn]);
  }
  try {
    conn.ws.send(message, (err) => {
      if (err) {
        conn.doc.emit('close', [conn]);
      }
    });
  } catch (e) {
    conn.doc.emit('close', [conn]);
  }
}

// Message types (y-protocols uses 0=sync, 1=awareness, 2=auth, 3=queryAwareness)
const messageSync = 0;
const messageAwareness = 1;
const messageCustom = 100; // Use high number to avoid y-protocols conflicts

// Orchestrator connections (for receiving spawn_agent messages)
const orchestratorConns = new Set<WebSocket>();

// Register orchestrator connection
export function registerOrchestrator(ws: WebSocket) {
  orchestratorConns.add(ws);
  console.log('[YJS Server] Orchestrator registered, total:', orchestratorConns.size);

  ws.on('close', () => {
    orchestratorConns.delete(ws);
    console.log('[YJS Server] Orchestrator disconnected, total:', orchestratorConns.size);
  });
}

// Broadcast custom message to orchestrators
function broadcastToOrchestrators(message: any) {
  const messageStr = JSON.stringify(message);
  orchestratorConns.forEach((ws) => {
    if (ws.readyState === wsReadyStateOpen) {
      ws.send(messageStr);
    }
  });
  console.log('[YJS Server] Broadcast to', orchestratorConns.size, 'orchestrators:', message.type);
}

// Handle incoming WebSocket message
function messageListener(conn: WSConnection, message: Uint8Array) {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    console.log('[YJS Server] Received message type:', messageType);

    switch (messageType) {
      case messageSync:
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, conn.doc, conn);

        // If the encoded message has content, send it
        if (encoding.length(encoder) > 1) {
          send(conn, encoding.toUint8Array(encoder));
        }
        break;

      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          conn.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
        break;

      case messageCustom:
        // Read custom message as JSON string
        const customData = decoding.readVarString(decoder);
        try {
          const customMessage = JSON.parse(customData);
          console.log('[YJS Server] Custom message received:', customMessage.type);

          // Forward spawn_agent messages to orchestrators
          if (customMessage.type === 'spawn_agent') {
            broadcastToOrchestrators(customMessage);
          }
        } catch (e) {
          console.error('[YJS Server] Failed to parse custom message:', e);
        }
        break;

      default:
        console.warn('[YJS Server] Unknown message type:', messageType);
    }
  } catch (err) {
    console.error('[YJS Server] Error processing message:', err);
  }
}

// Handle WebSocket close
function closeConn(docId: string, conn: WSConnection) {
  const docData = docs.get(docId);
  if (docData) {
    docData.conns.delete(conn);

    // Remove from awareness
    awarenessProtocol.removeAwarenessStates(
      docData.awareness,
      [conn.doc.clientID],
      'disconnect'
    );

    // Clean up if no connections remain
    if (docData.conns.size === 0) {
      console.log(`[YJS Server] No connections for ${docId}, cleaning up`);
      docData.awareness.destroy();
      docData.doc.destroy();
      docs.delete(docId);
    }
  }
}

// Setup connection
export async function setupWSConnection(ws: WebSocket, docId: string) {
  console.log(`[YJS Server] New connection for document: ${docId}`);

  // Buffer messages received before setup completes
  const messageBuffer: Buffer[] = [];
  let conn: WSConnection | null = null;

  // Register message handler IMMEDIATELY to capture early messages
  ws.on('message', (message: Buffer) => {
    if (conn) {
      messageListener(conn, new Uint8Array(message));
    } else {
      messageBuffer.push(message);
    }
  });

  const { doc, awareness, conns } = await getYDoc(docId);
  conn = { ws, doc, awareness };

  conns.add(conn);

  // Handle close
  ws.on('close', () => {
    console.log(`[YJS Server] Connection closed for document: ${docId}`);
    closeConn(docId, conn);
  });

  // Handle error
  ws.on('error', (error) => {
    console.error(`[YJS Server] WebSocket error for ${docId}:`, error);
  });

  // Process buffered messages now that conn is ready
  for (const msg of messageBuffer) {
    messageListener(conn, new Uint8Array(msg));
  }

  // Send sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  send(conn, encoding.toUint8Array(encoder));

  // Send awareness states
  const awarenessStates = awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys()))
    );
    send(conn, encoding.toUint8Array(awarenessEncoder));
  }

  // Broadcast awareness updates
  awareness.on('update', ({ added, updated, removed }: any) => {
    const changedClients = added.concat(updated).concat(removed);
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    );
    const awarenessMessage = encoding.toUint8Array(awarenessEncoder);

    conns.forEach((conn) => {
      send(conn, awarenessMessage);
    });
  });

  // Broadcast document updates
  doc.on('update', (update: Uint8Array, origin: any) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    conns.forEach((c) => {
      if (c !== origin) {
        send(c, message);
      }
    });
  });
}
