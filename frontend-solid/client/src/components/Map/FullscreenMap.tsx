import { type Component, createEffect, onCleanup, Show } from 'solid-js';
import mapboxgl from 'mapbox-gl';
import { getFullscreenMapStore } from '../../stores/fullscreenMap';
import type { Location } from '../../stores/locations';
import { addMarkersToMap } from '../../lib/mapbox';
import styles from './FullscreenMap.module.scss';

interface FullscreenMapProps {
  locations: Location[];
}

export const FullscreenMap: Component<FullscreenMapProps> = (props) => {
  const fullscreenMapStore = getFullscreenMapStore();
  let mapContainer: HTMLDivElement | undefined;
  let map: mapboxgl.Map | undefined;

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

          // Update awareness on initial load
          const initialBounds = map!.getBounds();
          if (initialBounds) {
            fullscreenMapStore.updateAwareness({
              north: initialBounds.getNorth(),
              south: initialBounds.getSouth(),
              east: initialBounds.getEast(),
              west: initialBounds.getWest()
            });
          }
        });

        // Update awareness when map view changes (pan/zoom)
        map.on('moveend', () => {
          const bounds = map!.getBounds();
          if (bounds) {
            fullscreenMapStore.updateAwareness({
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest()
            });
          }
        });
      });
    }
  });

  // Cleanup map on close
  createEffect(() => {
    const state = fullscreenMapStore.state();

    if (!state.isVisible && map) {
      console.log('[FullscreenMap] Cleaning up map');
      map.remove();
      map = undefined;
    }
  });

  onCleanup(() => {
    if (map) {
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
      </div>
    </Show>
  );
};
