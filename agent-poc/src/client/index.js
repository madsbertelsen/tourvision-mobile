import { EditorState, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import { baseKeymap } from "prosemirror-commands";
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from "y-prosemirror";
import YProvider from "../y-partyserver/provider";
import * as Y from "yjs";
import { customSchema } from "../prosemirror-schema";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import "./styles.css";

// ============================================================================
// BOOTSTRAP: Set up message handlers and console override
// This must run BEFORE the DocumentEditor class is instantiated
// ============================================================================

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const docId = urlParams.get('doc');

// Display document ID
const docIdElement = document.getElementById('doc-id');
if (docIdElement) {
  if (docId) {
    docIdElement.textContent = docId;
  } else {
    docIdElement.textContent = 'No document loaded';
  }
}

// Handle new document button
const newDocBtn = document.getElementById('new-doc-btn');
if (newDocBtn) {
  newDocBtn.addEventListener('click', () => {
    const newDocId = `doc-${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    window.location.href = `/editor.html?doc=${newDocId}`;
  });
}

// Store document ID globally for message handlers
window.editorDocumentId = docId;

// Helper function to send messages to parent
window.sendToParent = (message) => {
  const messageString = JSON.stringify(message);

  // Send to React Native WebView if available
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(messageString);
  }
  // Send to parent iframe if in iframe
  else if (window.parent && window.parent !== window) {
    window.parent.postMessage(messageString, '*');
  }
};

// Listen for messages from parent frame (React Native WebView or iframe)
window.addEventListener('message', (event) => {
  // Handle messages from parent
  if (event.data) {
    try {
      const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      console.log('[Editor] Received message from parent:', message);

      // Dispatch custom event that the parentMessage listener can handle
      const customEvent = new CustomEvent('parentMessage', { detail: message });
      window.dispatchEvent(customEvent);
    } catch (error) {
      console.error('[Editor] Error parsing message:', error);
    }
  }
});

// Override console methods to forward logs to parent window
// This allows React Native to see WebView console logs
(function() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };

  const sendLogToParent = (level, args) => {
    // Call original console method
    originalConsole[level].apply(console, args);

    // Format the message
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    // Send to parent via postMessage if available
    if (window.sendToParent) {
      window.sendToParent({
        type: 'editorLog',
        message: `[${level.toUpperCase()}] ${message}`
      });
    }
  };

  console.log = function(...args) { sendLogToParent('log', args); };
  console.warn = function(...args) { sendLogToParent('warn', args); };
  console.error = function(...args) { sendLogToParent('error', args); };
  console.info = function(...args) { sendLogToParent('info', args); };
  console.debug = function(...args) { sendLogToParent('debug', args); };
})();

// Test that console override is working
console.log('[Editor] Bootstrap complete, sendToParent available:', typeof window.sendToParent);

// Send ready message when page loads
window.addEventListener('load', () => {
  setTimeout(() => {
    console.log('[Editor] Sending ready message');
    window.sendToParent({ type: 'ready' });
  }, 100);
});

// ============================================================================
// END BOOTSTRAP
// ============================================================================

// Default port 8787 matches Wrangler dev server default
const WS_PORT = import.meta.env.VITE_WS_PORT || "8787";
const WS_HOST = `localhost:${WS_PORT}`;

// 5 pastel colors
const colours = ["#FFC0CB", "#FFD700", "#98FB98", "#87CEFA", "#FFA07A"];

// Pick a random color from the list
const MY_COLOR = colours[Math.floor(Math.random() * colours.length)];

// Generate a random username
const MY_USERNAME = `User-${Math.floor(Math.random() * 1000)}`;

// Color palette for location markers (matches geo-mark colors)
const COLORS = [
  '#3B82F6',  // Blue
  '#8B5CF6',  // Purple
  '#10B981',  // Green
  '#F59E0B',  // Amber
  '#EF4444',  // Red
  '#EC4899',  // Pink
  '#06B6D4',  // Cyan
  '#84CC16',  // Lime
  '#F97316',  // Orange
  '#6366F1'   // Indigo
];

// Geocode a location using Nominatim API
async function geocodeLocation(locationName) {
  try {
    console.log(`[Client] Geocoding "${locationName}"...`);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`,
      {
        headers: {
          'User-Agent': 'TourVision-Agent/1.0'
        }
      }
    );

    if (!response.ok) {
      console.error('[Client] Nominatim API error:', response.status);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name
      };
    }

    console.log(`[Client] No results found for "${locationName}"`);
    return null;
  } catch (error) {
    console.error('[Client] Geocoding error:', error);
    return null;
  }
}

class DocumentEditor {
  constructor() {
    this.editorView = null;
    this.provider = null;
    this.messages = [];
    this.documentId = null;
    this.documents = [];
    this.locations = [];
    this.showMap = false;
    this.map = null;

    this.init();
  }

