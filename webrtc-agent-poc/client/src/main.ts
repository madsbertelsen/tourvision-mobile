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

// Mapbox GL JS
import mapboxgl from 'mapbox-gl';

// Get URL parameters
const params = new URL(window.location.href).searchParams;
const documentId = params.get('doc') || 'default-doc';
const isAgent = params.get('agent') === 'true';

console.log('[Main] Starting application', { documentId, isAgent });

// Mapbox token - use environment variable or hardcode for testing
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFkc2JlcnRlbHNlbiIsImEiOiJja2tjeDgxZWYwNHU5MnhtaTVndWRmeHpzIn0.Zs-SFtuSE9I1XAG-TG2fsw';

// Geo mark colors (matching frontend-prosemirror)
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

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

// Map Node View - renders Mapbox maps for map blocks
function createMapNodeView(node: any, editorView: EditorView) {
    const dom = document.createElement('div');
    dom.className = 'prosemirror-map';
    dom.style.cssText = `height: ${node.attrs.height}px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; position: relative; overflow: hidden;`;

    const mapContainer = document.createElement('div');
    mapContainer.style.cssText = 'width: 100%; height: 100%; border-radius: 8px; overflow: hidden;';
    dom.appendChild(mapContainer);

    let currentMap: mapboxgl.Map | null = null;
    let currentMarkers: mapboxgl.Marker[] = [];

    // Extract locations from document
    const extractLocations = () => {
      const locations: any[] = [];
      editorView.state.doc.descendants((node) => {
        if (node.isText && node.marks.length > 0) {
          for (const mark of node.marks) {
            if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
              locations.push({
                geoId: mark.attrs.geoId,
                displayText: mark.attrs.displayText || node.text,
                placeName: mark.attrs.placeName,
                lat: parseFloat(mark.attrs.lat),
                lng: parseFloat(mark.attrs.lng),
                colorIndex: mark.attrs.colorIndex,
              });
            }
          }
        }
      });
      return locations;
    };

    // Initialize and update map
    const updateMap = () => {
      const locations = extractLocations();

      if (locations.length === 0) {
        mapContainer.innerHTML = `
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #6b7280;">
            🗺️ No locations found
          </div>
        `;
        if (currentMap) {
          currentMap.remove();
          currentMap = null;
        }
        return;
      }

      if (!currentMap) {
        mapContainer.innerHTML = '';
        mapboxgl.accessToken = MAPBOX_TOKEN;

        let initialCenter: [number, number] = [0, 0];
        let initialZoom = 2;

        if (locations.length === 1) {
          initialCenter = [locations[0].lng, locations[0].lat];
          initialZoom = 12;
        } else if (locations.length > 1) {
          const lngs = locations.map((l: any) => l.lng);
          const lats = locations.map((l: any) => l.lat);
          initialCenter = [
            (Math.min(...lngs) + Math.max(...lngs)) / 2,
            (Math.min(...lats) + Math.max(...lats)) / 2
          ];
        }

        currentMap = new mapboxgl.Map({
          container: mapContainer,
          style: 'mapbox://styles/mapbox/light-v11',
          center: initialCenter,
          zoom: initialZoom,
          dragPan: false,
          scrollZoom: false,
          boxZoom: false,
          dragRotate: false,
          keyboard: false,
          doubleClickZoom: false,
          touchZoomRotate: false,
        });

        currentMap.once('style.load', () => {
          // Add markers
          locations.forEach((location: any) => {
            const bgColor = COLORS[location.colorIndex % COLORS.length];
            const el = document.createElement('div');
            el.style.cssText = `width: 32px; height: 32px; border-radius: 50%; background-color: ${bgColor}; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center;`;

            const inner = document.createElement('div');
            inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white;';
            el.appendChild(inner);

            const marker = new mapboxgl.Marker(el)
              .setLngLat([location.lng, location.lat])
              .setPopup(new mapboxgl.Popup().setText(location.placeName))
              .addTo(currentMap!);

            currentMarkers.push(marker);
          });

          // Fit bounds
          if (locations.length === 1) {
            currentMap!.jumpTo({
              center: [locations[0].lng, locations[0].lat],
              zoom: 12
            });
          } else if (locations.length > 1) {
            const lngs = locations.map((l: any) => l.lng);
            const lats = locations.map((l: any) => l.lat);
            const bounds = new mapboxgl.LngLatBounds(
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            );
            currentMap!.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15,
              duration: 0
            });
          }

          console.log('[MapView] Map initialized with', locations.length, 'locations');
        });
      }
    };

  // Initial render
  setTimeout(updateMap, 100);

  // Set up periodic updates to detect new geo marks
  let previousLocationCount = 0;
  const updateInterval = setInterval(() => {
    const locations = extractLocations();
    if (locations.length !== previousLocationCount) {
      console.log('[MapView] Location count changed:', previousLocationCount, '->', locations.length);
      previousLocationCount = locations.length;

      // Remove old markers
      currentMarkers.forEach(marker => marker.remove());
      currentMarkers = [];

      if (locations.length === 0) {
        if (currentMap) {
          currentMap.remove();
          currentMap = null;
        }
        return;
      }

      if (!currentMap) {
        updateMap();
      } else {
        // Add new markers
        locations.forEach((location: any) => {
          const bgColor = COLORS[location.colorIndex % COLORS.length];
          const el = document.createElement('div');
          el.style.cssText = `width: 32px; height: 32px; border-radius: 50%; background-color: ${bgColor}; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center;`;

          const inner = document.createElement('div');
          inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white;';
          el.appendChild(inner);

          const marker = new mapboxgl.Marker(el)
            .setLngLat([location.lng, location.lat])
            .setPopup(new mapboxgl.Popup().setText(location.placeName))
            .addTo(currentMap!);

          currentMarkers.push(marker);
        });

        // Re-fit bounds to show all locations
        if (locations.length === 1) {
          currentMap.flyTo({
            center: [locations[0].lng, locations[0].lat],
            zoom: 12,
            duration: 1500
          });
        } else if (locations.length > 1) {
          const lngs = locations.map((l: any) => l.lng);
          const lats = locations.map((l: any) => l.lat);
          const bounds = new mapboxgl.LngLatBounds(
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)]
          );
          currentMap.fitBounds(bounds, {
            padding: 50,
            maxZoom: 15,
            duration: 1500
          });
        }
      }
    }
  }, 1000);

  return {
    dom,
    update(newNode: any) {
      if (newNode.type.name !== 'map') return false;
      updateMap();
      return true;
    },
    destroy() {
      clearInterval(updateInterval);
      if (currentMap) {
        currentMap.remove();
      }
    }
  };
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
    nodeViews: {
      map: createMapNodeView,
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

// Function to geocode a place name using Nominatim
async function geocodePlace(placeName: string) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WebRTC-Agent-POC/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.length === 0) {
      return null;
    }

    return {
      placeName: data[0].display_name,
      lat: data[0].lat,
      lng: data[0].lon
    };
  } catch (error) {
    console.error('[Main] Geocoding error:', error);
    return null;
  }
}

