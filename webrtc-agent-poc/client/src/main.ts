/**
 * WebRTC Agent POC - Main Entry Point
 *
 * This application supports two modes:
 * - User mode: Main document editor (auto-opens agent tab)
 * - Agent mode: Background tab that executes commands
 */

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser } from 'prosemirror-model';
import { customSchema } from './prosemirror-schema';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';

// Y.js imports
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo as yUndo, redo as yRedo } from 'y-prosemirror';

// Get URL parameters
const params = new URL(window.location.href).searchParams;
const documentId = params.get('doc') || 'default-doc';
const isAgent = params.get('agent') === 'true';

console.log('[Main] Starting application', { documentId, isAgent });

// Update UI
const modeIndicator = document.getElementById('mode-indicator');
const docInfo = document.getElementById('doc-info');
const statusEl = document.getElementById('status');

if (modeIndicator) {
  const badge = document.createElement('span');
  badge.className = `mode-badge ${isAgent ? 'agent' : 'user'}`;
  badge.textContent = isAgent ? 'Agent Mode' : 'User Mode';
  modeIndicator.appendChild(badge);
}

if (docInfo) {
  docInfo.textContent = `Document: ${documentId}`;
}

function updateStatus(message: string, type: 'connected' | 'connecting' | 'disconnected') {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }
}

// Initialize Y.js document and WebRTC provider
function setupYjs(documentId: string) {
  console.log('[Y.js] Setting up Y.js document:', documentId);

  // Create Y.js document
  const ydoc = new Y.Doc();

  // Get the shared ProseMirror type
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  // Create WebRTC provider
  // Use our Cloudflare DO WebSocket signaling server + BroadcastChannel
  const provider = new WebrtcProvider(documentId, ydoc, {
    // WebSocket signaling server for cross-machine sync
    // BroadcastChannel will also handle local tab communication
    signaling: ['ws://localhost:8788/signaling/' + documentId],
    // Enable password for room isolation (optional)
    password: null,
  });

  // Get awareness instance from provider (automatically created)
  const awareness = provider.awareness;

  // Set local user info with meaningful name
  awareness.setLocalStateField('user', {
    name: isAgent ? 'Agent' : 'User',
    color: isAgent ? '#10b981' : '#3b82f6', // green for agent, blue for user
  });

  // Log provider events
  provider.on('status', (event: any) => {
    console.log('[WebRTC] Status:', event.status);
    updateStatus(`WebRTC: ${event.status}`, event.status === 'connected' ? 'connected' : 'connecting');
  });

  provider.on('synced', (synced: boolean) => {
    console.log('[WebRTC] Synced:', synced);
    if (synced) {
      updateStatus('Editor ready - Synced', 'connected');
    }
  });

  provider.on('peers', (event: any) => {
    console.log('[WebRTC] Connected peers:', {
      webrtcPeers: event.webrtcPeers?.length || 0,
      bcPeers: event.bcPeers?.length || 0
    });

    const totalPeers = (event.webrtcPeers?.length || 0) + (event.bcPeers?.length || 0);
    if (totalPeers > 0) {
      updateStatus(`Connected to ${totalPeers} peer(s)`, 'connected');
    }
  });

  console.log('[Y.js] Y.js document and WebRTC provider created');

  return { ydoc, yXmlFragment, provider, awareness };
}

// Custom cursor builder for minimal, non-intrusive presence indicators
function customCursorBuilder(user: any): HTMLElement {
  const cursor = document.createElement('span');
  cursor.classList.add('ProseMirror-yjs-cursor');
  cursor.style.position = 'relative';
  cursor.style.marginLeft = '-1px';
  cursor.style.marginRight = '-1px';
  cursor.style.borderLeft = `2px solid ${user.color}`;
  cursor.style.borderRight = `2px solid ${user.color}`;
  cursor.style.height = '1.2em';
  cursor.style.display = 'inline-block';
  cursor.style.pointerEvents = 'none';

  // Create label that appears above the cursor
  const label = document.createElement('div');
  label.style.position = 'absolute';
  label.style.top = '-1.8em';
  label.style.left = '0';
  label.style.fontSize = '10px';
  label.style.fontWeight = '600';
  label.style.backgroundColor = user.color;
  label.style.color = 'white';
  label.style.padding = '2px 6px';
  label.style.borderRadius = '3px';
  label.style.whiteSpace = 'nowrap';
  label.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  label.style.pointerEvents = 'none';
  label.textContent = user.name || 'Anonymous';

  cursor.appendChild(label);
  return cursor;
}

// Initialize ProseMirror editor with Y.js sync
function createEditor(yXmlFragment: Y.XmlFragment, awareness: any) {
  const container = document.getElementById('editor-container');
  if (!container) {
    console.error('[Main] Editor container not found');
    return null;
  }

  const state = EditorState.create({
    schema: customSchema,
    plugins: [
      // Y.js sync plugins
      ySyncPlugin(yXmlFragment),
      yCursorPlugin(awareness, { cursorBuilder: customCursorBuilder }),
      yUndoPlugin(),

      // ProseMirror plugins
      keymap({ 'Mod-z': yUndo, 'Mod-y': yRedo }),
      keymap(baseKeymap),
    ],
  });

  const view = new EditorView(container, {
    state,
    attributes: {
      class: 'ProseMirror',
    },
  });

  console.log('[Main] ProseMirror editor initialized with Y.js sync');
  return view;
}

