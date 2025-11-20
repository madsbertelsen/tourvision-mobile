/**
 * Browser Agent
 *
 * This script runs in a Playwright headless browser and performs:
 * - Y.js document synchronization
 * - Period-triggered LLM location detection
 * - Geo-mark creation in ProseMirror
 * - WebRTC peer connection setup
 */

import * as Y from 'yjs';
import YProvider from 'y-partyserver/provider';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import { customSchema } from './prosemirror-schema.js';
import { generateObject } from 'ai';
import { Node as ProseMirrorNode, DOMSerializer } from 'prosemirror-model';
import { z } from 'zod';
import type {
  BrowserToManagerMessage,
  ManagerToBrowserMessage,
  BrowserEnvironment
} from './shared/browser-ipc-types.js';

// Type definitions
interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

interface GeocodePendingTask {
  resolve: (value: GeocodeResult) => void;
  reject: (reason?: Error) => void;
}

// Get environment variables (injected by launcher)
const DOCUMENT_ID = window.ENV.DOCUMENT_ID;
const AGENT_ID = window.ENV.AGENT_ID;
const WS_PROTOCOL = window.ENV.WS_PROTOCOL || 'ws';
const WS_HOST = window.ENV.WS_HOST || 'localhost';
const WS_PORT = window.ENV.WS_PORT;
const AI_GATEWAY_API_KEY = window.ENV.AI_GATEWAY_API_KEY;
const PARTY_NAME = 'document';

console.log(`[Browser Agent] Starting for document: ${DOCUMENT_ID}`);
console.log(`[Browser Agent] Agent ID: ${AGENT_ID}`);

// Build WebSocket URL
const WS_URL = (WS_PORT && WS_PORT.trim() !== '')
  ? `${WS_PROTOCOL}://${WS_HOST}:${WS_PORT}`
  : `${WS_PROTOCOL}://${WS_HOST}`;

console.log(`[Browser Agent] Connecting to: ${WS_URL}/parties/${PARTY_NAME}/${DOCUMENT_ID}`);

// Create Y.Doc
const ydoc = new Y.Doc();
const yXmlFragment = ydoc.getXmlFragment('prosemirror');

// Track geo-marks for color assignment
let geoMarkColorIndex = 0;

// Pending geocode tasks
const pendingGeocodeTasks = new Map<string, GeocodePendingTask>();

// Create YProvider
const provider = new YProvider(
  WS_URL,
  DOCUMENT_ID,
  ydoc,
  {
    party: PARTY_NAME,
    connect: true
  }
);

// Set agent awareness
provider.awareness.setLocalStateField('user', {
  name: 'AI Agent',
  color: '#FF6B6B'
});

// Create ProseMirror EditorView (using real DOM in browser)
const editorView = new EditorView(document.body, {
  state: EditorState.create({
    schema: customSchema,
    plugins: [
      ySyncPlugin(yXmlFragment)
    ]
  })
});

console.log('[Browser Agent] Initialized with Y.js and ProseMirror EditorView');

// ==================== WebRTC Setup ====================

let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;

async function initializeWebRTC() {
  console.log('[Browser Agent] 🔗 Initializing WebRTC...');

  const config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  peerConnection = new RTCPeerConnection(config);

  // Create data channel for bidirectional communication
  dataChannel = peerConnection.createDataChannel('agent-channel', {
    ordered: true
  });

  dataChannel.onopen = () => {
    console.log('[Browser Agent] ✅ Data channel opened');
  };

  dataChannel.onclose = () => {
    console.log('[Browser Agent] ⚠️  Data channel closed');
  };

  dataChannel.onmessage = (event) => {
    console.log('[Browser Agent] 📨 Received via data channel:', event.data);
    handleDataChannelMessage(event.data);
  };

  dataChannel.onerror = (error) => {
    console.error('[Browser Agent] ❌ Data channel error:', error);
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[Browser Agent] 🧊 New ICE candidate');
      window.sendToManager({
        type: 'webrtc_ice_candidate',
        candidate: event.candidate.toJSON()
      });
    } else {
      console.log('[Browser Agent] 🧊 All ICE candidates sent');
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('[Browser Agent] 🔌 Connection state:', peerConnection?.connectionState);
  };

  // Generate offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  console.log('[Browser Agent] 📡 Generated WebRTC offer');

  // Send offer to manager
  window.sendToManager({
    type: 'webrtc_offer',
    offer: peerConnection.localDescription!
  });
}

