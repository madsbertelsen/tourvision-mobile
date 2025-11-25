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

    if (state.isVisible && mapContainer && state.initialBounds && state.padding) {
      console.log('[FullscreenMap] Initializing Mapbox map');

      // Small delay to ensure overlay is rendered
      requestAnimationFrame(() => {
        // Create map with initial bounds matching block map
        map = new mapboxgl.Map({
          container: mapContainer!,
          style: 'mapbox://styles/mapbox/light-v11',
          bounds: state.initialBounds!,
          fitBoundsOptions: {
            padding: state.padding!,
            duration: 0,      // No animation
            animate: false    // Explicitly disable animation
          },
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
