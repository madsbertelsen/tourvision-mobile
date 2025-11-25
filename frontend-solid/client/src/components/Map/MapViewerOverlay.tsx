import { type Component, createEffect, onCleanup } from 'solid-js';
import mapboxgl from 'mapbox-gl';
import { getCollaborationStore } from '../../stores/collaboration';
import {
  addAwarenessLayer,
  updateAwarenessLayer,
  removeAwarenessLayer,
  hasAwarenessLayer
} from '../../lib/mapAwarenessLayers';

interface AwarenessState {
  fullscreenMap?: {
    isViewing: boolean;
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    mapNodePosition: number;
    timestamp: number;
  };
  user?: {
    name: string;
    color: string;
  };
}

// Track active awareness layers per map
const activeLayersPerMap = new Map<mapboxgl.Map, Set<string>>();

function getActiveLayersForMap(map: mapboxgl.Map): Set<string> {
  if (!activeLayersPerMap.has(map)) {
    activeLayersPerMap.set(map, new Set());
  }
  return activeLayersPerMap.get(map)!;
}

export const MapViewerOverlay: Component = () => {
  const collaboration = getCollaborationStore();

  createEffect(() => {
    const provider = collaboration.state().provider;
    if (!provider) return;

    const updateOverlays = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const localClientId = provider.awareness.clientID;

      // Track which users are currently viewing, per map
      const currentViewersPerMap = new Map<mapboxgl.Map, Set<string>>();

      states.forEach(([clientId, state]: [number, AwarenessState]) => {
        // Skip local user and users not viewing fullscreen
        if (clientId === localClientId || !state.fullscreenMap?.isViewing) {
          return;
        }

        const { fullscreenMap, user } = state;
        if (!fullscreenMap || !user) return;

        // Find the map node in the DOM
        const mapNode = document.querySelector(
          `.prosemirror-map[data-doc-pos="${fullscreenMap.mapNodePosition}"]`
        ) as HTMLElement & { _mapInstance?: mapboxgl.Map };

        if (!mapNode || !mapNode._mapInstance) {
          console.warn('[MapViewerOverlay] Map node not found for position:', fullscreenMap.mapNodePosition);
          return;
        }

        const blockMap = mapNode._mapInstance;
        if (!blockMap.loaded()) return;

        const userId = String(clientId);
        const userName = user.name || 'Anonymous';
        const userColor = user.color || '#3B82F6';

        // Track this viewer for this map
        if (!currentViewersPerMap.has(blockMap)) {
          currentViewersPerMap.set(blockMap, new Set());
        }
        currentViewersPerMap.get(blockMap)!.add(userId);

        // Add or update awareness layer
        if (hasAwarenessLayer(blockMap, userId)) {
          updateAwarenessLayer(blockMap, userId, fullscreenMap.bounds, userColor, userName);
        } else {
          addAwarenessLayer(blockMap, userId, fullscreenMap.bounds, userColor, userName);
          getActiveLayersForMap(blockMap).add(userId);
        }

        console.log('[MapViewerOverlay] Updated GeoJSON awareness layer:', {
          user: userName,
          bounds: fullscreenMap.bounds
        });
      });

      // Clean up layers for users who stopped viewing
      activeLayersPerMap.forEach((activeUserIds, map) => {
        const currentViewers = currentViewersPerMap.get(map) || new Set();

        activeUserIds.forEach(userId => {
          if (!currentViewers.has(userId)) {
            removeAwarenessLayer(map, userId);
            activeUserIds.delete(userId);
            console.log('[MapViewerOverlay] Removed awareness layer for disconnected user:', userId);
          }
        });
      });
    };

    provider.awareness.on('change', updateOverlays);
    updateOverlays();

    onCleanup(() => {
      provider.awareness.off('change', updateOverlays);

      // Clean up all awareness layers
      activeLayersPerMap.forEach((activeUserIds, map) => {
        activeUserIds.forEach(userId => {
          try {
            removeAwarenessLayer(map, userId);
          } catch (e) {
            // Map might be removed already
          }
        });
      });
      activeLayersPerMap.clear();
    });
  });

  // No DOM rendering needed - layers are rendered on maps directly
  return null;
};