  init() {
    // Load documents from localStorage
    const stored = localStorage.getItem('documents');
    this.documents = stored ? JSON.parse(stored) : [];

    // Get document ID from URL or sessionStorage
    const params = new URLSearchParams(window.location.search);
    const urlDocId = params.get('doc');
    if (urlDocId) {
      sessionStorage.setItem('currentDocId', urlDocId);
      this.documentId = urlDocId;
    } else {
      this.documentId = sessionStorage.getItem('currentDocId');
    }

    this.render();
    if (this.documentId) {
      this.initializeEditor(this.documentId);
    }
  }

  render() {
    const app = document.getElementById('root');
    app.innerHTML = `
      <div>
        <div style="margin-bottom: 20px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between;">
          <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <h1 style="margin: 0;">Multi-Document Editor</h1>
            <button id="new-doc-btn" style="padding: 10px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
              + New Document
            </button>
            ${this.documentId ? `
              <span style="padding: 10px; background-color: #f0f0f0; border-radius: 4px; font-size: 14px;">
                Current: <strong>${this.documentId}</strong>
              </span>
            ` : ''}
          </div>
          ${this.documentId ? `
            <div id="user-presence" style="display: flex; gap: 8px; align-items: center; padding: 8px 12px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
              <span style="font-size: 13px; color: #6b7280; font-weight: 500;">Editing:</span>
              <div id="presence-avatars" style="display: flex; gap: 6px;"></div>
            </div>
          ` : ''}
        </div>

        ${this.documents.length > 0 ? `
          <div style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 10px;">Your Documents:</h3>
            <div id="docs-list" style="display: flex; gap: 10px; flex-wrap: wrap;"></div>
          </div>
        ` : ''}

        ${!this.documentId ? `
          <div style="padding: 40px; text-align: center; border: 2px dashed #ccc; border-radius: 8px; margin-bottom: 20px;">
            <h2>No document selected</h2>
            <p>Create a new document to get started</p>
            <button id="create-first-btn" style="padding: 15px 30px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
              Create First Document
            </button>
          </div>
        ` : ''}

        ${this.documentId ? `
          <div id="editor" style="border: 1px solid #ccc; padding: 10px; min-height: 200px;"></div>

          <div style="margin-top: 20px;">
            <h2>Map Controls</h2>
            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
              <button id="insert-map-btn" style="padding: 10px 20px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;">
                📍 Insert Map
              </button>
              <button id="toggle-map-btn" style="padding: 10px 20px; background-color: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;">
                ${this.showMap ? '🗺️ Hide Map Preview' : '🗺️ Show Map Preview'}
              </button>
              <span style="padding: 10px; background-color: #f0f0f0; border-radius: 4px; font-size: 14px;">
                Locations: <strong>${this.locations.length}</strong>
              </span>
            </div>

            <div id="map-container"></div>
          </div>

          <div style="margin-top: 20px;">
            <h2>Custom Messages Demo</h2>
            <button id="send-ping-btn" style="padding: 10px 20px;">Send Ping</button>
            <div id="messages" style="margin-top: 10px; padding: 10px; border: 1px solid #ccc; max-height: 200px; overflow-y: auto;">
              <h3>Messages:</h3>
              <div id="messages-content">${this.messages.length === 0 ? '<p>No messages yet</p>' : this.messages.map(m => `<div>${m.text}</div>`).join('')}</div>
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this.attachEventListeners();
    this.renderDocumentsList();
    this.renderMap();
  }

  attachEventListeners() {
    const newDocBtn = document.getElementById('new-doc-btn');
    const createFirstBtn = document.getElementById('create-first-btn');
    const insertMapBtn = document.getElementById('insert-map-btn');
    const toggleMapBtn = document.getElementById('toggle-map-btn');
    const sendPingBtn = document.getElementById('send-ping-btn');

    if (newDocBtn) newDocBtn.addEventListener('click', () => this.createNewDocument());
    if (createFirstBtn) createFirstBtn.addEventListener('click', () => this.createNewDocument());
    if (insertMapBtn) insertMapBtn.addEventListener('click', () => this.insertMap());
    if (toggleMapBtn) toggleMapBtn.addEventListener('click', () => {
      this.showMap = !this.showMap;
      this.render();
    });
    if (sendPingBtn) sendPingBtn.addEventListener('click', () => this.sendPing());
  }

