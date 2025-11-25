import { type Component, createEffect, createSignal, onCleanup, For } from 'solid-js';
import { getCollaborationStore } from '../../stores/collaboration';
import styles from './MapViewerOverlay.module.scss';

interface ViewerRect {
  userId: string;
  userName: string;
  userColor: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

export const MapViewerOverlay: Component = () => {
  const collaboration = getCollaborationStore();
  const [viewerRects, setViewerRects] = createSignal<ViewerRect[]>([]);

  createEffect(() => {
    const provider = collaboration.state().provider;
    if (!provider) return;

    const updateOverlays = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const localClientId = provider.awareness.clientID;
      const rects: ViewerRect[] = [];

      states.forEach(([clientId, state]: [number, any]) => {
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

        // Convert geographic bounds to pixel coordinates
        const { north, south, east, west } = fullscreenMap.bounds;

        try {
          const ne = blockMap.project([east, north]);
          const sw = blockMap.project([west, south]);

          // Get map container position
          const mapRect = mapNode.getBoundingClientRect();

          // Calculate rectangle position and size
          const rectLeft = mapRect.left + sw.x;
          const rectTop = mapRect.top + ne.y;
          const rectWidth = ne.x - sw.x;
          const rectHeight = sw.y - ne.y;

          rects.push({
            userId: String(clientId),
            userName: user.name || 'Anonymous',
            userColor: user.color || '#3B82F6',
            top: rectTop,
            left: rectLeft,
            width: rectWidth,
            height: rectHeight
          });

          console.log('[MapViewerOverlay] Viewer rectangle:', {
            user: user.name,
            bounds: fullscreenMap.bounds,
            rect: { top: rectTop, left: rectLeft, width: rectWidth, height: rectHeight }
          });
        } catch (error) {
          console.error('[MapViewerOverlay] Error calculating bounds:', error);
        }
      });

      setViewerRects(rects);
    };

    provider.awareness.on('change', updateOverlays);
    updateOverlays();

    // Also update on scroll/resize
    window.addEventListener('scroll', updateOverlays, true);
    window.addEventListener('resize', updateOverlays);

    onCleanup(() => {
      provider.awareness.off('change', updateOverlays);
      window.removeEventListener('scroll', updateOverlays, true);
      window.removeEventListener('resize', updateOverlays);
    });
  });

  return (
    <div class={styles.overlay}>
      <For each={viewerRects()}>
        {(rect) => (
          <div
            class={styles.viewerRectangle}
            style={{
              top: `${rect.top}px`,
              left: `${rect.left}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              'border-color': rect.userColor,
              color: rect.userColor
            }}
          >
            <div class={styles.viewerLabel} style={{ 'background-color': rect.userColor }}>
              {rect.userName} (viewing)
            </div>
          </div>
        )}
      </For>
    </div>
  );
};