function handleDataChannelMessage(data: string) {
  try {
    const message = JSON.parse(data);
    console.log('[Browser Agent] Parsed data channel message:', message.type);

    // Handle incoming messages from client via WebRTC
    // (e.g., geocode results, user commands)
  } catch (error) {
    console.error('[Browser Agent] Failed to parse data channel message:', error);
  }
}

// ==================== Geocoding ====================

// Custom message handling (for geocoding delegation)
provider.on('custom-message', (message: string) => {
  try {
    const data = JSON.parse(message);
    console.log('[Browser Agent] Received custom message:', data.type);

    if (data.type === 'geocode_result') {
      const pending = pendingGeocodeTasks.get(data.taskId);
      if (pending && data.result) {
        console.log(`[Browser Agent] ✅ Received geocode result for task ${data.taskId}`);
        pending.resolve(data.result);
        pendingGeocodeTasks.delete(data.taskId);
      }
    }
  } catch (error) {
    console.error('[Browser Agent] Error handling custom message:', error);
  }
});

async function geocodeLocation(locationName: string): Promise<GeocodeResult> {
  console.log(`[Browser Agent] 🔧 Geocoding "${locationName}"`);

  const states = provider.awareness.getStates();
  const myClientId = ydoc.clientID;

  let targetClientId: number | null = null;
  for (const [clientId] of states) {
    if (clientId === myClientId) continue;
    targetClientId = clientId;
    break;
  }

  if (!targetClientId) {
    throw new Error('No client available for geocoding');
  }

  const taskId = `geocode-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

  provider.sendMessage(JSON.stringify({
    type: 'geocode_task',
    taskId,
    locationName,
    targetClientId
  }));

  return new Promise((resolve, reject) => {
    pendingGeocodeTasks.set(taskId, { resolve, reject });

    const timeoutId = setTimeout(() => {
      if (pendingGeocodeTasks.has(taskId)) {
        pendingGeocodeTasks.delete(taskId);
        reject(new Error(`Geocoding timeout: ${locationName}`));
      }
    }, 10000);

    const orig = pendingGeocodeTasks.get(taskId)!.resolve;
    pendingGeocodeTasks.get(taskId)!.resolve = (result) => {
      clearTimeout(timeoutId);
      orig(result);
    };
  });
}

// ==================== Geo-mark Creation ====================

function createGeoMark(locationText: string, geocodeResult: GeocodeResult, colorIndex: number) {
  console.log(`[Browser Agent] 🔧 Creating geo-mark for "${locationText}" with color index ${colorIndex}`);

  const doc = editorView.state.doc;

  let startPos: number | null = null;
  let endPos: number | null = null;

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const index = node.text.toLowerCase().indexOf(locationText.toLowerCase());
      if (index !== -1) {
        startPos = pos + index;
        endPos = startPos + locationText.length;
        return false;
      }
    }
  });

  if (startPos === null || endPos === null) {
    console.error(`[Browser Agent] ❌ Could not find "${locationText}" in document`);
    return;
  }

  const geoId = `geo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const markType = customSchema.marks.geoMark;
  const mark = markType.create({
    geoId,
    displayText: locationText,
    placeName: geocodeResult.displayName,
    lat: geocodeResult.lat.toString(),
    lng: geocodeResult.lng.toString(),
    colorIndex,
    coordSource: 'nominatim'
  });

  const tr = editorView.state.tr.addMark(startPos, endPos, mark);
  editorView.dispatch(tr);

  console.log(`[Browser Agent] ✅ Created geo-mark at ${startPos}-${endPos}`);

  window.sendToManager({
    type: 'location_marked',
    documentId: DOCUMENT_ID,
    agentId: AGENT_ID
  });
}

