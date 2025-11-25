import { createSignal } from 'solid-js';
import type mapboxgl from 'mapbox-gl';

interface FullscreenMapState {
  isVisible: boolean;
  blockMapElement: HTMLElement | null;
  initialBounds: mapboxgl.LngLatBounds | null;
  padding: { top: number; left: number; right: number; bottom: number } | null;
}

// Create fullscreen map store
function createFullscreenMapStore() {
  const [state, setState] = createSignal<FullscreenMapState>({
    isVisible: false,
    blockMapElement: null,
    initialBounds: null,
    padding: null
  });

  function showFullscreenMap(mapElement: HTMLElement & { _mapInstance?: mapboxgl.Map }) {
    console.log('[FullscreenMap] Opening fullscreen map');

    // Get the Mapbox instance from the DOM element
    const blockMap = mapElement._mapInstance;
    if (!blockMap) {
      console.error('[FullscreenMap] No map instance found on element');
      return;
    }

    // Ensure map is loaded before getting bounds
    if (!blockMap.loaded()) {
      console.warn('[FullscreenMap] Map not fully loaded yet');
      return;
    }

    // Get the current bounds from the block map
    const bounds = blockMap.getBounds();

    // Calculate padding based on block map position
    const rect = mapElement.getBoundingClientRect();
    const padding = {
      top: rect.top,
      left: rect.left,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom
    };

    console.log('[FullscreenMap] Bounds:', bounds.toArray());
    console.log('[FullscreenMap] Padding:', padding);

    // Update state
    setState({
      isVisible: true,
      blockMapElement: mapElement,
      initialBounds: bounds,
      padding
    });
  }

  function hideFullscreenMap() {
    console.log('[FullscreenMap] Closing fullscreen map');

    setState({
      isVisible: false,
      blockMapElement: null,
      initialBounds: null,
      padding: null
    });
  }

  return {
    state,
    showFullscreenMap,
    hideFullscreenMap
  };
}

// Singleton instance
let fullscreenMapStore: ReturnType<typeof createFullscreenMapStore> | null = null;

export function getFullscreenMapStore() {
  if (!fullscreenMapStore) {
    fullscreenMapStore = createFullscreenMapStore();
  }
  return fullscreenMapStore;
}