// Auto-open agent tab (user mode only)
function openAgentTab(awareness: any) {
  if (isAgent) {
    console.log('[Main] Already in agent mode, skipping agent tab creation');
    return;
  }

  // Track if we've already opened an agent tab in this session
  let agentWindow: Window | null = null;
  let hasCheckedForAgent = false;

  // Check if an agent is already connected
  const checkForExistingAgent = () => {
    const states = awareness.getStates();
    let agentCount = 0;
    let otherClients = 0;

    console.log('[Main] Checking awareness states:', states.size);
    states.forEach((state: any, clientId: number) => {
      // Skip our own client
      if (clientId === awareness.clientID) {
        console.log(`[Main] Skipping own client ${clientId}`);
        return;
      }

      otherClients++;
      console.log(`[Main] Client ${clientId}: user=${JSON.stringify(state.user)}`);

      // Check if this client is an agent
      if (state.user?.name === 'Agent') {
        agentCount++;
      }
    });

    console.log(`[Main] Found ${otherClients} other clients, ${agentCount} agents`);
    return agentCount > 0;
  };

  // Try to open agent tab after initial sync
  const tryOpenAgent = () => {
    if (hasCheckedForAgent) {
      return;
    }
    hasCheckedForAgent = true;

    // Check if there's already an agent connected
    if (checkForExistingAgent()) {
      console.log('[Main] Agent already connected to document, skipping agent tab creation');
      return;
    }

    const agentUrl = `${window.location.origin}${window.location.pathname}?doc=${documentId}&agent=true`;
    console.log('[Main] No agent found, opening agent tab:', agentUrl);

    // Using named window target - if window with this name exists, it will be reused
    agentWindow = window.open(agentUrl, `agent-${documentId}`, 'width=800,height=600');

    if (!agentWindow) {
      console.error('[Main] Failed to open agent tab - popup blocked?');
      updateStatus('Failed to open agent tab (popup blocked)', 'disconnected');
    } else {
      console.log('[Main] Agent tab opened/focused successfully');
    }
  };

  // Wait for initial sync before checking for agents
  setTimeout(tryOpenAgent, 1500);

  // Close agent tab when user tab closes
  window.addEventListener('beforeunload', () => {
    if (agentWindow && !agentWindow.closed) {
      console.log('[Main] Closing agent tab');
      agentWindow.close();
    }
  });
}

// Main initialization
async function main() {
  updateStatus('Initializing Y.js...', 'connecting');

  // Set up Y.js and WebRTC provider
  const { ydoc, yXmlFragment, provider, awareness } = setupYjs(documentId);

  updateStatus('Initializing editor...', 'connecting');

  // Create editor with Y.js sync
  const editor = createEditor(yXmlFragment, awareness);
  if (!editor) {
    updateStatus('Failed to initialize editor', 'disconnected');
    return;
  }

  // Open agent tab (user mode only)
  if (!isAgent) {
    openAgentTab(awareness);
  }

  // Set up toolbar button handlers
  setupToolbarButtons(editor);

  updateStatus('Connecting to peers...', 'connecting');
  console.log('[Main] Application initialized successfully');
}

// Function to create a geo mark on selected text
function createGeoMark(view: EditorView) {
  const { state } = view;
  const { from, to } = state.selection;

  if (from === to) {
    alert('Please select some text to create a geo mark');
    return;
  }

  // Get the selected text
  const selectedText = state.doc.textBetween(from, to);

  // Prompt for location details
  const placeName = prompt('Enter place name:', selectedText) || selectedText;
  const lat = prompt('Enter latitude (e.g., 55.6761):') || '';
  const lng = prompt('Enter longitude (e.g., 12.5683):') || '';

  if (!lat || !lng) {
    alert('Latitude and longitude are required');
    return;
  }

  // Generate a unique ID
  const geoId = `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create the geo mark
  const geoMarkType = customSchema.marks.geoMark;
  const mark = geoMarkType.create({
    geoId,
    displayText: selectedText,
    placeName,
    lat,
    lng,
    colorIndex: Math.floor(Math.random() * 10),
    coordSource: 'manual'
  });

  // Apply the mark to the selection
  const tr = state.tr.addMark(from, to, mark);
  view.dispatch(tr);

  console.log('[Main] Created geo mark:', { geoId, placeName, lat, lng });
}

// Function to insert a map block
function insertMap(view: EditorView) {
  const { state } = view;
  const { $from } = state.selection;

  // Create the map node
  const mapNode = customSchema.nodes.map.create({ height: 400 });

  // Insert at the current position
  const tr = state.tr.insert($from.pos, mapNode);
  view.dispatch(tr);

  console.log('[Main] Inserted map block');
}

// Set up toolbar button event listeners
function setupToolbarButtons(view: EditorView) {
  const createGeoMarkBtn = document.getElementById('create-geomark-btn');
  const insertMapBtn = document.getElementById('insert-map-btn');

  if (createGeoMarkBtn) {
    createGeoMarkBtn.addEventListener('click', () => createGeoMark(view));
  }

  if (insertMapBtn) {
    insertMapBtn.addEventListener('click', () => insertMap(view));
  }

  console.log('[Main] Toolbar buttons set up');
}

// Start the application
main().catch((error) => {
  console.error('[Main] Initialization error:', error);
  updateStatus(`Error: ${error.message}`, 'disconnected');
});
