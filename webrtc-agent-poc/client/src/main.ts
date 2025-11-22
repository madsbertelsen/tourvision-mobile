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

// Generate random user identity for testing with multiple tabs
// Each tab gets a different number and color
const userNumber = Math.floor(Math.random() * 10) + 1; // 1-10
const userColor = COLORS[userNumber - 1]; // Use same index as user number
const userName = isAgent ? 'Agent' : `User ${userNumber}`;
const userDisplayColor = isAgent ? '#10b981' : userColor;

console.log('[Main] User identity:', { userName, userDisplayColor });

// Update UI
const modeIndicator = document.getElementById('mode-indicator');
const docInfo = document.getElementById('doc-info');
const statusEl = document.getElementById('status');

if (modeIndicator) {
  const badge = document.createElement('span');
  badge.className = `mode-badge ${isAgent ? 'agent' : 'user'}`;
  badge.style.backgroundColor = userDisplayColor;
  badge.style.color = 'white';
  badge.textContent = userName;
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
    signaling: [
      // Use production signaling server (wss for secure WebSocket)
      'wss://webrtc-agent-poc-signaling.mads-9b9.workers.dev/signaling/' + documentId
    ],
    // Enable password for room isolation (optional)
    password: null,
  });

  // Get awareness instance from provider (automatically created)
  const awareness = provider.awareness;
  globalAwareness = awareness; // Store globally for window functions

  // Set local user info with pre-generated identity
  awareness.setLocalStateField('user', {
    name: userName,
    color: userDisplayColor,
    mapBounds: null, // Will be set when user opens fullscreen map
  });

  console.log('[Awareness] Local user set:', { name: userName, color: userDisplayColor });

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

  // Listen for awareness changes to show other users' map bounds
  awareness.on('change', ({ added, updated, removed }: any) => {
    console.log('[Awareness] Change event:', { added, updated, removed });

    // Handle added users
    added.forEach((clientId: number) => {
      if (clientId === awareness.clientID) return; // Skip own client

      const state = awareness.getStates().get(clientId);
      if (state?.user?.mapBounds) {
        console.log('[Awareness] User added with map bounds:', clientId, state.user);
        addBoundsOverlay(clientId, state.user.mapBounds, state.user.color);
      }
    });

    // Handle updated users
    updated.forEach((clientId: number) => {
      if (clientId === awareness.clientID) return; // Skip own client

      const state = awareness.getStates().get(clientId);
      if (state?.user?.mapBounds) {
        console.log('[Awareness] User updated map bounds:', clientId);
        updateBoundsOverlay(clientId, state.user.mapBounds, state.user.color);
      } else {
        console.log('[Awareness] User closed fullscreen map:', clientId);
        removeBoundsOverlay(clientId);
      }
    });

    // Handle removed users (disconnected)
    removed.forEach((clientId: number) => {
      console.log('[Awareness] User removed:', clientId);
      removeBoundsOverlay(clientId);
    });
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

// Global fullscreen map variable
let fullscreenMap: mapboxgl.Map | null = null;
let fullscreenMapUpdateListener: (() => void) | null = null;

// Global geo-mark change listeners
const geoMarkChangeListeners: Set<() => void> = new Set();
const notifyGeoMarkChange = () => {
  geoMarkChangeListeners.forEach(listener => listener());
};

// Global transport edit mode state
let transportEditModeGeoId: string | null = null;

// Global awareness variable (for map bounds tracking)
let globalAwareness: any = null;

// Storage for previous bounds (for animation)
const previousBounds: Map<number, any> = new Map();

// Storage for active animation frames (for cancellation)
const activeAnimations: Map<number, number> = new Map();

// Helper function to create marker elements
function createMarkerElement(colorIndex: number) {
  const bgColor = COLORS[colorIndex % COLORS.length];
  const el = document.createElement('div');
  el.style.cssText = `
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background-color: ${bgColor};
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    user-select: none;
    pointer-events: auto;
    -webkit-tap-highlight-color: transparent;
  `;

  const inner = document.createElement('div');
  inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white; pointer-events: none;';
  el.appendChild(inner);

  return el;
}

// Declare global variable to store current editor view
let globalEditorView: EditorView | null = null;

// Helper function to build waypoints string for Mapbox Directions API
function buildWaypointsString(waypoints: Array<{ lat: number; lng: number }> = []): string {
  if (!waypoints || waypoints.length === 0) return '';
  return ';' + waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
}

// Global storage for waypoint markers
const waypointMarkers: Map<string, mapboxgl.Marker[]> = new Map();

// Helper function to render waypoint markers on the map
// destGeoId: The geo-mark that owns these waypoints (destination of the route)
function renderWaypointMarkers(map: mapboxgl.Map, destGeoId: string, waypoints: Array<{ lat: number; lng: number }>, color: string) {
  // Remove existing markers for this destination
  const markerKey = `waypoints-${destGeoId}`;
  const existingMarkers = waypointMarkers.get(markerKey) || [];
  existingMarkers.forEach(marker => marker.remove());

  // Create new markers
  const markers = waypoints.map((waypoint, index) => {
    // Create marker element
    const el = document.createElement('div');
    el.className = 'waypoint-marker';
    el.style.cssText = `
      width: 28px;
      height: 28px;
      border-radius: 14px;
      background-color: #F59E0B;
      border: 2px solid #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      cursor: grab;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    el.textContent = String(index + 1);

    // Create marker
    const marker = new mapboxgl.Marker({
      element: el,
      draggable: true
    })
      .setLngLat([waypoint.lng, waypoint.lat])
      .addTo(map);

    // Handle drag end
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      console.log('[Waypoint] Dragged to:', lngLat, 'index:', index, 'destGeoId:', destGeoId);

      // Update the waypoint in the destination geo-mark
      if (!globalEditorView) {
        console.error('[Waypoint] globalEditorView is null');
        return;
      }

      let waypointUpdated = false;

      globalEditorView.state.doc.descendants((node, pos) => {
        if (waypointUpdated) return false;

        if (node.isText && node.marks.length > 0) {
          const geoMark = node.marks.find(m => m.type.name === 'geoMark');
          if (geoMark && geoMark.attrs.geoId === destGeoId) {
            console.log('[Waypoint] Found destination geo-mark, updating waypoint', index);
            const currentWaypoints = [...(geoMark.attrs.waypoints || [])];
            currentWaypoints[index] = { lat: lngLat.lat, lng: lngLat.lng };

            const updatedMark = globalEditorView.state.schema.marks.geoMark.create({
              ...geoMark.attrs,
              waypoints: currentWaypoints
            });

            const tr = globalEditorView.state.tr
              .removeMark(pos, pos + node.nodeSize, globalEditorView.state.schema.marks.geoMark)
              .addMark(pos, pos + node.nodeSize, updatedMark);

            globalEditorView.dispatch(tr);
            console.log('[Waypoint] Updated waypoint', index, 'to:', { lat: lngLat.lat, lng: lngLat.lng });
            notifyGeoMarkChange();
            waypointUpdated = true;
            return false;
          }
        }
      });

      if (!waypointUpdated) {
        console.error('[Waypoint] Failed to find destination geo-mark:', destGeoId);
      }
    });

    return marker;
  });

  waypointMarkers.set(markerKey, markers);
}

// Extract locations from document (for fullscreen map)
function extractLocationsForFullscreen() {
  if (!globalEditorView) return [];

  const locations: any[] = [];
  globalEditorView.state.doc.descendants((node) => {
    if (node.isText && node.marks.length > 0) {
      for (const mark of node.marks) {
        if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
          const colorIndex = mark.attrs.colorIndex ?? 0;
          locations.push({
            geoId: mark.attrs.geoId,
            displayText: mark.attrs.displayText || node.text,
            placeName: mark.attrs.placeName,
            lat: parseFloat(mark.attrs.lat),
            lng: parseFloat(mark.attrs.lng),
            colorIndex: colorIndex,
            color: COLORS[colorIndex % COLORS.length],
            transportFrom: mark.attrs.transportFrom,
            transportProfile: mark.attrs.transportProfile,
            waypoints: mark.attrs.waypoints || [],
          });
        }
      }
    }
  });
  return locations;
}

// Show fullscreen map (using existing overlay from HTML)
(window as any).showFullscreenMap = () => {
  console.log('[Fullscreen] Showing fullscreen map');

  // Notify parent that fullscreen map is opening
  const openMessage = { type: 'fullscreenMapOpened' };
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(openMessage));
  } else if (window.parent !== window) {
    window.parent.postMessage(openMessage, '*');
  }
  console.log('[Fullscreen] Sent fullscreenMapOpened message to parent');

  // Extract locations from document
  const currentLocations = extractLocationsForFullscreen();

  if (currentLocations.length === 0) {
    console.warn('[Fullscreen] No locations found to display');
    return;
  }

  // Find the first map container in the document to get its position
  const mapContainers = document.querySelectorAll('.prosemirror-map');
  if (mapContainers.length === 0) {
    console.warn('[Fullscreen] No map container found');
    return;
  }

  const blockMapElement = mapContainers[0] as any;
  const rect = blockMapElement.getBoundingClientRect();

  // Calculate padding for alignment reference
  const padding = {
    top: rect.top,
    left: rect.left,
    right: window.innerWidth - rect.right,
    bottom: window.innerHeight - rect.bottom
  };

  console.log('[Fullscreen] Container rect:', rect);
  console.log('[Fullscreen] Alignment padding:', padding);

  // Get block map instance
  const blockMap = blockMapElement._mapInstance;
  if (!blockMap) {
    console.error('[Fullscreen] Block map instance not found');
    return;
  }

  // Calculate adjusted bounds that account for the fullscreen viewport
  // We use the block map's unproject to find geographic coordinates
  // at the fullscreen viewport edges, accounting for the block map's position

  // The block map's pixel coordinates relative to viewport
  const blockMapPixels = {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom
  };

  // Fullscreen viewport edges in the block map's coordinate system
  // Negative values mean "outside" the block map
  const fsTopLeftInBlockMap = {
    x: -blockMapPixels.left,
    y: -blockMapPixels.top
  };
  const fsBottomRightInBlockMap = {
    x: window.innerWidth - blockMapPixels.left,
    y: window.innerHeight - blockMapPixels.top
  };

  // Unproject these to get geographic coordinates
  const topLeft = blockMap.unproject([fsTopLeftInBlockMap.x, fsTopLeftInBlockMap.y]);
  const bottomRight = blockMap.unproject([fsBottomRightInBlockMap.x, fsBottomRightInBlockMap.y]);

  // Create bounds from these coordinates
  const adjustedBounds = new mapboxgl.LngLatBounds(topLeft, bottomRight);

  console.log('[Fullscreen] Adjusted bounds for fullscreen:', {
    north: adjustedBounds.getNorth(),
    south: adjustedBounds.getSouth(),
    east: adjustedBounds.getEast(),
    west: adjustedBounds.getWest()
  });

  // Show overlay
  const overlay = document.getElementById('fullscreen-overlay');
  if (!overlay) {
    console.error('[Fullscreen] Overlay element not found');
    return;
  }
  overlay.classList.add('visible');

  // Trigger fade-in after DOM update
  setTimeout(() => {
    overlay.classList.add('fade-in');
  }, 10);

  // Initialize fullscreen map
  setTimeout(() => {
    // Remove existing map if any
    if (fullscreenMap) {
      fullscreenMap.remove();
    }

    console.log('[Fullscreen] Creating map with adjusted bounds');

    // Set Mapbox token
    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Create fullscreen map with adjusted bounds (NO padding)
    // The bounds are pre-calculated to achieve the same visual alignment
    fullscreenMap = new mapboxgl.Map({
      container: 'fullscreen-map',
      style: 'mapbox://styles/mapbox/light-v11',
      bounds: adjustedBounds,
      fitBoundsOptions: {
        padding: 0,  // No padding needed - bounds are already adjusted
        duration: 0
      },
      interactive: true,
      trackResize: true,
      fadeDuration: 0
    });

    // Add markers
    fullscreenMap.on('load', () => {
      console.log('[Fullscreen] Map loaded, adding markers');
      currentLocations.forEach((location) => {
        const el = createMarkerElement(location.colorIndex);

        // Create marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([location.lng, location.lat])
          .setPopup(new mapboxgl.Popup().setText(location.placeName))
          .addTo(fullscreenMap!);

        // Add click handler to the actual marker element after it's been added
        const markerElement = marker.getElement();

        // Handler function for both click and touch events
        const handleMarkerInteraction = (e: Event) => {
          console.log('[Fullscreen] Marker interaction triggered:', e.type, location);
          console.log('[Fullscreen] window.ReactNativeWebView exists:', !!window.ReactNativeWebView);
          console.log('[Fullscreen] window.parent !== window:', window.parent !== window);

          // Check if we're in a WebView/iframe context
          const isInWebView = !!window.ReactNativeWebView || window.parent !== window;

          if (isInWebView) {
            // In WebView: prevent default and send postMessage
            e.preventDefault();
            e.stopPropagation();

            // Extract ALL locations from document
            const allLocations = extractLocationsForFullscreen();
            console.log('[Fullscreen] All locations from document:', allLocations);

            const message = {
              type: 'openLocationDetails',
              location: {
                geoId: location.geoId,
                displayText: location.displayText,
                placeName: location.placeName,
                lat: location.lat,
                lng: location.lng,
                colorIndex: location.colorIndex
              },
              allLocations: allLocations // Send all locations to React Native
            };

            console.log('[Fullscreen] Sending message:', message);

            if (window.ReactNativeWebView) {
              console.log('[Fullscreen] Using ReactNativeWebView.postMessage');
              window.ReactNativeWebView.postMessage(JSON.stringify(message));
              console.log('[Fullscreen] Message sent via ReactNativeWebView');
            } else if (window.parent !== window) {
              console.log('[Fullscreen] Using window.parent.postMessage');
              window.parent.postMessage(message, '*');
              console.log('[Fullscreen] Message sent via window.parent');
            }
          } else {
            // In regular browser: let the default Mapbox popup show
            console.log('[Fullscreen] In browser, showing Mapbox popup');
            marker.togglePopup();
          }
        };

        // Listen to both click (browser) and touchend (mobile) events
        markerElement.addEventListener('click', handleMarkerInteraction);
        markerElement.addEventListener('touchend', handleMarkerInteraction);
        console.log('[Fullscreen] Added click and touchend listeners to marker:', location.geoId);
      });

      // Render routes for locations with transport configuration
      console.log('[Routes] Checking for transport configurations...');
      console.log('[Routes] currentLocations at map load:', JSON.stringify(currentLocations, null, 2));
      console.log('[Routes] Locations with transport:', currentLocations.filter(loc => loc.transportFrom || loc.transportProfile));
      currentLocations.forEach(async (toLocation) => {
        if (toLocation.transportFrom && toLocation.transportProfile) {
          const fromLocation = currentLocations.find(loc => loc.geoId === toLocation.transportFrom);
          if (!fromLocation) {
            console.warn('[Routes] Source location not found:', toLocation.transportFrom);
            return;
          }

          console.log(`[Routes] Found transport config: ${fromLocation.placeName} → ${toLocation.placeName} (${toLocation.transportProfile})`);

          try {
            // Determine Mapbox profile
            const profile = toLocation.transportProfile === 'walking' ? 'walking' :
                           toLocation.transportProfile === 'cycling' ? 'cycling' :
                           'driving-traffic';

            // Build waypoints string
            const waypointsStr = buildWaypointsString(toLocation.waypoints);

            // Fetch route from Mapbox Directions API (with waypoints if present)
            const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

            console.log('[Routes] Fetching route from Mapbox...');
            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
              const route = data.routes[0];
              const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

              console.log(`[Routes] Route fetched successfully: ${(route.distance / 1000).toFixed(1)}km, ${Math.round(route.duration / 60)}min`);

              // Add route as GeoJSON source
              fullscreenMap!.addSource(routeId, {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: route.geometry
                }
              });

              // Add route line layer
              fullscreenMap!.addLayer({
                id: routeId,
                type: 'line',
                source: routeId,
                layout: {
                  'line-join': 'round',
                  'line-cap': 'round'
                },
                paint: {
                  'line-color': toLocation.color || '#3B82F6',
                  'line-width': 4,
                  'line-opacity': 0.7
                }
              });

              // Add click handler to route for adding waypoints
              fullscreenMap!.on('click', routeId, (e) => {
                console.log('[Routes] Route clicked:', routeId, e.lngLat);

                // Get the clicked coordinates
                const { lng, lat } = e.lngLat;

                // Add waypoint to the geo-mark
                if (globalEditorView) {
                  // Find the geo-mark for this route's destination
                  const destGeoId = toLocation.geoId;
                  let waypointAdded = false;

                  globalEditorView.state.doc.descendants((node, pos) => {
                    if (waypointAdded) return false;

                    if (node.isText && node.marks.length > 0) {
                      const geoMark = node.marks.find(m => m.type.name === 'geoMark');
                      if (geoMark && geoMark.attrs.geoId === destGeoId) {
                        console.log('[Routes] Found destination geo-mark, adding waypoint');

                        // Get current waypoints or create empty array
                        const currentWaypoints = geoMark.attrs.waypoints || [];
                        const newWaypoints = [...currentWaypoints, { lat, lng }];

                        // Create updated mark
                        const updatedMark = globalEditorView.state.schema.marks.geoMark.create({
                          ...geoMark.attrs,
                          waypoints: newWaypoints
                        });

                        // Update the mark
                        const tr = globalEditorView.state.tr
                          .removeMark(pos, pos + node.nodeSize, globalEditorView.state.schema.marks.geoMark)
                          .addMark(pos, pos + node.nodeSize, updatedMark);

                        globalEditorView.dispatch(tr);
                        console.log('[Routes] Waypoint added:', { lat, lng });

                        // Notify listeners to trigger route recalculation
                        notifyGeoMarkChange();

                        waypointAdded = true;
                        return false;
                      }
                    }
                  });

                  if (!waypointAdded) {
                    console.warn('[Routes] Could not find geo-mark to add waypoint');
                  }
                }
              });

              // Change cursor on hover
              fullscreenMap!.on('mouseenter', routeId, () => {
                fullscreenMap!.getCanvas().style.cursor = 'pointer';
              });
              fullscreenMap!.on('mouseleave', routeId, () => {
                fullscreenMap!.getCanvas().style.cursor = '';
              });

              // Render waypoint markers if waypoints exist
              if (toLocation.waypoints && toLocation.waypoints.length > 0) {
                renderWaypointMarkers(fullscreenMap!, toLocation.geoId!, toLocation.waypoints, toLocation.color || '#3B82F6');
              }

              console.log('[Routes] Route rendered on map:', routeId);
            } else {
              console.warn('[Routes] No route found in Mapbox response');
            }
          } catch (error) {
            console.error('[Routes] Error fetching/rendering route:', error);
          }
        }
      });

      // Listen for map movement to update awareness
      fullscreenMap!.on('moveend', () => {
        console.log('[Fullscreen] Map moveend - updating awareness');
        if (globalAwareness && fullscreenMap) {
          updateMapBoundsAwareness(globalAwareness, fullscreenMap);
        }
      });

      // Use 'idle' event instead of 'load' to ensure map has finished all operations
      // This ensures getBounds() returns the correct bounds after fitBounds completes
      fullscreenMap!.once('idle', () => {
        console.log('[Fullscreen] Map idle - initial bounds update');
        if (globalAwareness && fullscreenMap) {
          updateMapBoundsAwareness(globalAwareness, fullscreenMap);
        }
      });
    });

    // Set up Y.js observer to detect transport configuration changes
    let previousLocationsHash = '';
    const updateRoutesIfChanged = () => {
      if (!fullscreenMap) return;

      const locations = extractLocationsForFullscreen();
      // Create hash of locations including transport attributes and waypoints
      const locationsHash = JSON.stringify(locations.map(loc => ({
        geoId: loc.geoId,
        lat: loc.lat,
        lng: loc.lng,
        transportFrom: loc.transportFrom,
        transportProfile: loc.transportProfile,
        waypoints: loc.waypoints
      })));

      if (locationsHash !== previousLocationsHash) {
        console.log('[Fullscreen] Locations changed, updating routes');
        previousLocationsHash = locationsHash;

        // Update or create routes for locations with transport configuration
        // No need to remove existing sources - we'll update them in place
        console.log('[Fullscreen] Re-rendering routes...');
        locations.forEach(async (toLocation) => {
          if (toLocation.transportFrom && toLocation.transportProfile) {
            const fromLocation = locations.find(loc => loc.geoId === toLocation.transportFrom);
            if (!fromLocation) return;

            try {
              const profile = toLocation.transportProfile === 'walking' ? 'walking' :
                             toLocation.transportProfile === 'cycling' ? 'cycling' :
                             'driving-traffic';

              // Build waypoints string
              const waypointsStr = buildWaypointsString(toLocation.waypoints);

              const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

              const response = await fetch(url);
              const data = await response.json();

              if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

                if (fullscreenMap) {
                  const existingSource = fullscreenMap.getSource(routeId);

                  if (existingSource) {
                    // Update existing source data
                    (existingSource as mapboxgl.GeoJSONSource).setData({
                      type: 'Feature',
                      properties: {},
                      geometry: route.geometry
                    });
                    console.log('[Fullscreen] Route source updated:', routeId);
                  } else {
                    // Add new source and layer
                    fullscreenMap.addSource(routeId, {
                      type: 'geojson',
                      data: {
                        type: 'Feature',
                        properties: {},
                        geometry: route.geometry
                      }
                    });

                    fullscreenMap.addLayer({
                      id: routeId,
                      type: 'line',
                      source: routeId,
                      layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                      },
                      paint: {
                        'line-color': toLocation.color || '#3B82F6',
                        'line-width': 4,
                        'line-opacity': 0.7
                      }
                    });

                    // Add click handler to route for adding waypoints
                    fullscreenMap.on('click', routeId, (e) => {
                      console.log('[Routes] Route clicked:', routeId, e.lngLat);
                      const { lng, lat } = e.lngLat;

                      if (globalEditorView) {
                        const destGeoId = toLocation.geoId;
                        let waypointAdded = false;

                        globalEditorView.state.doc.descendants((node, pos) => {
                          if (waypointAdded) return false;

                          if (node.isText && node.marks.length > 0) {
                            const geoMark = node.marks.find(m => m.type.name === 'geoMark');
                            if (geoMark && geoMark.attrs.geoId === destGeoId) {
                              const currentWaypoints = geoMark.attrs.waypoints || [];
                              const newWaypoints = [...currentWaypoints, { lat, lng }];

                              const updatedMark = globalEditorView.state.schema.marks.geoMark.create({
                                ...geoMark.attrs,
                                waypoints: newWaypoints
                              });

                              const tr = globalEditorView.state.tr
                                .removeMark(pos, pos + node.nodeSize, globalEditorView.state.schema.marks.geoMark)
                                .addMark(pos, pos + node.nodeSize, updatedMark);

                              globalEditorView.dispatch(tr);
                              console.log('[Routes] Waypoint added:', { lat, lng });
                              notifyGeoMarkChange();
                              waypointAdded = true;
                              return false;
                            }
                          }
                        });
                      }
                    });

                    // Change cursor on hover
                    fullscreenMap.on('mouseenter', routeId, () => {
                      fullscreenMap.getCanvas().style.cursor = 'pointer';
                    });
                    fullscreenMap.on('mouseleave', routeId, () => {
                      fullscreenMap.getCanvas().style.cursor = '';
                    });

                    console.log('[Fullscreen] Route created:', routeId);
                  }

                  // Always re-render waypoint markers (whether updating or creating)
                  if (toLocation.waypoints && toLocation.waypoints.length > 0) {
                    renderWaypointMarkers(fullscreenMap, toLocation.geoId!, toLocation.waypoints, toLocation.color || '#3B82F6');
                  }
                }
              }
            } catch (error) {
              console.error('[Fullscreen] Error updating route:', error);
            }
          }
        });
      }
    };

    // Listen to geo-mark changes reactively
    fullscreenMapUpdateListener = updateRoutesIfChanged;
    geoMarkChangeListeners.add(updateRoutesIfChanged);
    console.log('[Fullscreen] Added geo-mark change listener');
  }, 100);
};

// Hide fullscreen map
(window as any).hideFullscreenMap = () => {
  console.log('[Fullscreen] Hiding fullscreen map');

  // Notify parent that fullscreen map is closing
  const closeMessage = { type: 'fullscreenMapClosed' };
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(closeMessage));
  } else if (window.parent !== window) {
    window.parent.postMessage(closeMessage, '*');
  }
  console.log('[Fullscreen] Sent fullscreenMapClosed message to parent');

  // Clear map bounds from awareness
  if (globalAwareness) {
    const currentUser = globalAwareness.getLocalState()?.user || {};
    globalAwareness.setLocalStateField('user', {
      ...currentUser,
      mapBounds: null,
    });
    console.log('[Awareness] Cleared map bounds');
  }

  // Remove geo-mark change listener
  if (fullscreenMapUpdateListener) {
    geoMarkChangeListeners.delete(fullscreenMapUpdateListener);
    fullscreenMapUpdateListener = null;
    console.log('[Fullscreen] Removed geo-mark change listener');
  }

  const overlay = document.getElementById('fullscreen-overlay');
  if (overlay) {
    overlay.classList.remove('fade-in');

    setTimeout(() => {
      overlay.classList.remove('visible');
      if (fullscreenMap) {
        fullscreenMap.remove();
        fullscreenMap = null;
      }
    }, 300);
  }
};

// Helper function to get map bounds
function getVisibleBounds(map: mapboxgl.Map): any {
  // Simply return the map's viewport bounds
  // Since we create the fullscreen map WITHOUT padding, getBounds() returns
  // the correct full viewport bounds for all maps
  const bounds = map.getBounds();

  console.log('[Bounds] Map bounds:', {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest()
  });

  return bounds;
}

// Helper function to update awareness with current map bounds
function updateMapBoundsAwareness(awareness: any, map: mapboxgl.Map) {
  const bounds = getVisibleBounds(map);
  const currentUser = awareness.getLocalState()?.user || {};

  const boundsData = {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  };

  awareness.setLocalStateField('user', {
    ...currentUser,
    mapBounds: boundsData,
  });

  console.log('[Awareness] Updated map bounds:', boundsData);
}

// Add bounds overlay to block maps
function addBoundsOverlay(clientId: number, bounds: any, color: string) {
  console.log('[Overlay] Adding bounds overlay for client', clientId, bounds);

  const mapContainers = document.querySelectorAll('.prosemirror-map');
  mapContainers.forEach((container) => {
    const map = (container as any)._mapInstance;
    if (!map) return;

    const sourceId = `bounds-overlay-${clientId}`;
    const layerId = `bounds-overlay-${clientId}`;
    const outlineId = `bounds-overlay-${clientId}-outline`;

    // Check if overlay already exists
    if (map.getSource(sourceId)) {
      updateBoundsOverlay(clientId, bounds, color);
      return;
    }

    // Create polygon coordinates (rectangle)
    const coordinates = [[
      [bounds.west, bounds.north],  // NW
      [bounds.east, bounds.north],  // NE
      [bounds.east, bounds.south],  // SE
      [bounds.west, bounds.south],  // SW
      [bounds.west, bounds.north],  // Close polygon
    ]];

    // Add GeoJSON source
    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: coordinates,
        },
      },
    });

    // Add fill layer (semi-transparent rectangle)
    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': color,
        'fill-opacity': 0.15,
      },
    });

    // Add outline layer (solid border)
    map.addLayer({
      id: outlineId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': color,
        'line-width': 2,
        'line-opacity': 0.8,
      },
    });
  });

  // Store initial bounds for future animations
  previousBounds.set(clientId, bounds);
}

// Easing function for smooth animation (easeInOutQuad)
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Update bounds overlay immediately (no animation)
function updateBoundsOverlayImmediate(clientId: number, bounds: any) {
  const mapContainers = document.querySelectorAll('.prosemirror-map');
  mapContainers.forEach((container) => {
    const map = (container as any)._mapInstance;
    if (!map) return;

    const sourceId = `bounds-overlay-${clientId}`;
    const source = map.getSource(sourceId);

    if (source) {
      const coordinates = [[
        [bounds.west, bounds.north],
        [bounds.east, bounds.north],
        [bounds.east, bounds.south],
        [bounds.west, bounds.south],
        [bounds.west, bounds.north],
      ]];

      (source as any).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: coordinates,
        },
      });
    }
  });
}

// Animate bounds overlay transition
function animateBoundsOverlay(clientId: number, oldBounds: any, newBounds: any, color: string, duration: number = 300) {
  // Cancel any existing animation for this client
  const existingAnimation = activeAnimations.get(clientId);
  if (existingAnimation) {
    cancelAnimationFrame(existingAnimation);
  }

  const startTime = Date.now();

  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeInOutQuad(progress);

    // Interpolate bounds
    const interpolatedBounds = {
      north: oldBounds.north + (newBounds.north - oldBounds.north) * eased,
      south: oldBounds.south + (newBounds.south - oldBounds.south) * eased,
      east: oldBounds.east + (newBounds.east - oldBounds.east) * eased,
      west: oldBounds.west + (newBounds.west - oldBounds.west) * eased,
    };

    // Update the overlay with interpolated coordinates
    updateBoundsOverlayImmediate(clientId, interpolatedBounds);

    if (progress < 1) {
      // Continue animation
      const frameId = requestAnimationFrame(animate);
      activeAnimations.set(clientId, frameId);
    } else {
      // Animation complete
      activeAnimations.delete(clientId);
      previousBounds.set(clientId, newBounds);
    }
  }

  animate();
}

// Update existing bounds overlay (with animation)
function updateBoundsOverlay(clientId: number, bounds: any, color: string) {
  // Check if we have previous bounds for animation
  const oldBounds = previousBounds.get(clientId);

  // Check if source exists
  const mapContainers = document.querySelectorAll('.prosemirror-map');
  let sourceExists = false;
  mapContainers.forEach((container) => {
    const map = (container as any)._mapInstance;
    if (map && map.getSource(`bounds-overlay-${clientId}`)) {
      sourceExists = true;
    }
  });

  if (!sourceExists) {
    // Source doesn't exist, create it
    addBoundsOverlay(clientId, bounds, color);
    return;
  }

  if (oldBounds) {
    // We have previous bounds, animate the transition
    animateBoundsOverlay(clientId, oldBounds, bounds, color);
  } else {
    // No previous bounds, update immediately
    updateBoundsOverlayImmediate(clientId, bounds);
    previousBounds.set(clientId, bounds);
  }
}

// Remove bounds overlay from block maps
function removeBoundsOverlay(clientId: number) {
  console.log('[Overlay] Removing bounds overlay for client', clientId);

  const mapContainers = document.querySelectorAll('.prosemirror-map');
  mapContainers.forEach((container) => {
    const map = (container as any)._mapInstance;
    if (!map) return;

    const sourceId = `bounds-overlay-${clientId}`;
    const layerId = `bounds-overlay-${clientId}`;
    const outlineId = `bounds-overlay-${clientId}-outline`;

    // Remove layers first, then source
    if (map.getLayer(outlineId)) map.removeLayer(outlineId);
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  });
}

// Map Node View - renders Mapbox maps for map blocks
function createMapNodeView(node: any, editorView: EditorView) {
    const dom = document.createElement('div');
    dom.className = 'prosemirror-map';
    dom.style.cssText = `height: ${node.attrs.height}px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; position: relative; overflow: hidden;`;

    const mapContainer = document.createElement('div');
    mapContainer.style.cssText = 'width: 100%; height: 100%; border-radius: 8px; overflow: hidden;';
    dom.appendChild(mapContainer);

    // Create clickable overlay for fullscreen
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

    clickOverlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if ((window as any).showFullscreenMap) {
        (window as any).showFullscreenMap();
      }
    });

    dom.appendChild(clickOverlay);

    let currentMap: mapboxgl.Map | null = null;
    let currentMarkers: mapboxgl.Marker[] = [];

    // Extract locations from document
    const extractLocations = () => {
      const locations: any[] = [];
      editorView.state.doc.descendants((node) => {
        if (node.isText && node.marks.length > 0) {
          for (const mark of node.marks) {
            if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
              const colorIndex = mark.attrs.colorIndex ?? 0;
              locations.push({
                geoId: mark.attrs.geoId,
                displayText: mark.attrs.displayText || node.text,
                placeName: mark.attrs.placeName,
                lat: parseFloat(mark.attrs.lat),
                lng: parseFloat(mark.attrs.lng),
                colorIndex: colorIndex,
                color: COLORS[colorIndex % COLORS.length],
                transportFrom: mark.attrs.transportFrom,
                transportProfile: mark.attrs.transportProfile,
                waypoints: mark.attrs.waypoints || [],
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

        // Store map instance on DOM for fullscreen access
        (dom as any)._mapInstance = currentMap;

        currentMap.once('style.load', () => {
          // Add markers
          locations.forEach((location: any) => {
            const el = createMarkerElement(location.colorIndex);

            const marker = new mapboxgl.Marker(el)
              .setLngLat([location.lng, location.lat])
              .setPopup(new mapboxgl.Popup().setText(location.placeName))
              .addTo(currentMap!);

            currentMarkers.push(marker);
          });

          // Render routes for locations with transport configuration
          console.log('[BlockMap] Checking for transport configurations...');
          locations.forEach(async (toLocation: any) => {
            if (toLocation.transportFrom && toLocation.transportProfile) {
              const fromLocation = locations.find((loc: any) => loc.geoId === toLocation.transportFrom);
              if (!fromLocation) {
                console.warn('[BlockMap] Source location not found:', toLocation.transportFrom);
                return;
              }

              console.log(`[BlockMap] Found transport config: ${fromLocation.placeName} → ${toLocation.placeName} (${toLocation.transportProfile})`);

              try {
                // Determine Mapbox profile
                const profile = toLocation.transportProfile === 'walking' ? 'walking' :
                               toLocation.transportProfile === 'cycling' ? 'cycling' :
                               'driving-traffic';

                // Build waypoints string
                const waypointsStr = buildWaypointsString(toLocation.waypoints);

                // Fetch route from Mapbox Directions API (with waypoints if present)
                const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

                const response = await fetch(url);
                const data = await response.json();

                if (data.routes && data.routes.length > 0) {
                  const route = data.routes[0];
                  const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

                  console.log(`[BlockMap] Route fetched: ${(route.distance / 1000).toFixed(1)}km`);

                  // Add route as GeoJSON source
                  if (currentMap && !currentMap.getSource(routeId)) {
                    currentMap.addSource(routeId, {
                      type: 'geojson',
                      data: {
                        type: 'Feature',
                        properties: {},
                        geometry: route.geometry
                      }
                    });

                    // Add route line layer
                    currentMap.addLayer({
                      id: routeId,
                      type: 'line',
                      source: routeId,
                      layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                      },
                      paint: {
                        'line-color': toLocation.color || '#3B82F6',
                        'line-width': 3,
                        'line-opacity': 0.7
                      }
                    });

                    console.log('[BlockMap] Route rendered:', routeId);
                  }
                } else {
                  console.warn('[BlockMap] No route found in Mapbox response');
                }
              } catch (error) {
                console.error('[BlockMap] Error fetching/rendering route:', error);
              }
            }
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

  // Set up reactive updates to detect new geo marks and transport changes
  let previousLocationsHash = '';
  const updateMapIfChanged = () => {
    const locations = extractLocations();
    // Create hash of locations including transport attributes and waypoints
    const locationsHash = JSON.stringify(locations.map(loc => ({
      geoId: loc.geoId,
      lat: loc.lat,
      lng: loc.lng,
      transportFrom: loc.transportFrom,
      transportProfile: loc.transportProfile,
      waypoints: loc.waypoints
    })));

    if (locationsHash !== previousLocationsHash) {
      console.log('[MapView] Locations changed, updating map');
      previousLocationsHash = locationsHash;

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
          const el = createMarkerElement(location.colorIndex);

          const marker = new mapboxgl.Marker(el)
            .setLngLat([location.lng, location.lat])
            .setPopup(new mapboxgl.Popup().setText(location.placeName))
            .addTo(currentMap!);

          currentMarkers.push(marker);
        });

        // Update or create routes for locations with transport configuration
        // No need to remove existing sources - we'll update them in place
        console.log('[BlockMap] Updating routes...');
        locations.forEach(async (toLocation: any) => {
          if (toLocation.transportFrom && toLocation.transportProfile) {
            const fromLocation = locations.find((loc: any) => loc.geoId === toLocation.transportFrom);
            if (!fromLocation) return;

            try {
              const profile = toLocation.transportProfile === 'walking' ? 'walking' :
                             toLocation.transportProfile === 'cycling' ? 'cycling' :
                             'driving-traffic';

              // Build waypoints string
              const waypointsStr = buildWaypointsString(toLocation.waypoints);

              const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

              const response = await fetch(url);
              const data = await response.json();

              if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

                if (currentMap) {
                  const existingSource = currentMap.getSource(routeId);

                  if (existingSource) {
                    // Update existing source data
                    (existingSource as mapboxgl.GeoJSONSource).setData({
                      type: 'Feature',
                      properties: {},
                      geometry: route.geometry
                    });
                    console.log('[BlockMap] Route source updated:', routeId);
                  } else {
                    // Add new source and layer
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
                        'line-color': toLocation.color || '#3B82F6',
                        'line-width': 3,
                        'line-opacity': 0.7
                      }
                    });

                    console.log('[BlockMap] Route created:', routeId);
                  }
                }
              }
            } catch (error) {
              console.error('[BlockMap] Error updating route:', error);
            }
          }
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
  };

  // Listen to geo-mark changes reactively
  geoMarkChangeListeners.add(updateMapIfChanged);

  return {
    dom,
    update(newNode: any) {
      if (newNode.type.name !== 'map') return false;
      updateMap();
      return true;
    },
    destroy() {
      // Remove geo-mark change listener
      geoMarkChangeListeners.delete(updateMapIfChanged);
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

  // Store global reference for fullscreen map
  globalEditorView = view;

  console.log('[Main] ProseMirror editor initialized with Y.js sync');

  // Send ready message to parent (WebView/iframe)
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  } else if (window.parent !== window) {
    window.parent.postMessage({ type: 'ready' }, '*');
  }
  console.log('[Main] Sent ready message to parent');

  // Listen for messages from parent (React Native WebView)
  window.addEventListener('message', (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      console.log('[Main] Received message from parent:', data);

      switch (data.type) {
        case 'createGeoMark':
          console.log('[Main] Creating geo-mark for selected text');
          createGeoMark(view);
          break;

        case 'insertMap':
          console.log('[Main] Inserting map block');
          insertMap(view);
          break;

        case 'updateGeoMark':
          console.log('[Main] Updating geo-mark:', data.geoId, data.updatedAttrs);
          // Find and update the geo-mark in the document
          const { geoId, updatedAttrs } = data;
          let found = false;

          view.state.doc.descendants((node, pos) => {
            if (found) return false; // Stop searching once found

            if (node.isText && node.marks.length > 0) {
              const geoMark = node.marks.find(m => m.type.name === 'geoMark');
              if (geoMark && geoMark.attrs.geoId === geoId) {
                console.log('[Main] Found geo-mark at position:', pos);
                console.log('[Main] Current attrs:', geoMark.attrs);

                // Create updated mark with new attributes
                const updatedMark = view.state.schema.marks.geoMark.create({
                  ...geoMark.attrs,
                  ...updatedAttrs
                });

                // Create transaction to update the mark
                const tr = view.state.tr.removeMark(
                  pos,
                  pos + node.nodeSize,
                  view.state.schema.marks.geoMark
                ).addMark(
                  pos,
                  pos + node.nodeSize,
                  updatedMark
                );

                view.dispatch(tr);
                console.log('[Main] Geo-mark updated successfully');
                console.log('[Main] New attrs:', updatedMark.attrs);

                // Notify listeners that geo-marks changed
                notifyGeoMarkChange();

                found = true;
                return false;
              }
            }
          });

          if (!found) {
            console.warn('[Main] Geo-mark not found:', geoId);
          }
          break;

        case 'enterTransportEditMode':
          console.log('[Main] Entering transport edit mode for:', data.geoId);
          transportEditModeGeoId = data.geoId;
          // Show info banner or visual feedback
          console.log('[Main] Transport edit mode enabled - routes are clickable');
          break;

        case 'exitTransportEditMode':
          console.log('[Main] Exiting transport edit mode');
          transportEditModeGeoId = null;
          break;

        default:
          console.log('[Main] Unknown command:', data.type);
      }
    } catch (error) {
      console.error('[Main] Error handling message from parent:', error);
    }
  });

  // Track selection changes and send to parent
  const sendSelectionUpdate = () => {
    const { from, to } = view.state.selection;
    const hasSelection = from !== to;

    const message = {
      type: 'selectionChange',
      hasSelection
    };

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (window.parent !== window) {
      window.parent.postMessage(message, '*');
    }

    console.log('[Main] Selection changed:', { hasSelection, from, to });
  };

  // Send initial selection state
  sendSelectionUpdate();

  // Update on selection change
  view.dom.addEventListener('mouseup', sendSelectionUpdate);
  view.dom.addEventListener('keyup', sendSelectionUpdate);
  view.dom.addEventListener('touchend', sendSelectionUpdate);

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

  // Open agent tab (user mode only, and only if enableAgent=true)
  const enableAgent = params.get('enableAgent') === 'true';
  if (!isAgent && enableAgent) {
    console.log('[Main] enableAgent=true, opening agent tab');
    openAgentTab(awareness);
  } else if (!isAgent) {
    console.log('[Main] Agent tab disabled (enableAgent not set to true)');
  }

  // Set up toolbar button handlers
  setupToolbarButtons(editor);

  // Watch for remote Y.js changes to trigger block map updates
  // This ensures that when other clients add/modify geo-marks, local block maps update
  yXmlFragment.observeDeep((events, transaction) => {
    // Only trigger for remote changes (not local changes - those already call notifyGeoMarkChange)
    if (!transaction.local) {
      console.log('[Y.js] Remote document change detected, notifying listeners');
      notifyGeoMarkChange();
    }
  });

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

  // Notify listeners that a new geo-mark was created
  notifyGeoMarkChange();
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
  const newDocBtn = document.getElementById('new-doc-btn');
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
  if (newDocBtn) {
    newDocBtn.addEventListener('click', () => {
      // Generate a new random document ID
      const newDocId = 'doc-' + Math.random().toString(36).substring(2, 15);
      console.log('[Main] Creating new document:', newDocId);

      // Redirect to new document
      const url = new URL(window.location.href);
      url.searchParams.set('doc', newDocId);
      window.location.href = url.toString();
    });
  }

  if (createGeoMarkBtn) {
    createGeoMarkBtn.addEventListener('click', () => createGeoMark(view));
  }

  if (insertMapBtn) {
    insertMapBtn.addEventListener('click', () => insertMap(view));
  }

  console.log('[Main] Toolbar buttons set up');
}

// Set up close button handler for fullscreen overlay
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if ((window as any).hideFullscreenMap) {
        (window as any).hideFullscreenMap();
      }
    });
  }
});

// Start the application
main().catch((error) => {
  console.error('[Main] Initialization error:', error);
  updateStatus(`Error: ${error.message}`, 'disconnected');
});