function ensureMapExists() {
  const doc = editorView.state.doc;

  let mapExists = false;
  doc.descendants((node) => {
    if (node.type.name === 'map') {
      mapExists = true;
      return false;
    }
  });

  if (mapExists) {
    console.log('[Browser Agent] ⏭️  Map already exists');
    return;
  }

  const mapNode = customSchema.nodes.map.create({ height: 400 });
  const insertPos = doc.content.size - 1;
  const tr = editorView.state.tr.insert(insertPos, mapNode);
  editorView.dispatch(tr);

  console.log('[Browser Agent] 🗺️  Inserted map block');
}

// ==================== LLM Processing ====================

async function callRealLLM() {
  console.log('[Browser Agent] 🤖 Calling LLM via AI Gateway...');

  window.sendToManager({
    type: 'llm_call',
    documentId: DOCUMENT_ID,
    agentId: AGENT_ID
  });

  const doc = editorView.state.doc;
  const serializer = DOMSerializer.fromSchema(customSchema);
  const fragment = serializer.serializeFragment(doc.content);

  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);
  const htmlContent = tempDiv.innerHTML;

  console.log(`[Browser Agent] Document HTML length: ${htmlContent.length}`);

  // Call LLM (using Vercel AI SDK - works in browser)
  const result = await generateObject({
    model: 'mistral/mistral-small',
    schema: z.object({
      locations: z.array(z.object({
        name: z.string().describe('The exact text from the document'),
        fullName: z.string().describe('Full location name for geocoding')
      }))
    }),
    prompt: `Find all geographic locations in this HTML:\n\n${htmlContent}\n\nOnly extract locations NOT inside <span data-geo-id> tags.`
  });

  console.log(`[Browser Agent] 📍 Found ${result.object.locations.length} locations`);

  const alreadyMarked = new Set<string>();
  doc.descendants((node) => {
    if (node.isText && node.marks.length > 0) {
      for (const mark of node.marks) {
        if (mark.type.name === 'geoMark') {
          alreadyMarked.add(node.text!.toLowerCase());
        }
      }
    }
  });

  const locationColorMap: Record<string, number> = {};

  for (const location of result.object.locations) {
    if (alreadyMarked.has(location.name.toLowerCase())) {
      console.log(`[Browser Agent] ⏭️  Skipping "${location.name}" (already marked)`);
      continue;
    }

    try {
      const normalizedName = location.name.toLowerCase().trim();

      let colorIndex: number;
      if (locationColorMap[normalizedName] !== undefined) {
        colorIndex = locationColorMap[normalizedName];
      } else {
        colorIndex = geoMarkColorIndex++;
        locationColorMap[normalizedName] = colorIndex;
      }

      const geocodeResult = await geocodeLocation(location.fullName);
      createGeoMark(location.name, geocodeResult, colorIndex);

      if (Object.keys(locationColorMap).length === 1) {
        ensureMapExists();
      }
    } catch (error) {
      console.error(`[Browser Agent] ❌ Failed to process "${location.name}":`, error);
    }
  }

  console.log('[Browser Agent] ✅ All locations processed');
}

async function processDocumentWithLLM() {
  try {
    console.log('[Browser Agent] 🔎 Analyzing document with LLM...');

    const doc = editorView.state.doc;
    if (doc.content.size === 0) {
      console.log('[Browser Agent] ❌ Document is empty');
      return;
    }

    await callRealLLM();
    console.log('[Browser Agent] ✅ All tool calls executed');
  } catch (error) {
    console.error('[Browser Agent] ❌ Error processing with LLM:', error);
  }
}

// ==================== Period Detection ====================

let isInitialSync = true;
let cursorMoveDebounceTimer: number | null = null;

