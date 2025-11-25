import { createSignal } from 'solid-js';
import type mapboxgl from 'mapbox-gl';
import { getCollaborationStore } from './collaboration';
import { getViewportCorners, type ViewportCorners } from '../lib/mapAwarenessLayers';

// Camera state for following feature
export interface CameraState {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

interface FullscreenMapState {
  isVisible: boolean;
  blockMapElement: HTMLElement | null;
  initialCenter: mapboxgl.LngLat | null;
  initialZoom: number | null;
  // Offset in pixels from fullscreen container origin to block map origin
  blockMapOffset: { x: number; y: number } | null;
}

// Create fullscreen map store
function createFullscreenMapStore() {
  const [state, setState] = createSignal<FullscreenMapState>({
    isVisible: false,
    blockMapElement: null,
    initialCenter: null,
    initialZoom: null,
    blockMapOffset: null
  });

  function showFullscreenMap(mapElement: HTMLElement & { _mapInstance?: mapboxgl.Map }) {
    console.log('[FullscreenMap] Opening fullscreen map');

    // Get the Mapbox instance from the DOM element (may be null if no locations)
    const blockMap = mapElement._mapInstance;

    // Get block map position in viewport
    const blockMapRect = mapElement.getBoundingClientRect();
    const blockMapOffset = {
      x: blockMapRect.left,
      y: blockMapRect.top
    };

    // Get center and zoom from block map if available, otherwise use defaults
    let center: mapboxgl.LngLat | null = null;
    let zoom: number | null = null;

    if (blockMap && blockMap.loaded()) {
      center = blockMap.getCenter();
      zoom = blockMap.getZoom();
      console.log('[FullscreenMap] Using block map center:', center, 'Zoom:', zoom);

      // Update awareness state for other users
      const collaboration = getCollaborationStore();
      const provider = collaboration.state().provider;
      if (provider) {
        const docPos = parseInt(mapElement.dataset.docPos || '0');
        // Get viewport corners (accounts for pitch/bearing)
        const corners = getViewportCorners(blockMap);
        // Get camera state for following feature
        const camera: CameraState = {
          center: [blockMap.getCenter().lng, blockMap.getCenter().lat],
          zoom: blockMap.getZoom(),
          pitch: blockMap.getPitch(),
          bearing: blockMap.getBearing()
        };
        provider.awareness.setLocalStateField('fullscreenMap', {
          isViewing: true,
          corners,
          camera,
          mapNodePosition: docPos,
          timestamp: Date.now()
        });
        console.log('[FullscreenMap] Awareness updated:', { docPos, corners, camera });
      }
    } else {
      console.log('[FullscreenMap] No block map instance, using default view');
    }

    // Update state with center, zoom and offset (may be null for default view)
    setState({
      isVisible: true,
      blockMapElement: mapElement,
      initialCenter: center,
      initialZoom: zoom,
      blockMapOffset
    });
  }

  function hideFullscreenMap() {
    console.log('[FullscreenMap] Closing fullscreen map');

    // Clear awareness state - set isViewing to false explicitly
    // (setting to null may not trigger awareness change properly)
    const collaboration = getCollaborationStore();
    const provider = collaboration.state().provider;
    if (provider) {
      provider.awareness.setLocalStateField('fullscreenMap', {
        isViewing: false,
        timestamp: Date.now()
      });
      console.log('[FullscreenMap] Awareness cleared (isViewing: false)');
    }

    setState({
      isVisible: false,
      blockMapElement: null,
      initialCenter: null,
      initialZoom: null,
      blockMapOffset: null
    });
  }

  function updateAwareness(corners: ViewportCorners, camera: CameraState, mapStyle?: string) {
    const currentState = state();
    if (!currentState.isVisible || !currentState.blockMapElement) return;

    const collaboration = getCollaborationStore();
    const provider = collaboration.state().provider;
    if (provider) {
      const docPos = parseInt(currentState.blockMapElement.dataset?.docPos || '0');
      provider.awareness.setLocalStateField('fullscreenMap', {
        isViewing: true,
        corners,
        camera,
        mapStyle,
        mapNodePosition: docPos,
        timestamp: Date.now()
      });
      console.log('[FullscreenMap] Awareness updated:', { corners, camera, mapStyle });
    }
  }

  return {
    state,
    showFullscreenMap,
    hideFullscreenMap,
    updateAwareness
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
