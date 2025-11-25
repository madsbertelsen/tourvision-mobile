import { type Component, createEffect, createSignal, onCleanup, Show, For } from 'solid-js';
import { useParams } from '@solidjs/router';
import mapboxgl from 'mapbox-gl';
import { getFullscreenMapStore, type CameraState } from '../../stores/fullscreenMap';
import { getCollaborationStore } from '../../stores/collaboration';
import { getFollowModeStore } from '../../stores/followMode';
import { getEditorStore } from '../../stores/editor';
import { getLocationsStore, type Location } from '../../stores/locations';
import { getDocumentStore } from '../../stores/document';
import { reverseGeocode } from '../../lib/geocoding';
import { COLORS } from '../../lib/prosemirror-schema';
import { addRouteToMap, removeRouteFromMap, fetchRoute } from '../../lib/mapbox';
import { LocationDetailSheet } from './LocationDetailSheet';
import {
  addAwarenessLayer,
  updateAwarenessLayer,
  removeAwarenessLayer,
  hasAwarenessLayer,
  getViewportCorners,
  getLayerIds
} from '../../lib/mapAwarenessLayers';
import styles from './FullscreenMap.module.scss';

// Available map styles
const MAP_STYLES = [
  { id: 'light', label: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
  { id: 'dark', label: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
  { id: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
  { id: 'outdoors', label: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
] as const;

type MapStyleId = typeof MAP_STYLES[number]['id'];

// TypeScript declaration for global map callbacks
declare global {
  interface Window {
    mapRenderCallbacks?: Array<() => void>;
  }
}

interface FullscreenMapProps {
  locations: Location[];
}

interface Follower {
  name: string;
  color: string;
}

// Extend mapboxgl.Map type to include our cleanup function
interface ExtendedMap extends mapboxgl.Map {
  _awarenessCleanup?: () => void;
}

export const FullscreenMap: Component<FullscreenMapProps> = (props) => {
  const params = useParams<{ docId: string; mapId?: string; locId?: string }>();
  const fullscreenMapStore = getFullscreenMapStore();
  const collaboration = getCollaborationStore();
  const followModeStore = getFollowModeStore();
  const documentStore = getDocumentStore();
  let mapContainer: HTMLDivElement | undefined;
  let map: ExtendedMap | undefined;

  // Track current route layer ID for cleanup
  const ROUTE_LAYER_ID = 'transport-route';

  // Track active awareness layers for cleanup
  const activeUserIds = new Set<string>();

  // Track users who are following me
  const [followers, setFollowers] = createSignal<Follower[]>([]);

  // Track marker creation state
  const [isAddingMarker, setIsAddingMarker] = createSignal(false);
  const [pendingMarker, setPendingMarker] = createSignal<mapboxgl.Marker | null>(null);

  // Track current map style
  const [currentStyle, setCurrentStyle] = createSignal<MapStyleId>('light');

  // Track current markers for updates
  let currentMarkers: mapboxgl.Marker[] = [];

  // Store the updateMarkers function so we can call it from effects
  let updateMarkersRef: ((locations: Location[]) => void) | null = null;
  let mapRenderCallback: (() => void) | null = null;

  const handleClose = () => {
    // Remove pending marker if exists
    const marker = pendingMarker();
    if (marker) {
      marker.remove();
      setPendingMarker(null);
    }
    // Hide fullscreen map state and navigate back
    fullscreenMapStore.hideFullscreenMap();
    documentStore.closeFullscreenMap();
  };

  // Handle map style change
  const handleStyleChange = (styleId: MapStyleId) => {
    if (!map || styleId === currentStyle()) return;

    const style = MAP_STYLES.find(s => s.id === styleId);
    if (!style) return;

    setCurrentStyle(styleId);
    map.setStyle(style.url);

    // Re-add markers after style loads (setStyle removes all layers)
    map.once('style.load', () => {
      if (updateMarkersRef) {
        const locationsStore = getLocationsStore();
        updateMarkersRef(locationsStore.state.locations);
      }
    });

    // Broadcast style change via awareness
    const corners = getViewportCorners(map);
    const camera: CameraState = {
      center: [map.getCenter().lng, map.getCenter().lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing()
    };
    fullscreenMapStore.updateAwareness(corners, camera, styleId);
  };

  // Handle double-click to add marker
  const handleMapDoubleClick = async (e: mapboxgl.MapMouseEvent) => {
    if (isAddingMarker()) return;

    const state = fullscreenMapStore.state();
    const mapDocPos = parseInt(state.blockMapElement?.dataset?.docPos || '0');

    if (!mapDocPos) {
      console.error('[FullscreenMap] No document position for map');
      return;
    }

    const { lng, lat } = e.lngLat;
    console.log('[FullscreenMap] Double-click at:', lng, lat);

    setIsAddingMarker(true);

    // Add a temporary marker while processing
    const tempEl = document.createElement('div');
    tempEl.style.cssText = `
      width: 32px; height: 32px; border-radius: 50%;
      background-color: #9CA3AF; border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      animation: pulse 1s infinite;
    `;
    const inner = document.createElement('div');
    inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white;';
    tempEl.appendChild(inner);

    const tempMarker = new mapboxgl.Marker(tempEl)
      .setLngLat([lng, lat])
      .addTo(map!);
    setPendingMarker(tempMarker);

    try {
      // Reverse geocode to get place name
      const result = await reverseGeocode(lat, lng);
      const placeName = result?.displayName || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      console.log('[FullscreenMap] Reverse geocode result:', placeName);

      // Add geo-mark to document
      const editorStore = getEditorStore();
      const success = editorStore.addGeoMarkAtMapPosition(mapDocPos, lat, lng, placeName);

      if (success) {
        console.log('[FullscreenMap] Marker added successfully');
        // The map will auto-update via the callback system
      } else {
        console.error('[FullscreenMap] Failed to add marker to document');
      }
    } catch (error) {
      console.error('[FullscreenMap] Error adding marker:', error);
    } finally {
      // Remove temp marker (the real one will appear from document update)
      tempMarker.remove();
      setPendingMarker(null);
      setIsAddingMarker(false);
    }
  };

  // Handle invite button click
  const handleInviteClick = () => {
    if (followModeStore.isInviting()) {
      followModeStore.cancelInvitation();
    } else {
      const state = fullscreenMapStore.state();
      const mapDocPos = parseInt(state.blockMapElement?.dataset?.docPos || '0');
      followModeStore.sendInvitation(mapDocPos);
    }
  };

  // Initialize map when visible
  createEffect(() => {
    const state = fullscreenMapStore.state();

    if (state.isVisible && mapContainer && state.blockMapOffset) {
      console.log('[FullscreenMap] Initializing Mapbox map');

      // Refresh locations from document to ensure we have latest transport settings
      const editorStore = getEditorStore();
      const view = editorStore.editorView();
      if (view) {
        console.log('[FullscreenMap] Refreshing locations from document on map open');
        locationsStoreForRoutes.updateLocations(view);
      }

      // Small delay to ensure overlay is rendered and we can measure it
      requestAnimationFrame(() => {
        const fullscreenRect = mapContainer!.getBoundingClientRect();
        const offset = state.blockMapOffset!;
        const blockMapEl = state.blockMapElement as HTMLElement & { _mapInstance?: mapboxgl.Map };
        const blockMap = blockMapEl?._mapInstance;

        // Calculate center: use block map if available, otherwise default
        let computedCenter: mapboxgl.LngLat | [number, number] = [0, 20]; // Default world view
        let computedZoom = 2; // Default zoom

        if (blockMap && blockMap.loaded()) {
          const blockMapWidth = blockMapEl?.clientWidth || 0;
          const blockMapHeight = blockMapEl?.clientHeight || 0;

          // Calculate where the fullscreen center would be in block map's local pixel coords
          const fullscreenCenterInBlockMapX = fullscreenRect.width / 2 - offset.x;
          const fullscreenCenterInBlockMapY = fullscreenRect.height / 2 - offset.y;

          // Use block map's unproject to convert this pixel position to lng/lat
          computedCenter = blockMap.unproject([fullscreenCenterInBlockMapX, fullscreenCenterInBlockMapY]);
          computedZoom = state.initialZoom ?? blockMap.getZoom();

          console.log('[FullscreenMap] Center calculation:', {
            blockMapSize: { width: blockMapWidth, height: blockMapHeight },
            blockMapOffset: offset,
            fullscreenSize: { width: fullscreenRect.width, height: fullscreenRect.height },
            fullscreenCenterInBlockMap: { x: fullscreenCenterInBlockMapX, y: fullscreenCenterInBlockMapY },
            originalCenter: state.initialCenter,
            computedCenter: computedCenter
          });
        } else {
          console.log('[FullscreenMap] No block map, using default center/zoom');
        }

        // Create map with the computed center - no panning needed
        map = new mapboxgl.Map({
          container: mapContainer!,
          style: 'mapbox://styles/mapbox/light-v11',
          center: computedCenter,
          zoom: computedZoom,
          fadeDuration: 0,    // No fade effect
          interactive: true,  // Enable interactions
          trackResize: true   // Track container resizes
        });

        map.on('load', () => {
          console.log('[FullscreenMap] Map loaded');

          // Function to update markers on the map
          const updateMarkers = (locations: Location[]) => {
            if (!map) return;

            console.log('[FullscreenMap] Updating markers:', locations.length);

            // Remove old markers
            currentMarkers.forEach(marker => marker.remove());
            currentMarkers = [];

            // Add new markers
            locations.forEach((location) => {
              const bgColor = COLORS[location.colorIndex % COLORS.length];
              const el = document.createElement('div');
              // Note: Don't use transition on transform - it conflicts with Mapbox marker positioning
              el.style.cssText = `width: 32px; height: 32px; border-radius: 50%; background-color: ${bgColor}; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center;`;

              const inner = document.createElement('div');
              inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white; transition: transform 0.15s;';
              el.appendChild(inner);

              // Add hover effect on inner element only (doesn't affect Mapbox positioning)
              el.addEventListener('mouseenter', () => {
                inner.style.transform = 'scale(1.3)';
              });
              el.addEventListener('mouseleave', () => {
                inner.style.transform = 'scale(1)';
              });

              // Add click handler to navigate to location detail
              el.addEventListener('click', (e) => {
                e.stopPropagation();
                const mapId = params.mapId;
                if (mapId) {
                  console.log('[FullscreenMap] Marker clicked:', location.geoId);
                  documentStore.openLocationDetail(mapId, location.geoId);
                }
              });

              const marker = new mapboxgl.Marker(el)
                .setLngLat([location.lng, location.lat])
                .addTo(map!);

              currentMarkers.push(marker);
            });
          };

          // Store reference for external updates
          updateMarkersRef = updateMarkers;

          // Initial marker load from props
          updateMarkers(props.locations);

          // Initial route render - check if any location has transport configured
          const initialLocations = locationsStoreForRoutes.state.locations;
          const locWithTransport = initialLocations.find(l => l.transportFrom && l.transportProfile);
          if (locWithTransport) {
            const sourceLocation = locationsStoreForRoutes.getLocationById(locWithTransport.transportFrom!);
            if (sourceLocation) {
              console.log('[FullscreenMap] Initial route fetch for:', locWithTransport.geoId);
              fetchRoute(
                sourceLocation.lng,
                sourceLocation.lat,
                locWithTransport.lng,
                locWithTransport.lat,
                locWithTransport.transportProfile as 'walking' | 'driving' | 'cycling'
              ).then((route) => {
                if (route && map && map.isStyleLoaded()) {
                  const color = COLORS[sourceLocation.colorIndex % COLORS.length];
                  addRouteToMap(map, ROUTE_LAYER_ID, route.geometry, color);
                  lastRenderedRouteKey = `${sourceLocation.geoId}-${locWithTransport.geoId}-${locWithTransport.transportProfile}`;
                  console.log('[FullscreenMap] Initial route rendered');
                }
              });
            }
          }

          // Register callback to update markers when document changes
          const locationsStore = getLocationsStore();
          mapRenderCallback = () => {
            if (map && updateMarkersRef) {
              const editorStore = getEditorStore();
              const view = editorStore.editorView();
              if (view) {
                // Update the locations store first
                locationsStore.updateLocations(view);
                // Then update markers with the latest locations
                console.log('[FullscreenMap] Document changed, updating markers');
                updateMarkersRef(locationsStore.state.locations);
              }
            }
          };

          if (!window.mapRenderCallbacks) {
            window.mapRenderCallbacks = [];
          }
          window.mapRenderCallbacks.push(mapRenderCallback);

          // Double-click to add marker
          map!.on('dblclick', handleMapDoubleClick);

          // Update awareness on initial load (using viewport corners for pitch/bearing support)
          const initialCorners = getViewportCorners(map!);
          const initialCamera: CameraState = {
            center: [map!.getCenter().lng, map!.getCenter().lat],
            zoom: map!.getZoom(),
            pitch: map!.getPitch(),
            bearing: map!.getBearing()
          };
          fullscreenMapStore.updateAwareness(initialCorners, initialCamera, currentStyle());

          // Listen for awareness changes from other users viewing fullscreen
          const provider = collaboration.state().provider;
          if (provider) {
            const updateAwarenessLayers = () => {
              if (!map || !map.isStyleLoaded()) return;

              // Re-read docPos each time as it may have changed after document edits
              const currentDocPos = parseInt(state.blockMapElement?.dataset?.docPos || '0');

              const states = Array.from(provider.awareness.getStates().entries());
              const localClientId = provider.awareness.clientID;
              const currentViewers = new Set<string>();

              states.forEach(([clientId, awareState]: [number, any]) => {
                // Skip local user
                if (clientId === localClientId) return;

                const userId = String(clientId);

                // Check if user is no longer viewing this fullscreen map
                const isViewingThisMap = awareState.fullscreenMap?.isViewing &&
                  awareState.fullscreenMap.mapNodePosition === currentDocPos;

                if (!isViewingThisMap) {
                  // User stopped viewing - remove their layer if it exists
                  if (hasAwarenessLayer(map!, userId)) {
                    removeAwarenessLayer(map!, userId);
                    activeUserIds.delete(userId);
                  }
                  return;
                }

                // Skip rendering awareness layer in follow relationships:
                // 1. If I'm following this user (their view is synced with mine)
                // 2. If this user is following me (their view is just mirroring mine)
                const currentFollowState = followModeStore.state();
                const myClientId = String(localClientId);
                const theyAreFollowingMe = awareState.following?.userId === myClientId;
                const iAmFollowingThem = currentFollowState.isFollowing && currentFollowState.followingUserId === userId;

                if (iAmFollowingThem || theyAreFollowingMe) {
                  // If layer exists, remove it
                  if (hasAwarenessLayer(map!, userId)) {
                    removeAwarenessLayer(map!, userId);
                    activeUserIds.delete(userId);
                  }
                  return;
                }

                const userName = awareState.user?.name || 'Anonymous';
                const userColor = awareState.user?.color || '#3B82F6';
                const corners = awareState.fullscreenMap.corners;

                // Skip if no corners data
                if (!corners || corners.length !== 4) return;

                currentViewers.add(userId);

                if (hasAwarenessLayer(map!, userId)) {
                  updateAwarenessLayer(map!, userId, corners, userColor, userName);
                } else {
                  addAwarenessLayer(map!, userId, corners, userColor, userName);
                  activeUserIds.add(userId);
                }
              });

              // Remove layers for users who stopped viewing
              activeUserIds.forEach(userId => {
                if (!currentViewers.has(userId)) {
                  removeAwarenessLayer(map!, userId);
                  activeUserIds.delete(userId);
                  // Stop following if the user we're following disconnected
                  if (followModeStore.state().followingUserId === userId) {
                    followModeStore.stopFollowing();
                  }
                }
              });

              // If following someone, sync to their camera view and map style
              const followState = followModeStore.state();
              if (followState.isFollowing && followState.followingUserId) {
                const targetState = states.find(([id]) => String(id) === followState.followingUserId);
                if (targetState) {
                  const targetFullscreen = targetState[1].fullscreenMap;
                  const camera = targetFullscreen?.camera;
                  if (camera) {
                    map!.easeTo({
                      center: camera.center,
                      zoom: camera.zoom,
                      pitch: camera.pitch,
                      bearing: camera.bearing,
                      duration: 500
                    });
                  }
                  // Sync map style if different
                  const targetStyle = targetFullscreen?.mapStyle;
                  if (targetStyle && targetStyle !== currentStyle()) {
                    const styleConfig = MAP_STYLES.find(s => s.id === targetStyle);
                    if (styleConfig) {
                      setCurrentStyle(targetStyle as MapStyleId);
                      map!.setStyle(styleConfig.url);
                      // Re-add markers after style loads
                      map!.once('style.load', () => {
                        if (updateMarkersRef) {
                          const locationsStore = getLocationsStore();
                          updateMarkersRef(locationsStore.state.locations);
                        }
                      });
                    }
                  }
                }
              }

              // Check who is following me
              const myFollowers: Follower[] = [];
              const myClientId = String(localClientId);
              states.forEach(([clientId, awareState]: [number, any]) => {
                if (clientId === localClientId) return;
                // Check if this user is following me
                if (awareState.following?.userId === myClientId) {
                  myFollowers.push({
                    name: awareState.user?.name || 'Anonymous',
                    color: awareState.user?.color || '#3B82F6'
                  });
                }
              });
              setFollowers(myFollowers);

            };

            provider.awareness.on('change', updateAwarenessLayers);
            updateAwarenessLayers(); // Initial check

            // Click handler for awareness labels to toggle following
            map!.on('click', (e: mapboxgl.MapMouseEvent) => {
              // Get layer IDs for all active users
              const labelLayers = Array.from(activeUserIds).map(id => getLayerIds(id).labelLayer);
              if (labelLayers.length === 0) return;

              const features = map!.queryRenderedFeatures(e.point, {
                layers: labelLayers
              });

              if (features.length > 0) {
                const { userId, userName } = features[0].properties as { userId: string; userName: string };
                followModeStore.toggleFollowing(userId, userName);
                console.log('[FullscreenMap] Clicked awareness label:', userId, userName);
              }
            });

            // Change cursor on hover over awareness labels
            map!.on('mousemove', (e: mapboxgl.MapMouseEvent) => {
              const labelLayers = Array.from(activeUserIds).map(id => getLayerIds(id).labelLayer);
              if (labelLayers.length === 0) {
                map!.getCanvas().style.cursor = '';
                return;
              }

              const features = map!.queryRenderedFeatures(e.point, {
                layers: labelLayers
              });

              map!.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
            });

            // Store cleanup function on map
            map!._awarenessCleanup = () => {
              provider.awareness.off('change', updateAwarenessLayers);
              activeUserIds.forEach(userId => {
                if (map) {
                  removeAwarenessLayer(map, userId);
                }
              });
              activeUserIds.clear();
            };

            console.log('[FullscreenMap] Awareness listener attached for docPos:', state.blockMapElement?.dataset?.docPos);
          }
        });

        // Update awareness when map view changes (pan/zoom/tilt)
        map.on('moveend', () => {
          const corners = getViewportCorners(map!);
          const camera: CameraState = {
            center: [map!.getCenter().lng, map!.getCenter().lat],
            zoom: map!.getZoom(),
            pitch: map!.getPitch(),
            bearing: map!.getBearing()
          };
          fullscreenMapStore.updateAwareness(corners, camera, currentStyle());
        });
      });
    }
  });

  // Update markers when props.locations changes
  createEffect(() => {
    const locations = props.locations;
    if (updateMarkersRef && map) {
      console.log('[FullscreenMap] Props locations changed, updating markers:', locations.length);
      updateMarkersRef(locations);
    }
  });

  // Derive and render routes from document state (locations with transportFrom)
  // This works for both local changes and remote collaborative changes via Y.js
  let lastRenderedRouteKey = '';
  let routeFetchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Get locations store outside effect to ensure proper reactive tracking
  const locationsStoreForRoutes = getLocationsStore();

  createEffect(() => {
    // Access the reactive state directly
    const locations = locationsStoreForRoutes.state.locations;

    // Log locations with transport config for debugging
    const locationsWithTransport = locations.filter(l => l.transportFrom);
    console.log('[FullscreenMap] Route effect - locations:', {
      total: locations.length,
      withTransport: locationsWithTransport.length,
      transportDetails: locationsWithTransport.map(l => ({
        geoId: l.geoId,
        transportFrom: l.transportFrom,
        transportProfile: l.transportProfile
      }))
    });

    if (!map || !map.isStyleLoaded()) {
      return;
    }

    // Find the currently viewed location (from URL params)
    const currentLocId = params.locId;

    // Find location with transport configured
    // Priority: current location if it has transport, otherwise first location with transport
    let targetLoc = currentLocId
      ? locations.find(loc => loc.geoId === currentLocId && loc.transportFrom && loc.transportProfile)
      : null;

    if (!targetLoc) {
      // Check if any location has transport (for collaborative scenarios)
      targetLoc = locations.find(loc => loc.transportFrom && loc.transportProfile);
    }

    if (!targetLoc || !targetLoc.transportFrom || !targetLoc.transportProfile) {
      // No transport configured - remove route if exists
      if (lastRenderedRouteKey) {
        console.log('[FullscreenMap] Removing route - no transport configured');
        removeRouteFromMap(map, ROUTE_LAYER_ID);
        lastRenderedRouteKey = '';
      }
      return;
    }

    // Get source location
    const sourceLoc = locationsStoreForRoutes.getLocationById(targetLoc.transportFrom);
    if (!sourceLoc) {
      console.warn('[FullscreenMap] Source location not found:', targetLoc.transportFrom);
      return;
    }

    // Create a key to prevent duplicate fetches
    const routeKey = `${sourceLoc.geoId}-${targetLoc.geoId}-${targetLoc.transportProfile}`;
    if (routeKey === lastRenderedRouteKey) {
      return; // Already rendered this route
    }

    // Debounce route fetching
    if (routeFetchTimeout) {
      clearTimeout(routeFetchTimeout);
    }

    routeFetchTimeout = setTimeout(async () => {
      console.log('[FullscreenMap] Fetching route from document state:', routeKey);

      const route = await fetchRoute(
        sourceLoc.lng,
        sourceLoc.lat,
        targetLoc!.lng,
        targetLoc!.lat,
        targetLoc!.transportProfile as 'walking' | 'driving' | 'cycling'
      );

      if (route && map && map.isStyleLoaded()) {
        const color = COLORS[sourceLoc.colorIndex % COLORS.length];
        addRouteToMap(map, ROUTE_LAYER_ID, route.geometry, color);
        lastRenderedRouteKey = routeKey;
        console.log('[FullscreenMap] Route rendered:', routeKey);
      }
    }, 200);
  });

  // Cleanup map on close
  createEffect(() => {
    const state = fullscreenMapStore.state();

    if (!state.isVisible && map) {
      console.log('[FullscreenMap] Cleaning up map');

      // Remove callback from global array by reference
      if (window.mapRenderCallbacks && mapRenderCallback) {
        const idx = window.mapRenderCallbacks.indexOf(mapRenderCallback);
        if (idx !== -1) {
          window.mapRenderCallbacks.splice(idx, 1);
        }
        mapRenderCallback = null;
      }

      // Remove markers
      currentMarkers.forEach(marker => marker.remove());
      currentMarkers = [];

      // Clear update ref
      updateMarkersRef = null;

      // Reset route tracking so it re-fetches on reopen
      lastRenderedRouteKey = '';

      // Clean up awareness listener
      if (map._awarenessCleanup) {
        map._awarenessCleanup();
      }
      map.remove();
      map = undefined;
    }
  });

  onCleanup(() => {
    // NOTE: Don't call hideFullscreenMap() here - it causes issues when route changes
    // trigger component remount. The store state should be managed by route effects.

    // Remove callback from global array by reference
    if (window.mapRenderCallbacks && mapRenderCallback) {
      const idx = window.mapRenderCallbacks.indexOf(mapRenderCallback);
      if (idx !== -1) {
        window.mapRenderCallbacks.splice(idx, 1);
      }
      mapRenderCallback = null;
    }

    // Remove markers
    currentMarkers.forEach(marker => marker.remove());
    updateMarkersRef = null;

    if (map) {
      // Clean up awareness listener first
      if (map._awarenessCleanup) {
        map._awarenessCleanup();
      }
      map.remove();
    }
  });

  return (
    <Show when={fullscreenMapStore.state().isVisible}>
      <div class={styles.overlay}>
        <div class={styles.backdrop} onClick={handleClose}></div>
        <div class={styles.mapContainer}>
          <div ref={mapContainer} class={styles.map}></div>
        </div>
        <button class={styles.closeBtn} onClick={handleClose} title="Close fullscreen map">
          ✕
        </button>
        <Show when={followModeStore.state().isFollowing}>
          <div class={styles.followingIndicator}>
            <span>Following: {followModeStore.state().followingUserName}</span>
            <button
              onClick={() => followModeStore.stopFollowing()}
              title="Stop following"
            >
              ✕
            </button>
          </div>
        </Show>
        <Show when={followers().length > 0}>
          <div class={styles.beingFollowedIndicator}>
            <For each={followers()}>
              {(follower) => (
                <div class={styles.followerChip} style={{ 'border-color': follower.color }}>
                  <div class={styles.followerDot} style={{ 'background-color': follower.color }} />
                  <span>{follower.name} is following you</span>
                </div>
              )}
            </For>
          </div>
        </Show>
        <Show when={isAddingMarker()}>
          <div class={styles.addingMarkerIndicator}>
            <span class={styles.spinner}></span>
            <span>Adding marker...</span>
          </div>
        </Show>
        {/* Map style selector */}
        <div class={styles.styleSelector}>
          <For each={MAP_STYLES}>
            {(style) => (
              <button
                class={`${styles.styleBtn} ${currentStyle() === style.id ? styles.active : ''}`}
                onClick={() => handleStyleChange(style.id)}
                title={style.label}
              >
                {style.label}
              </button>
            )}
          </For>
        </div>
        {/* Invite button */}
        <Show when={!followModeStore.state().isFollowing}>
          <button
            class={`${styles.inviteBtn} ${followModeStore.isInviting() ? styles.inviting : ''}`}
            onClick={handleInviteClick}
            title={followModeStore.isInviting() ? "Cancel invitation" : "Invite others to follow"}
          >
            {followModeStore.isInviting() ? 'Cancel Invite' : 'Invite to Follow'}
          </button>
        </Show>
        <div class={styles.hint}>
          Double-click to add a marker
        </div>

        {/* Location detail sheet - shows when locId is in route */}
        <LocationDetailSheet />
      </div>
    </Show>
  );
};
