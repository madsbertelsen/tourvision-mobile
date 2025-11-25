import { type Component, createSignal, createEffect, onCleanup, Show } from 'solid-js';
import mapboxgl from 'mapbox-gl';
import { initMapbox, addMarkersToMap, fitMapToLocations } from '../../lib/mapbox';
import { getLocationsStore } from '../../stores/locations';
import styles from './map.module.scss';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapPreviewProps {
  visible: boolean;
}

export const MapPreview: Component<MapPreviewProps> = (props) => {
  let mapContainer: HTMLDivElement | undefined;
  const [map, setMap] = createSignal<mapboxgl.Map | null>(null);
  const [markers, setMarkers] = createSignal<mapboxgl.Marker[]>([]);
  const locationsStore = getLocationsStore();

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

  createEffect(() => {
    if (!props.visible || !mapContainer || !mapboxToken) return;

    const locations = locationsStore.state.locations;
    if (locations.length === 0) return;

    // Initialize Mapbox token
    initMapbox(mapboxToken);

    // Create map if not exists
    if (!map()) {
      console.log('[MapPreview] Creating map');
      const newMap = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-0.1278, 51.5074], // London default
        zoom: 3
      });

      newMap.on('load', () => {
        console.log('[MapPreview] Map loaded');
        setMap(newMap);
      });

      onCleanup(() => {
        console.log('[MapPreview] Cleaning up map');
        newMap.remove();
      });
    }
  });

  // Update markers when locations change
  createEffect(() => {
    const currentMap = map();
    if (!currentMap) return;

    const locations = locationsStore.state.locations;

    // Remove old markers
    markers().forEach((marker) => marker.remove());

    // Add new markers
    const newMarkers = addMarkersToMap(currentMap, locations);
    setMarkers(newMarkers);

    // Fit bounds to locations
    fitMapToLocations(currentMap, locations);
  });

  return (
    <Show when={props.visible}>
      <div class={styles.mapPreviewContainer}>
        {!mapboxToken ? (
          <div class={styles.noToken}>
            🗺️ Mapbox token required for map rendering
          </div>
        ) : locationsStore.state.locations.length === 0 ? (
          <div class={styles.noLocations}>
            🗺️ No locations found in document
          </div>
        ) : (
          <div ref={mapContainer} class={styles.mapPreview} />
        )}
      </div>
    </Show>
  );
};