  renderDocumentsList() {
    const docsList = document.getElementById('docs-list');
    if (!docsList) return;

    docsList.innerHTML = this.documents.map(docId => `
      <button
        data-doc-id="${docId}"
        style="padding: 8px 16px; background-color: ${docId === this.documentId ? '#2196F3' : '#e0e0e0'}; color: ${docId === this.documentId ? 'white' : 'black'}; border: none; border-radius: 4px; cursor: pointer;"
      >
        ${docId}
      </button>
    `).join('');

    // Attach click listeners
    docsList.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const docId = btn.getAttribute('data-doc-id');
        this.switchDocument(docId);
      });
    });
  }

  renderMap() {
    const container = document.getElementById('map-container');
    if (!container) return;

    if (this.showMap && this.locations.length > 0) {
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

      if (!mapboxToken) {
        container.innerHTML = `
          <div style="height: 400px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; display: flex; align-items: center; justify-content: center; color: #6b7280;">
            🗺️ Mapbox token required for map rendering
          </div>
        `;
        return;
      }

      container.innerHTML = '<div id="map" style="height: 400px; margin: 16px 0; border-radius: 8px; overflow: hidden;"></div>';

      setTimeout(() => {
        this.initializeMap(mapboxToken);
      }, 100);
    } else if (this.showMap && this.locations.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; border: 2px dashed #ccc; border-radius: 8px; margin-top: 10px; color: #666;">
          <p>No locations found in document. Add locations first by typing and letting the agent detect them.</p>
        </div>
      `;
    } else {
      container.innerHTML = '';
      if (this.map) {
        this.map.remove();
        this.map = null;
      }
    }
  }

  initializeMap(mapboxToken) {
    if (this.map) {
      this.map.remove();
    }

    mapboxgl.accessToken = mapboxToken;

    // Initialize map with default view
    this.map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-0.1278, 51.5074], // London default
      zoom: 3
    });

    // Add markers with Expo-style design (colored circle with white center)
    this.locations.forEach((location) => {
      const bgColor = COLORS[location.colorIndex % COLORS.length];

      // Create outer circle (colored)
      const el = document.createElement('div');
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = bgColor;
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';

      // Create inner white circle
      const inner = document.createElement('div');
      inner.style.width = '12px';
      inner.style.height = '12px';
      inner.style.borderRadius = '50%';
      inner.style.backgroundColor = 'white';

      el.appendChild(inner);

      new mapboxgl.Marker(el)
        .setLngLat([location.lng, location.lat])
        .setPopup(new mapboxgl.Popup().setText(location.placeName))
        .addTo(this.map);
    });

    // On map load: fit bounds and draw routes
    this.map.on('load', async () => {
      // Fit bounds to locations
      if (this.locations.length === 1) {
        // Single location: center with zoom
        this.map.flyTo({
          center: [this.locations[0].lng, this.locations[0].lat],
          zoom: 12,
          duration: 1000
        });
      } else if (this.locations.length > 1) {
        // Multiple locations: fit bounds
        const lngs = this.locations.map(l => l.lng);
        const lats = this.locations.map(l => l.lat);

        const bounds = new mapboxgl.LngLatBounds(
          [Math.min(...lngs), Math.min(...lats)], // Southwest
          [Math.max(...lngs), Math.max(...lats)]  // Northeast
        );

        this.map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 1000
        });
      }

      // Fetch and draw routes between locations based on transportFrom relationships
      console.log('[MapView] Map loaded, checking for routes. Locations count:', this.locations.length);
      if (this.locations.length > 1) {
        console.log('[MapView] Starting route loop');
        for (let i = 0; i < this.locations.length; i++) {
          const to = this.locations[i];
          console.log(`[MapView] Checking location ${i}:`, {
            placeName: to.placeName,
            transportProfile: to.transportProfile,
            transportFrom: to.transportFrom
          });

          // Skip if no transport configuration
          if (!to.transportProfile || !to.transportFrom) {
            console.log(`[MapView] Skipping ${to.placeName} - no transport configuration`);
            continue;
          }

          // Find the source location
          const from = this.locations.find(loc => loc.geoId === to.transportFrom);
          if (!from) {
            console.log(`[MapView] Could not find source location ${to.transportFrom} for ${to.placeName}`);
            continue;
          }

          console.log(`[MapView] Rendering route: ${from.placeName} → ${to.placeName} (${to.transportProfile})`);

          let coordinates;
          if (to.waypoints && to.waypoints.length > 0) {
            const waypointCoords = to.waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
            coordinates = `${from.lng},${from.lat};${waypointCoords};${to.lng},${to.lat}`;
          } else {
            coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
          }

          const profile = to.transportProfile || 'walking';
          const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

          try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
              const route = data.routes[0];
              const routeColor = COLORS[to.colorIndex % COLORS.length];

              this.map.addSource(`route-${from.geoId}-${to.geoId}`, {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: route.geometry
                }
              });

              this.map.addLayer({
                id: `route-${from.geoId}-${to.geoId}`,
                type: 'line',
                source: `route-${from.geoId}-${to.geoId}`,
                layout: {
                  'line-join': 'round',
                  'line-cap': 'round'
                },
                paint: {
                  'line-color': routeColor,
                  'line-width': 3,
                  'line-opacity': 0.75
                }
              });
            }
          } catch (error) {
            console.error('[MapBlock] Error fetching route:', error);
          }
        }
      }
    });
  }

  createNewDocument() {
    const newDocId = `doc-${Date.now()}`;
    this.documents.push(newDocId);
    localStorage.setItem('documents', JSON.stringify(this.documents));
    this.switchDocument(newDocId);
  }

  switchDocument(docId) {
    this.documentId = docId;
    sessionStorage.setItem('currentDocId', docId);
    window.history.pushState({}, '', `?doc=${docId}`);

    // Clean up old editor
    if (this.editorView) {
      this.editorView.destroy();
      this.editorView = null;
    }
    if (this.provider) {
      this.provider.disconnect();
      this.provider = null;
    }

    this.render();
    this.initializeEditor(docId);
  }

  initializeEditor(documentId) {
    const editorElement = document.getElementById('editor');
    if (!editorElement) return;

    console.log("Initializing Y.Doc, YProvider, and ProseMirror for document:", documentId);

    // Create Y.Doc
    const yDoc = new Y.Doc();
    const yXmlFragment = yDoc.getXmlFragment("prosemirror");

    // Create YProvider
    const prov = new YProvider(
      WS_HOST,
      documentId,
      yDoc,
      {
        party: 'document',
        WebSocketPolyfill: WebSocket,
        connect: true
      }
    );

    this.provider = prov;

    // Set user awareness
    prov.awareness.setLocalState({
      user: {
        name: MY_USERNAME,
        color: MY_COLOR
      }
    });

    // Listen for awareness changes (users joining/leaving)
    const updatePresence = () => {
      const presenceAvatars = document.getElementById('presence-avatars');
      if (!presenceAvatars) return;

      const states = Array.from(prov.awareness.getStates().values());
      const users = states
        .filter(state => state.user)
        .map(state => state.user);

      if (users.length === 0) {
        presenceAvatars.innerHTML = '<span style="font-size: 12px; color: #9ca3af;">No one else here</span>';
      } else {
        presenceAvatars.innerHTML = users.map(user => `
          <div style="display: flex; align-items: center; gap: 6px; padding: 4px 10px; background-color: white; border: 1px solid ${user.color}; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${user.color};"></div>
            <span style="font-size: 12px; font-weight: 500; color: #374151;">${user.name}</span>
          </div>
        `).join('');
      }
    };

    prov.awareness.on('change', updatePresence);

    // Initial presence update
    setTimeout(updatePresence, 100);

    // Listen for custom messages
    const handleCustomMessage = (message) => {
      try {
        const data = JSON.parse(message);
        console.log('[Client] Received custom message:', data);

        if (data.type === 'geocode_task') {
          console.log(`[Client] Geocoding task received: ${data.locationName}`);
          geocodeLocation(data.locationName).then(result => {
            if (result) {
              prov.sendMessage(JSON.stringify({
                type: 'geocode_result',
                taskId: data.taskId,
                result: result
              }));
            }
          });
        } else if (data.type === 'pong') {
          this.messages.push({ id: Date.now().toString(), text: `Received: pong` });
          this.updateMessages();
        }
      } catch (error) {
        console.error('[Client] Error handling custom message:', error);
      }
    };

    prov.on("custom-message", handleCustomMessage);

    // Cursor builder for awareness - enhanced with better visuals
    const cursorBuilder = (user) => {
      const cursor = document.createElement("span");
      cursor.classList.add("ProseMirror-yjs-cursor");
      cursor.style.borderColor = user.color || "#000";
      cursor.style.borderLeftWidth = "2px";
      cursor.style.borderLeftStyle = "solid";

      const userLabel = document.createElement("div");
      userLabel.classList.add("ProseMirror-yjs-cursor-label");
      userLabel.style.backgroundColor = user.color || "#000";
      userLabel.textContent = user.name || "Anonymous";

      // Add a subtle pulse effect for better visibility
      userLabel.style.transition = "all 0.2s ease";

      cursor.appendChild(userLabel);
      return cursor;
    };

    // Selection builder for awareness - creates highlighted selections
    const selectionBuilder = (user) => {
      const selection = document.createElement("span");
      selection.classList.add("ProseMirror-yjs-selection");
      selection.style.backgroundColor = user.color || "#000";
      selection.style.opacity = "0.25";
      return selection;
    };

    // Create ProseMirror EditorState
    const state = EditorState.create({
      schema: customSchema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(prov.awareness, {
          cursorBuilder,
          selectionBuilder,
          getSelection: (state) => state.selection
        }),
        yUndoPlugin(),
        history(),
        keymap({ "Mod-z": undo, "Mod-y": redo }),
        keymap(baseKeymap)
      ]
    });

    // NodeView for rendering maps
    const mapNodeView = (node) => {
      const dom = document.createElement('div');
      dom.className = 'prosemirror-map';
      dom.style.cssText = `height: ${node.attrs.height}px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; position: relative;`;

      const mapContainer = document.createElement('div');
      mapContainer.style.cssText = 'width: 100%; height: 100%; border-radius: 8px; overflow: hidden;';
      dom.appendChild(mapContainer);

      // Create clickable overlay on top of map
      const clickOverlay = document.createElement('div');
      clickOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
        cursor: pointer;
        background: transparent;
      `;

      // Track press timing for long press detection
      let pressStartTime = 0;
      let longPressTimer = null;
      let isLongPress = false;
      const LONG_PRESS_DURATION = 500; // 500ms for long press

      // Handle mouse/touch start
      const handlePressStart = (e) => {
        pressStartTime = Date.now();
        isLongPress = false;

        // Set a timer for long press
        longPressTimer = setTimeout(() => {
          isLongPress = true;
          console.log('[MapView] Long press detected - selecting node');
          // Manually trigger node selection
          const pos = this.editorView.posAtDOM(dom, 0);
          if (pos !== null) {
            const tr = this.editorView.state.tr.setSelection(
              NodeSelection.create(this.editorView.state.doc, pos)
            );
            this.editorView.dispatch(tr);
          }
        }, LONG_PRESS_DURATION);
      };

      // Handle mouse/touch end (or use 'click' for simpler detection)
      const handleClick = (e) => {
        // If this was a long press, don't handle as click
        if (isLongPress) {
          isLongPress = false;
          return;
        }

        // Short click/tap - open fullscreen map
        e.preventDefault();
        e.stopPropagation();
        console.log('[MapView] Click detected - opening fullscreen map');
        const locations = extractLocations();
        console.log('[MapView] Collected locations:', locations);

        // Send message to parent (works for both React Native WebView and iframe)
        if (window.sendToParent) {
          window.sendToParent({
            type: 'openFullscreenMap',
            locations: locations
          });
          console.log('[MapView] Sent openFullscreenMap message to parent');
        } else if (window.ReactNativeWebView) {
          // Fallback to direct React Native WebView if sendToParent not available
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'openFullscreenMap',
            locations: locations
          }));
          console.log('[MapView] Sent openFullscreenMap message to React Native');
        } else {
          console.log('[MapView] No parent communication available');
        }
      };

      // Handle mouse/touch cancel
      const handlePressCancel = () => {
        clearTimeout(longPressTimer);
        pressStartTime = 0;
        isLongPress = false;
      };

      // Add event listeners for both mouse and touch
      clickOverlay.addEventListener('mousedown', handlePressStart);
      clickOverlay.addEventListener('touchstart', handlePressStart);
      clickOverlay.addEventListener('mouseleave', handlePressCancel);
      clickOverlay.addEventListener('touchcancel', handlePressCancel);
      clickOverlay.addEventListener('click', handleClick);

      dom.appendChild(clickOverlay);

      let currentMap = null;
      let currentMarkers = [];
      let currentRoutes = new Map(); // Track route layers by ID
      let previousLocationCount = 0;
      let isUserInteracting = false;
      let isFirstLoad = true; // Track if this is the first time loading the map

      // Extract locations from document
      const extractLocations = () => {
        const locations = [];
        this.editorView.state.doc.descendants((node) => {
          if (node.isText && node.marks.length > 0) {
            for (const mark of node.marks) {
              if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
                locations.push({
                  geoId: mark.attrs.geoId,
                  placeName: mark.attrs.placeName,
                  lat: parseFloat(mark.attrs.lat),
                  lng: parseFloat(mark.attrs.lng),
                  colorIndex: mark.attrs.colorIndex,
                  transportFrom: mark.attrs.transportFrom,
                  transportProfile: mark.attrs.transportProfile,
                  waypoints: mark.attrs.waypoints
                });
              }
            }
          }
        });
        console.log('[MapNodeView] Extracted locations:', locations.length);
        return locations;
      };

      // Update markers on map
      const updateMarkers = (locations, shouldAnimate = true) => {
        if (!currentMap) return;

        // Remove old markers
        currentMarkers.forEach(marker => marker.remove());
        currentMarkers = [];

        // Add new markers
        locations.forEach((location) => {
          const bgColor = COLORS[location.colorIndex % COLORS.length];
          const el = document.createElement('div');
          el.style.cssText = `width: 32px; height: 32px; border-radius: 50%; background-color: ${bgColor}; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center;`;

          const inner = document.createElement('div');
          inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white;';
          el.appendChild(inner);

          const marker = new mapboxgl.Marker(el)
            .setLngLat([location.lng, location.lat])
            .setPopup(new mapboxgl.Popup().setText(location.placeName))
            .addTo(currentMap);

          currentMarkers.push(marker);
        });

        // Position the map - instant on first load, animated on updates
        if (shouldAnimate && !isUserInteracting) {
          if (locations.length === 1) {
            if (isFirstLoad) {
              // First load - jump instantly to position
              currentMap.jumpTo({
                center: [locations[0].lng, locations[0].lat],
                zoom: 12
              });
              console.log('[MapNodeView] Initial load - jumped to single location');
            } else {
              // Subsequent updates - animate
              currentMap.flyTo({
                center: [locations[0].lng, locations[0].lat],
                zoom: 12,
                duration: 1500
              });
            }
          } else if (locations.length > 1) {
            const lngs = locations.map(l => l.lng);
            const lats = locations.map(l => l.lat);
            const bounds = new mapboxgl.LngLatBounds(
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            );

            if (isFirstLoad) {
              // First load - fit bounds instantly
              currentMap.fitBounds(bounds, {
                padding: 50,
                maxZoom: 15,
                duration: 0  // Instant positioning
              });
              console.log('[MapNodeView] Initial load - fitted bounds instantly');
            } else {
              // Subsequent updates - animate
              currentMap.fitBounds(bounds, {
                padding: 50,
                maxZoom: 15,
                duration: 1500
              });
            }
          }

          // After first positioning, set flag to false
          if (isFirstLoad) {
            isFirstLoad = false;
          }
        }
      };

      // Update routes on map
      const updateRoutes = async (locations) => {
        if (!currentMap || !currentMap.isStyleLoaded()) return;

        const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
        if (!mapboxToken) return;

        console.log('[MapNodeView] Updating routes for', locations.length, 'locations');

        // Build a set of route IDs that should exist
        const expectedRouteIds = new Set();

        if (locations.length > 1) {
          for (const toLoc of locations) {
            if (!toLoc.transportProfile || !toLoc.transportFrom) continue;

            const fromLoc = locations.find(loc => loc.geoId === toLoc.transportFrom);
            if (!fromLoc) continue;

            const routeId = `route-${fromLoc.geoId}-${toLoc.geoId}`;
            expectedRouteIds.add(routeId);

            // Check if this route needs updating
            const existingRoute = currentRoutes.get(routeId);
            const needsUpdate = !existingRoute ||
                               existingRoute.transportProfile !== toLoc.transportProfile ||
                               JSON.stringify(existingRoute.waypoints) !== JSON.stringify(toLoc.waypoints);

            if (!needsUpdate) {
              console.log(`[MapNodeView] Route ${routeId} is up to date`);
              continue;
            }

            console.log(`[MapNodeView] Fetching route: ${fromLoc.placeName} → ${toLoc.placeName} (${toLoc.transportProfile})`);

            // Remove old route if it exists
            if (currentMap.getLayer(routeId)) {
              currentMap.removeLayer(routeId);
            }
            if (currentMap.getSource(routeId)) {
              currentMap.removeSource(routeId);
            }

            // Build coordinates string
            let coordinates;
            if (toLoc.waypoints && toLoc.waypoints.length > 0) {
              const waypointCoords = toLoc.waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
              coordinates = `${fromLoc.lng},${fromLoc.lat};${waypointCoords};${toLoc.lng},${toLoc.lat}`;
            } else {
              coordinates = `${fromLoc.lng},${fromLoc.lat};${toLoc.lng},${toLoc.lat}`;
            }

            const profile = toLoc.transportProfile === 'walking' ? 'walking' :
                           toLoc.transportProfile === 'cycling' ? 'cycling' :
                           'driving-traffic';
            const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

            try {
              const response = await fetch(url);
              const data = await response.json();

              if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const routeColor = COLORS[toLoc.colorIndex % COLORS.length];

                console.log(`[MapNodeView] Adding route layer ${routeId} with color ${routeColor}`);

                currentMap.addSource(routeId, {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    properties: {},
                    geometry: route.geometry
                  }
                });

                currentMap.addLayer({
                  id: routeId,
                  type: 'line',
                  source: routeId,
                  layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                  },
                  paint: {
                    'line-color': routeColor,
                    'line-width': 3,
                    'line-opacity': 0.75
                  }
                });

                // Track this route
                currentRoutes.set(routeId, {
                  transportProfile: toLoc.transportProfile,
                  waypoints: toLoc.waypoints
                });
              }
            } catch (error) {
              console.error(`[MapNodeView] Error fetching route:`, error);
            }
          }
        }

        // Remove routes that shouldn't exist anymore
        for (const [routeId] of currentRoutes) {
          if (!expectedRouteIds.has(routeId)) {
            console.log(`[MapNodeView] Removing obsolete route ${routeId}`);
            if (currentMap.getLayer(routeId)) {
              currentMap.removeLayer(routeId);
            }
            if (currentMap.getSource(routeId)) {
              currentMap.removeSource(routeId);
            }
            currentRoutes.delete(routeId);
          }
        }
      };

      // Render map
      const renderMap = () => {
        const locations = extractLocations();
        const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

        if (!mapboxToken) {
          mapContainer.innerHTML = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #6b7280;">
              🗺️ Mapbox token required
            </div>
          `;
          return;
        }

        if (locations.length === 0) {
          mapContainer.innerHTML = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #6b7280;">
              🗺️ No locations found
            </div>
          `;
          return;
        }

        const locationCountChanged = locations.length !== previousLocationCount;
        previousLocationCount = locations.length;

        if (!currentMap) {
          mapContainer.innerHTML = '';

          // Initially hide the map to prevent seeing any transitions
          mapContainer.style.opacity = '0';

          mapboxgl.accessToken = mapboxToken;

          // Calculate the exact bounds we want
          let bounds = null;
          let initialCenter = [0, 0];
          let initialZoom = 2;

          if (locations.length === 1) {
            initialCenter = [locations[0].lng, locations[0].lat];
            initialZoom = 12;
          } else if (locations.length > 1) {
            const lngs = locations.map(l => l.lng);
            const lats = locations.map(l => l.lat);
            bounds = new mapboxgl.LngLatBounds(
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            );

            // Still calculate center for initial map creation
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
            // Disable all map interactions
            dragPan: false,
            scrollZoom: false,
            boxZoom: false,
            dragRotate: false,
            keyboard: false,
            doubleClickZoom: false,
            touchZoomRotate: false,
            // Disable any initial animations
            fadeDuration: 0,
            renderWorldCopies: false
          });

          // Track user interaction
          currentMap.on('movestart', (e) => {
            if (e.originalEvent) { // Only user-initiated movements
              isUserInteracting = true;
            }
          });

          // Once style is loaded, immediately position the map without animation
          currentMap.once('style.load', () => {
            // Add markers first
            currentMarkers.forEach(marker => marker.remove());
            currentMarkers = [];

            locations.forEach((location) => {
              const bgColor = COLORS[location.colorIndex % COLORS.length];
              const el = document.createElement('div');
              el.style.cssText = `width: 32px; height: 32px; border-radius: 50%; background-color: ${bgColor}; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center;`;

              const inner = document.createElement('div');
              inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white;';
              el.appendChild(inner);

              const marker = new mapboxgl.Marker(el)
                .setLngLat([location.lng, location.lat])
                .setPopup(new mapboxgl.Popup().setText(location.placeName))
                .addTo(currentMap);

              currentMarkers.push(marker);
            });

            // Now position the map instantly
            if (locations.length === 1) {
              currentMap.jumpTo({
                center: [locations[0].lng, locations[0].lat],
                zoom: 12
              });
            } else if (bounds) {
              currentMap.fitBounds(bounds, {
                padding: 50,
                maxZoom: 15,
                duration: 0,
                animate: false
              });
            }

            // Mark first load as done
            isFirstLoad = false;

            // Fetch and render routes
            updateRoutes(locations);

            // Show the map after positioning
            setTimeout(() => {
              mapContainer.style.transition = 'opacity 0.3s';
              mapContainer.style.opacity = '1';
            }, 50);
          });
        } else {
          // Map already exists, update markers and routes
          updateMarkers(locations, locationCountChanged);
          updateRoutes(locations);
        }
      };

      setTimeout(renderMap, 100);

      return {
        dom,
        update: () => {
          renderMap();
          return true;
        },
        destroy: () => {
          if (currentMap) {
            currentMap.remove();
          }
        },
        selectNode: () => {
          dom.classList.add('ProseMirror-selectednode');
        },
        deselectNode: () => {
          dom.classList.remove('ProseMirror-selectednode');
        },
        stopEvent: (event) => {
          // Stop all events from reaching the map
          // We handle clicks via the overlay's event listeners
          return true;
        }
      };
    };

    // Create ProseMirror EditorView
    this.editorView = new EditorView(editorElement, {
      state,
      nodeViews: {
        map: mapNodeView
      },
      dispatchTransaction(tr) {
        const newState = this.state.apply(tr);
        this.updateState(newState);

        if (tr.docChanged) {
          // Use setTimeout to avoid accessing this during construction
          setTimeout(() => {
            if (window.docEditor) {
              window.docEditor.updateLocations();
              // Send document change to parent
              window.docEditor.sendDocumentChange();
            }
          }, 0);
        }
      }
    });

    // Initial location extraction
    setTimeout(() => this.updateLocations(), 500);
  }

  updateLocations() {
    if (!this.editorView) return;

    const doc = this.editorView.state.doc;
    const foundLocations = [];

    doc.descendants((node) => {
      if (node.isText && node.marks.length > 0) {
        for (const mark of node.marks) {
          if (mark.type.name === 'geoMark') {
            const attrs = mark.attrs;
            foundLocations.push({
              geoId: attrs.geoId,
              placeName: attrs.placeName,
              lat: parseFloat(attrs.lat),
              lng: parseFloat(attrs.lng),
              colorIndex: attrs.colorIndex,
              transportFrom: attrs.transportFrom,
              transportProfile: attrs.transportProfile,
              waypoints: attrs.waypoints
            });
          }
        }
      }
    });

    this.locations = foundLocations;
    console.log("[Client] Extracted locations:", foundLocations);

    // Send locations update to parent
    if (window.sendToParent) {
      window.sendToParent({
        type: 'locationsUpdate',
        locations: this.locations
      });
      console.log("[Client] Sent locationsUpdate to parent");
    }

    // Update UI
    const locCount = document.querySelector('[style*="Locations"]');
    if (locCount) {
      locCount.innerHTML = `Locations: <strong>${this.locations.length}</strong>`;
    }

    // Update map if showing
    if (this.showMap) {
      this.renderMap();
    }
  }

  insertMap() {
    if (!this.editorView) {
      console.error("Editor not ready");
      return;
    }

    const view = this.editorView;
    const { state } = view;
    const { schema, tr } = state;

    // Create map node
    const mapNode = schema.nodes.map.create({ height: 400 });

    // Insert at the end of the document
    const insertPos = state.doc.content.size;
    const transaction = tr.insert(insertPos, mapNode);

    view.dispatch(transaction);
    console.log("[Client] Inserted map at position", insertPos);
  }

  sendPing() {
    if (this.provider) {
      console.log("Sending ping message");
      this.provider.sendMessage(JSON.stringify({ action: "ping" }));
    } else {
      console.error("Provider not ready");
    }
  }

  updateMessages() {
    const messagesContent = document.getElementById('messages-content');
    if (messagesContent) {
      messagesContent.innerHTML = this.messages.length === 0
        ? '<p>No messages yet</p>'
        : this.messages.map(m => `<div>${m.text}</div>`).join('');
    }
  }

  // Message handler methods for parent communication
  setContent(content) {
    if (!this.editorView || !content) return;

    try {
      console.log('[Editor] Setting content from parent');

      // Convert JSON to ProseMirror state
      const doc = customSchema.nodeFromJSON(content);
      const newState = EditorState.create({
        doc,
        schema: customSchema,
        plugins: this.editorView.state.plugins
      });

      this.editorView.updateState(newState);

      // Update locations after content change
      this.updateLocations();
    } catch (error) {
      console.error('[Editor] Error setting content:', error);
    }
  }

  setEditable(editable) {
    if (!this.editorView) return;

    console.log('[Editor] Setting editable:', editable);
    this.editorView.setProps({ editable: () => editable });
  }

  getState() {
    if (!this.editorView) return null;

    const doc = this.editorView.state.doc.toJSON();
    console.log('[Editor] Getting state for parent');
    return doc;
  }

  sendDocumentChange() {
    if (!this.editorView || !window.sendToParent) return;

    const doc = this.editorView.state.doc.toJSON();
    window.sendToParent({
      type: 'documentChange',
      doc: doc
    });
  }

  updateGeoMark(geoId, updatedAttrs) {
    console.log('[Editor] ========== updateGeoMark called ==========');
    console.log('[Editor] geoId:', geoId);
    console.log('[Editor] updatedAttrs:', updatedAttrs);

    if (!this.editorView || !geoId || !updatedAttrs) {
      console.log('[Editor] Missing editorView, geoId, or updatedAttrs - returning early');
      return;
    }

    const { state } = this.editorView;
    const { tr } = state;
    let found = false;

    console.log('[Editor] Starting document traversal to find geo-mark');

    // Traverse the document to find and update the geo-mark
    state.doc.descendants((node, pos) => {
      if (node.marks) {
        const geoMark = node.marks.find(mark =>
          mark.type.name === 'geoMark' && mark.attrs.geoId === geoId
        );

        if (geoMark) {
          console.log(`[Editor] Found geo-mark to update at position:`, pos);
          console.log(`[Editor] Current attrs:`, geoMark.attrs);

          // Create new mark with updated attributes
          const newAttrs = { ...geoMark.attrs, ...updatedAttrs };
          console.log(`[Editor] New attrs:`, newAttrs);

          const newMark = state.schema.marks.geoMark.create(newAttrs);

          // Remove old mark and add new one
          tr.removeMark(pos, pos + node.nodeSize, geoMark);
          tr.addMark(pos, pos + node.nodeSize, newMark);
          found = true;
        }
      }
    });

    if (found) {
      console.log('[Editor] Applying transaction to update geo-mark');
      // Apply the transaction
      this.editorView.dispatch(tr);
      console.log('[Editor] Transaction dispatched successfully');

      // Update locations and send change notification
      console.log('[Editor] Calling updateLocations()');
      this.updateLocations();

      console.log('[Editor] Calling sendDocumentChange()');
      this.sendDocumentChange();

      // Also send locations update
      if (window.sendToParent) {
        console.log('[Editor] Sending locationsUpdate to parent');
        window.sendToParent({
          type: 'locationsUpdate',
          locations: this.locations
        });
      }

      console.log('[Editor] ========== updateGeoMark completed successfully ==========');
    } else {
      console.warn(`[Editor] Geo-mark not found with geoId: ${geoId}`);
    }
  }
}