yXmlFragment.observeDeep((events) => {
  if (isInitialSync) {
    console.log('[Browser Agent] Initial sync completed');
    isInitialSync = false;
    return;
  }

  console.log('[Browser Agent] Document changed');

  let periodDetected = false;
  let questionMarkDetected = false;

  events.forEach((event: any) => {
    if (event.changes && event.changes.delta) {
      event.changes.delta.forEach((change: any) => {
        if (change.insert && typeof change.insert === 'string') {
          if (change.insert.includes('.')) {
            periodDetected = true;
          }
          if (change.insert.includes('?')) {
            questionMarkDetected = true;
          }
        }
      });
    }
  });

  if (periodDetected) {
    console.log('[Browser Agent] 🔴 Period detected! Triggering LLM processing...');

    if (cursorMoveDebounceTimer) {
      clearTimeout(cursorMoveDebounceTimer);
    }

    cursorMoveDebounceTimer = window.setTimeout(() => {
      processDocumentWithLLM();
    }, 1000);
  }

  if (questionMarkDetected) {
    console.log('[Browser Agent] ❓ Question mark detected!');
  }
});

// ==================== Manager Message Handling ====================

// Handle messages from manager
window.handleManagerMessage = async (msg: ManagerToBrowserMessage) => {
  console.log('[Browser Agent] Received from manager:', msg.type);

  switch (msg.type) {
    case 'shutdown':
      console.log('[Browser Agent] Graceful shutdown requested');
      cleanup();
      break;

    case 'ping':
      window.sendToManager({ type: 'pong' });
      break;

    case 'punctuation_trigger':
      console.log(`[Browser Agent] 🔴 Punctuation trigger: "${msg.character}"`);
      await processDocumentWithLLM();
      break;

    case 'webrtc_answer':
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
        console.log('[Browser Agent] ✅ Set remote description (answer)');
      }
      break;

    case 'webrtc_ice_candidate':
      if (peerConnection && msg.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
        console.log('[Browser Agent] ✅ Added ICE candidate');
      }
      break;
  }
};

// Cleanup function
function cleanup() {
  console.log('[Browser Agent] Cleaning up...');
  if (cursorMoveDebounceTimer) {
    clearTimeout(cursorMoveDebounceTimer);
  }
  if (dataChannel) {
    dataChannel.close();
  }
  if (peerConnection) {
    peerConnection.close();
  }
  editorView.destroy();
  provider.destroy();
  ydoc.destroy();
}

// ==================== Initialization ====================

// Provider event listeners
provider.on('sync', (isSynced: boolean) => {
  console.log('[Browser Agent] Synced:', isSynced);

  if (isSynced) {
    console.log('[Browser Agent] 💡 Period-triggered LLM processing enabled');

    window.sendToManager({
      type: 'connected',
      documentId: DOCUMENT_ID,
      agentId: AGENT_ID
    });

    // Initialize WebRTC after sync
    initializeWebRTC().catch((error) => {
      console.error('[Browser Agent] Failed to initialize WebRTC:', error);
      window.sendToManager({
        type: 'error',
        documentId: DOCUMENT_ID,
        agentId: AGENT_ID,
        error: `WebRTC initialization failed: ${error.message}`
      });
    });
  }
});

provider.on('status', ({ status }: { status: string }) => {
  console.log('[Browser Agent] Status:', status);
});

// Report metrics periodically
setInterval(() => {
  // Browser doesn't have process.memoryUsage() or process.cpuUsage()
  // Use performance API instead
  const memory = (performance as any).memory;

  if (memory) {
    window.sendToManager({
      type: 'metrics',
      documentId: DOCUMENT_ID,
      agentId: AGENT_ID,
      memory_mb: Math.round(memory.usedJSHeapSize / 1024 / 1024),
      cpu_percent: 0 // CPU tracking not available in browser
    });
  }
}, 30000); // Every 30 seconds

console.log('[Browser Agent] ✅ Initialization complete');
