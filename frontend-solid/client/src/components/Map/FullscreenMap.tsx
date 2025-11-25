import { type Component, createEffect, createSignal, onCleanup, Show, For } from 'solid-js';
import mapboxgl from 'mapbox-gl';
import { getFullscreenMapStore, type CameraState } from '../../stores/fullscreenMap';
import { getCollaborationStore } from '../../stores/collaboration';
import { getFollowModeStore } from '../../stores/followMode';
import type { Location } from '../../stores/locations';
import { addMarkersToMap } from '../../lib/mapbox';
import {
  addAwarenessLayer,
  updateAwarenessLayer,
  removeAwarenessLayer,
  hasAwarenessLayer,
  getViewportCorners,
  getLayerIds
} from '../../lib/mapAwarenessLayers';
import styles from './FullscreenMap.module.scss';

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

  const handleClose = () => {
    fullscreenMapStore.hideFullscreenMap();
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

          // Add markers
          if (props.locations.length > 0) {
            addMarkersToMap(map!, props.locations);
          }

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
            const currentDocPos = parseInt(state.blockMapElement?.dataset?.docPos || '0');

            const updateAwarenessLayers = () => {
              if (!map || !map.isStyleLoaded()) return;

              const states = Array.from(provider.awareness.getStates().entries());
              const localClientId = provider.awareness.clientID;
              const currentViewers = new Set<string>();

              states.forEach(([clientId, awareState]: [number, any]) => {
                // Skip local user
                if (clientId === localClientId) return;

                // Only show users viewing the same map node in fullscreen
                if (!awareState.fullscreenMap?.isViewing) return;
                if (awareState.fullscreenMap.mapNodePosition !== currentDocPos) return;

                const userId = String(clientId);
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

            console.log('[FullscreenMap] Awareness listener attached for docPos:', currentDocPos);
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

  // Cleanup map on close
  createEffect(() => {
    const state = fullscreenMapStore.state();

    if (!state.isVisible && map) {
      console.log('[FullscreenMap] Cleaning up map');
      // Clean up awareness listener first
      if (map._awarenessCleanup) {
        map._awarenessCleanup();
      }
      map.remove();
      map = undefined;
    }
  });

  onCleanup(() => {
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
      </div>
    </Show>
  );
};
