import { EditorState } from "prosemirror-state";
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from "y-prosemirror";
import YProvider from "../y-partyserver/provider";
import * as Y from "yjs";
import { IndexeddbPersistence } from 'y-indexeddb';
import { customSchema } from "../prosemirror-schema";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// WebSocket configuration (same as client)
const WS_PROTOCOL = import.meta.env.VITE_WS_PROTOCOL || "ws";
const WS_HOST = import.meta.env.VITE_WS_HOST || "localhost";
const WS_PORT = import.meta.env.VITE_WS_PORT || "8787";

const WS_URL = import.meta.env.VITE_WS_PORT
  ? `${WS_PROTOCOL}://${WS_HOST}:${WS_PORT}`
  : `${WS_PROTOCOL}://${WS_HOST}`;

console.log('[Map] WebSocket URL:', WS_URL);

// Color palette for location markers (must match client)
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const docId = urlParams.get('doc');

// UI Elements
const mapContainer = document.getElementById('map');
const loadingDiv = document.getElementById('loading');
const loadingText = loadingDiv?.querySelector('.loading-text');
const mapTitle = document.getElementById('map-title');
const closeBtn = document.getElementById('close-btn');

// Handle close button
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    // Navigate back to editor
    window.location.href = `/?doc=${docId}`;
  });
}

// Show error message
function showError(message) {
  if (loadingText) {
    loadingText.textContent = message;
    loadingText.style.color = '#EF4444';
  }
  console.error('[Map]', message);
}

// Hide loading indicator
function hideLoading() {
  if (loadingDiv) {
    loadingDiv.style.display = 'none';
  }
}

// Extract locations from ProseMirror document
// THIS IS THE KEY - copied directly from client/index.js lines 834-857
function extractLocations(editorState) {
  const locations = [];
  editorState.doc.descendants((node) => {
    if (node.isText && node.marks.length > 0) {
      for (const mark of node.marks) {
        if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
          locations.push({
            geoId: mark.attrs.geoId,
            displayText: mark.attrs.displayText || node.text,  // Use displayText if available, fallback to node text
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
  console.log('[Map] Extracted locations:', locations.length);
  return locations;
}

// Initialize map
async function initMap() {
  if (!docId) {
    showError('No document ID provided');
    return;
  }

  console.log('[Map] Initializing map for document:', docId);

  try {
    // Create Y.js document
    const ydoc = new Y.Doc();
    const indexeddbProvider = new IndexeddbPersistence(docId, ydoc);

    // Connect to WebSocket server (same as client)
    console.log('[Map] Connecting to WebSocket:', WS_URL);
    const provider = new YProvider(WS_URL, docId, ydoc, {
      party: 'document',
      WebSocketPolyfill: WebSocket,
      connect: true
    });

    // Wait for sync
    await new Promise((resolve) => {
      if (provider.synced) {
        console.log('[Map] Already synced');
        resolve();
      } else {
        provider.on('synced', () => {
          console.log('[Map] Document synced');
          resolve();
        });
      }
    });

    // Get Y.js XML fragment (same as client)
    const yXmlFragment = ydoc.getXmlFragment('prosemirror');

    // IMPORTANT: We need an actual EditorView for Y.js sync to work properly
    // Create a hidden div to mount the editor
    const hiddenEditorDiv = document.createElement('div');
    hiddenEditorDiv.style.display = 'none';
    document.body.appendChild(hiddenEditorDiv);

    // Import EditorView
    const { EditorView } = await import("prosemirror-view");

    // Create EditorView (same as client - Y.js sync requires a view to work properly)
    const editorView = new EditorView(hiddenEditorDiv, {
      state: EditorState.create({
        schema: customSchema,
        plugins: [
          ySyncPlugin(yXmlFragment),
          yCursorPlugin(provider.awareness),
          yUndoPlugin()
        ]
      })
    });

    console.log('[Map] EditorView created');

    // Wait a bit for Y.js sync plugin to populate the EditorView
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('[Map] Document content:', editorView.state.doc.toJSON());

    // Extract locations using the EXACT same function as client
    const locations = extractLocations(editorView.state);
    console.log('[Map] Extracted locations:', locations);

    if (locations.length === 0) {
      showError('No locations found in document');
      return;
    }

    // Update map title
    if (mapTitle) {
      mapTitle.textContent = `Map View (${locations.length} location${locations.length !== 1 ? 's' : ''})`;
    }

    // Initialize Mapbox
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [locations[0].lng, locations[0].lat],
      zoom: 12
    });

    console.log('[Map] Mapbox initialized');

    // Wait for map to load
    map.on('load', () => {
      console.log('[Map] Mapbox loaded');
      hideLoading();

      // Add markers
      locations.forEach((location) => {
        const bgColor = COLORS[location.colorIndex % COLORS.length];
        const el = document.createElement('div');
        el.style.cssText = `width: 40px; height: 40px; border-radius: 50%; background-color: ${bgColor}; border: 4px solid white; box-shadow: 0 3px 10px rgba(0,0,0,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center;`;

        const inner = document.createElement('div');
        inner.style.cssText = 'width: 16px; height: 16px; border-radius: 50%; background-color: white;';
        el.appendChild(inner);

        const marker = new mapboxgl.Marker(el)
          .setLngLat([location.lng, location.lat])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <div style="font-weight: 600; margin-bottom: 4px;">${location.displayText}</div>
              <div style="font-size: 12px; color: #6b7280;">${location.placeName}</div>
            </div>
          `))
          .addTo(map);

        console.log('[Map] Added marker for:', location.placeName);
      });

      // Fit bounds to show all markers
      if (locations.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        locations.forEach(loc => bounds.extend([loc.lng, loc.lat]));
        map.fitBounds(bounds, { padding: 50 });
      }

      // Draw routes if waypoints exist
      locations.forEach((location, index) => {
        if (!location.waypoints || location.waypoints.length === 0) return;

        const sourceId = `route-${location.geoId}`;
        const layerId = `route-layer-${location.geoId}`;

        // Create GeoJSON from waypoints
        const coordinates = location.waypoints.map(wp => [wp[0], wp[1]]);

        // Add route source and layer
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            }
          }
        });

        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': COLORS[location.colorIndex % COLORS.length],
            'line-width': 4,
            'line-opacity': 0.8
          }
        });

        console.log('[Map] Added route for:', location.placeName);
      });
    });

  } catch (error) {
    console.error('[Map] Initialization error:', error);
    showError(`Failed to load map: ${error.message}`);
  }
}

// Start initialization
initMap().catch((error) => {
  console.error('[Map] Fatal error:', error);
  showError(`Fatal error: ${error.message}`);
});