// Function to create a geo mark on selected text
async function createGeoMark(view: EditorView) {
  const { state } = view;
  const { from, to } = state.selection;

  if (from === to) {
    alert('Please select some text to create a geo mark');
    return;
  }

  // Get the selected text
  const selectedText = state.doc.textBetween(from, to);

  // Show loading state
  updateStatus('Geocoding location...', 'connecting');

  // Geocode the selected text
  const geocodeResult = await geocodePlace(selectedText);

  if (!geocodeResult) {
    updateStatus('Could not find location', 'disconnected');
    alert(`Could not find coordinates for "${selectedText}". Please try a different location name.`);
    return;
  }

  // Generate a unique ID
  const geoId = `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create the geo mark
  const geoMarkType = customSchema.marks.geoMark;
  const mark = geoMarkType.create({
    geoId,
    displayText: selectedText,
    placeName: geocodeResult.placeName,
    lat: geocodeResult.lat,
    lng: geocodeResult.lng,
    colorIndex: Math.floor(Math.random() * 10),
    coordSource: 'nominatim'
  });

  // Apply the mark to the selection
  const tr = state.tr.addMark(from, to, mark);
  view.dispatch(tr);

  updateStatus('Geo mark created', 'connected');
  console.log('[Main] Created geo mark:', {
    geoId,
    selectedText,
    placeName: geocodeResult.placeName,
    lat: geocodeResult.lat,
    lng: geocodeResult.lng
  });
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
  const createGeoMarkBtn = document.getElementById('create-geomark-btn') as HTMLButtonElement;
  const insertMapBtn = document.getElementById('insert-map-btn');

  // Function to update button state based on selection
  const updateButtonState = () => {
    if (!createGeoMarkBtn) return;

    const { state } = view;
    const { from, to } = state.selection;
    const hasSelection = from !== to;

    createGeoMarkBtn.disabled = !hasSelection;
    createGeoMarkBtn.style.opacity = hasSelection ? '1' : '0.5';
    createGeoMarkBtn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
  };

  // Initial button state
  updateButtonState();

  // Update button state on selection change
  view.dom.addEventListener('mouseup', updateButtonState);
  view.dom.addEventListener('keyup', updateButtonState);

  // Button click handlers
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
