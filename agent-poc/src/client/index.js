import { EditorState } from "prosemirror-state";
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

      // Fetch and draw routes between locations
      if (this.locations.length > 1) {
        for (let i = 1; i < this.locations.length; i++) {
          const from = this.locations[i - 1];
          const to = this.locations[i];

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

      let currentMap = null;
      let currentMarkers = [];

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
      const updateMarkers = (locations) => {
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

        // Animate to fit bounds
        if (locations.length === 1) {
          currentMap.flyTo({
            center: [locations[0].lng, locations[0].lat],
            zoom: 12,
            duration: 1500
          });
        } else if (locations.length > 1) {
          const lngs = locations.map(l => l.lng);
          const lats = locations.map(l => l.lat);
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

        if (!currentMap) {
          mapContainer.innerHTML = '';
          mapboxgl.accessToken = mapboxToken;

          currentMap = new mapboxgl.Map({
            container: mapContainer,
            style: 'mapbox://styles/mapbox/light-v11',
            center: [0, 0],
            zoom: 2
          });

          currentMap.on('load', () => {
            updateMarkers(locations);
          });
        } else {
          // Map already exists, just update markers
          updateMarkers(locations);
        }
      };

      setTimeout(renderMap, 100);

      // Listen for document changes
      const updateInterval = setInterval(() => {
        if (this.editorView) {
          renderMap();
        }
      }, 1000);

      return {
        dom,
        update: () => {
          renderMap();
          return true;
        },
        destroy: () => {
          clearInterval(updateInterval);
          if (currentMap) {
            currentMap.remove();
          }
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
}

// Start the app
window.docEditor = new DocumentEditor();