// Start the app
window.docEditor = new DocumentEditor();

// Listen for messages from parent (editor.html dispatches these)
window.addEventListener('parentMessage', (event) => {
  if (!window.docEditor || !event.detail) return;

  const message = event.detail;
  console.log('[Editor] Handling parent message:', message.type);

  switch (message.type) {
    case 'setContent':
      window.docEditor.setContent(message.content);
      break;

    case 'setEditable':
      window.docEditor.setEditable(message.editable);
      break;

    case 'getState':
      const state = window.docEditor.getState();
      if (state && window.sendToParent) {
        window.sendToParent({
          type: 'stateResponse',
          doc: state
        });
      }
      break;

    case 'scrollToBottom':
      // Scroll the editor to bottom
      if (window.docEditor.editorView) {
        const editorDom = window.docEditor.editorView.dom;
        editorDom.scrollTop = editorDom.scrollHeight;
      }
      break;

    case 'focusEditor':
      // Focus the editor
      if (window.docEditor.editorView) {
        window.docEditor.editorView.focus();
      }
      break;

    case 'updateGeoMark':
      // Update a geo-mark with new attributes
      console.log('[Editor] Received updateGeoMark message');

      if (message.params && message.params.geoId && message.params.updatedAttrs) {
        console.log('[Editor] Calling updateGeoMark with geoId:', message.params.geoId);

        window.docEditor.updateGeoMark(
          message.params.geoId,
          message.params.updatedAttrs
        );
      } else {
        console.error('[Editor] updateGeoMark missing required params:', message);
      }
      break;

    default:
      console.log('[Editor] Unknown message type:', message.type);
  }
});
