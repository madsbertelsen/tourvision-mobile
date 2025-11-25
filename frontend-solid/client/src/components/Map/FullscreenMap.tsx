import { type Component, createEffect, createSignal, onCleanup, Show, For } from 'solid-js';
import mapboxgl from 'mapbox-gl';
import { getFullscreenMapStore, type CameraState } from '../../stores/fullscreenMap';
import { getCollaborationStore } from '../../stores/collaboration';
import { getFollowModeStore } from '../../stores/followMode';
import { getEditorStore } from '../../stores/editor';
import { getLocationsStore, type Location } from '../../stores/locations';
import { reverseGeocode } from '../../lib/geocoding';
import { COLORS } from '../../lib/prosemirror-schema';
import {
  addAwarenessLayer,
  updateAwarenessLayer,
  removeAwarenessLayer,
  hasAwarenessLayer,
  getViewportCorners,
  getLayerIds
} from '../../lib/mapAwarenessLayers';
import styles from './FullscreenMap.module.scss';

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
  const fullscreenMapStore = getFullscreenMapStore();
  const collaboration = getCollaborationStore();
  const followModeStore = getFollowModeStore();
  let mapContainer: HTMLDivElement | undefined;
  let map: ExtendedMap | undefined;

  // Track active awareness layers for cleanup
  const activeUserIds = new Set<string>();

  // Track users who are following me
  const [followers, setFollowers] = createSignal<Follower[]>([]);

  // Track marker creation state
  const [isAddingMarker, setIsAddingMarker] = createSignal(false);
  const [pendingMarker, setPendingMarker] = createSignal<mapboxgl.Marker | null>(null);

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
    fullscreenMapStore.hideFullscreenMap();
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

  // Initialize map when visible
  createEffect(() => {
    const state = fullscreenMapStore.state();

    if (state.isVisible && mapContainer && state.initialCenter && state.initialZoom !== null && state.blockMapOffset) {
      console.log('[FullscreenMap] Initializing Mapbox map with computed center');

      // Small delay to ensure overlay is rendered and we can measure it
      requestAnimationFrame(() => {
        const fullscreenRect = mapContainer!.getBoundingClientRect();
        const offset = state.blockMapOffset!;
        const blockMapEl = state.blockMapElement as HTMLElement & { _mapInstance?: mapboxgl.Map };
        const blockMap = blockMapEl?._mapInstance;

        if (!blockMap) {
          console.error('[FullscreenMap] Block map instance not found');
          return;
        }

        const blockMapWidth = blockMapEl?.clientWidth || 0;
        const blockMapHeight = blockMapEl?.clientHeight || 0;

        // Calculate where the fullscreen center would be in block map's local pixel coords
        // Fullscreen center in screen coords: (fullscreenRect.width/2, fullscreenRect.height/2)
        // Block map origin in screen coords: (offset.x, offset.y)
        // So fullscreen center in block map local coords:
        const fullscreenCenterInBlockMapX = fullscreenRect.width / 2 - offset.x;
        const fullscreenCenterInBlockMapY = fullscreenRect.height / 2 - offset.y;

        // Use block map's unproject to convert this pixel position to lng/lat
        // This gives us the geographic center that should be used for fullscreen map
        const computedCenter = blockMap.unproject([fullscreenCenterInBlockMapX, fullscreenCenterInBlockMapY]);

        console.log('[FullscreenMap] Center calculation:', {
          blockMapSize: { width: blockMapWidth, height: blockMapHeight },
          blockMapOffset: offset,
          fullscreenSize: { width: fullscreenRect.width, height: fullscreenRect.height },
          fullscreenCenterInBlockMap: { x: fullscreenCenterInBlockMapX, y: fullscreenCenterInBlockMapY },
          originalCenter: state.initialCenter,
          computedCenter: computedCenter
        });

        // Create map with the computed center - no panning needed
        map = new mapboxgl.Map({
          container: mapContainer!,
          style: 'mapbox://styles/mapbox/light-v11',
          center: computedCenter,
          zoom: state.initialZoom!,
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
              el.style.cssText = `width: 32px; height: 32px; border-radius: 50%; background-color: ${bgColor}; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); cursor: pointer; display: flex; align-items: center; justify-content: center;`;

              const inner = document.createElement('div');
              inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white;';
              el.appendChild(inner);

              const marker = new mapboxgl.Marker(el)
                .setLngLat([location.lng, location.lat])
                .setPopup(new mapboxgl.Popup().setText(location.placeName))
                .addTo(map!);

              currentMarkers.push(marker);
            });
          };

          // Store reference for external updates
          updateMarkersRef = updateMarkers;

          // Initial marker load from props
          updateMarkers(props.locations);

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
          fullscreenMapStore.updateAwareness(initialCorners, initialCamera);

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

              // If following someone, animate to their camera view
              const followState = followModeStore.state();
              if (followState.isFollowing && followState.followingUserId) {
                const targetState = states.find(([id]) => String(id) === followState.followingUserId);
                if (targetState) {
                  const camera = targetState[1].fullscreenMap?.camera;
                  if (camera) {
                    map!.easeTo({
                      center: camera.center,
                      zoom: camera.zoom,
                      pitch: camera.pitch,
                      bearing: camera.bearing,
                      duration: 500
                    });
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
          fullscreenMapStore.updateAwareness(corners, camera);
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

      // Clean up awareness listener
      if (map._awarenessCleanup) {
        map._awarenessCleanup();
      }
      map.remove();
      map = undefined;
    }
  });

  onCleanup(() => {
    // Clear fullscreen map awareness state
    fullscreenMapStore.hideFullscreenMap();

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
        <div class={styles.hint}>
          Double-click to add a marker
        </div>
      </div>
    </Show>
  );
};
