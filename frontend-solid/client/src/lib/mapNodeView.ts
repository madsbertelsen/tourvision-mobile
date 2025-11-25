import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { COLORS } from './prosemirror-schema';

// TypeScript declaration for global map callbacks
declare global {
  interface Window {
    mapRenderCallbacks?: Array<() => void>;
  }
}

export function createMapNodeView(node: PMNode, view: EditorView, getPos: () => number | undefined) {
  const dom = document.createElement('div');
  dom.className = 'prosemirror-map';
  dom.style.cssText = `height: ${node.attrs.height}px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; position: relative;`;

  const mapContainer = document.createElement('div');
  mapContainer.style.cssText = 'width: 100%; height: 100%; border-radius: 8px; overflow: hidden; min-height: inherit;';
  dom.appendChild(mapContainer);

  let currentMap: mapboxgl.Map | null = null;
  let currentMarkers: mapboxgl.Marker[] = [];
  let isFirstLoad = true;
  let lastGeoMarksHash = '';

  // Compute hash of all geo-mark attributes
  const computeGeoMarksHash = (locations: ReturnType<typeof extractLocations>): string => {
    return locations
      .map(l => `${l.geoId}:${l.lat}:${l.lng}:${l.placeName}:${l.colorIndex}`)
      .sort()
      .join('|');
  };

  /**
   * Find section boundaries for a map node.
   * A section is content between:
   * - Document start or a heading (of specified levels) or a map
   * - A heading (of specified levels), map, or document end
   */
  const findSectionBoundaries = (mapPos: number): { sectionStart: number; sectionEnd: number } => {
    const doc = view.state.doc;
    const scopeMode = node.attrs.scopeMode;
    const scopeHeadingLevels: number[] = node.attrs.scopeHeadingLevels || [1, 2];

    // If scopeMode is 'all', return full document range
    if (scopeMode === 'all') {
      return { sectionStart: 0, sectionEnd: doc.content.size };
    }

    let sectionStart = 0;  // Default to document start
    let sectionEnd = mapPos;  // Default to map position
    let foundTarget = false;

    doc.descendants((childNode, pos) => {
      // Skip if we've already found the section end
      if (foundTarget && sectionEnd !== mapPos) {
        return false;  // Stop traversal
      }

      const nodeEnd = pos + childNode.nodeSize;

      // Check if this is a section boundary
      const isBoundary =
        (childNode.type.name === 'heading' && scopeHeadingLevels.includes(childNode.attrs.level)) ||
        childNode.type.name === 'map';

      if (pos < mapPos && isBoundary) {
        // This boundary is before our target map - update section start
        sectionStart = nodeEnd;
      } else if (pos === mapPos) {
        // Found our target map
        foundTarget = true;
        sectionEnd = pos;  // Section ends at this map
      } else if (pos > mapPos && isBoundary && foundTarget) {
        // Found boundary after target - this would be our end (but we already set it to mapPos)
        // This case is for future enhancement where maps might not be boundaries
        return false;  // Stop traversal
      }

      return true;  // Continue traversal
    });

    console.log('[MapNodeView] Section boundaries:', { sectionStart, sectionEnd, mapPos, scopeMode, scopeHeadingLevels });
    return { sectionStart, sectionEnd };
  };

  // Extract locations from document
  const extractLocations = () => {
    const locations: Array<{
      geoId: string;
      displayText: string;
      placeName: string;
      lat: number;
      lng: number;
      colorIndex: number;
    }> = [];

    // Get the position of this map node
    const mapPos = getPos();
    if (mapPos === undefined) {
      console.warn('[MapNodeView] Could not determine map position');
      return locations;
    }

    // Find section boundaries
    const { sectionStart, sectionEnd } = findSectionBoundaries(mapPos);

    // Extract locations only within the section boundaries
    view.state.doc.nodesBetween(sectionStart, sectionEnd, (childNode) => {
      if (childNode.isText && childNode.marks.length > 0) {
        for (const mark of childNode.marks) {
          if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
            locations.push({
              geoId: mark.attrs.geoId,
              displayText: mark.attrs.displayText || childNode.text || '',
              placeName: mark.attrs.placeName,
              lat: parseFloat(mark.attrs.lat),
              lng: parseFloat(mark.attrs.lng),
              colorIndex: mark.attrs.colorIndex,
            });
          }
        }
      }
    });

    console.log('[MapNodeView] Extracted locations:', locations.length);
    return locations;
  };

  // Update markers on map
  const updateMarkers = (locations: ReturnType<typeof extractLocations>) => {
    if (!currentMap) return;

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
        .addTo(currentMap!);

      currentMarkers.push(marker);
    });

    // Position the map - instant on first load, animated on updates
    if (locations.length === 1) {
      if (isFirstLoad) {
        currentMap.jumpTo({
          center: [locations[0].lng, locations[0].lat],
          zoom: 12
        });
        console.log('[MapNodeView] Initial load - jumped to single location');
      } else {
        currentMap.flyTo({
          center: [locations[0].lng, locations[0].lat],
          zoom: 12,
          duration: 1500
        });
      }
    } else if (locations.length > 1) {
      const lngs = locations.map(l => l.lng);
      const lats = locations.map(l => l.lat);
      const bounds = new mapboxgl.LngLatBounds(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      );

      if (isFirstLoad) {
        currentMap.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 0
        });
        console.log('[MapNodeView] Initial load - fitted bounds instantly');
      } else {
        currentMap.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 1500
        });
      }
    }

    if (isFirstLoad) {
      isFirstLoad = false;
    }
  };

  // Render map
  const renderMap = () => {
    const locations = extractLocations();
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

    if (!mapboxToken) {
      mapContainer.innerHTML = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #6b7280;">
          🗺️ Mapbox token required
        </div>
      `;
      return;
    }

    if (locations.length === 0) {
      mapContainer.innerHTML = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #6b7280;">
          🗺️ No locations found
        </div>
      `;
      return;
    }

    if (!currentMap) {
      mapContainer.innerHTML = '';
      mapContainer.style.opacity = '0';

      mapboxgl.accessToken = mapboxToken;

      let initialCenter: [number, number] = [0, 0];
      let initialZoom = 2;

      if (locations.length === 1) {
        initialCenter = [locations[0].lng, locations[0].lat];
        initialZoom = 12;
      } else if (locations.length > 1) {
        const lngs = locations.map(l => l.lng);
        const lats = locations.map(l => l.lat);
        initialCenter = [
          (Math.min(...lngs) + Math.max(...lngs)) / 2,
          (Math.min(...lats) + Math.max(...lats)) / 2
        ];
      }

      currentMap = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/light-v11',
        center: initialCenter,
        zoom: initialZoom,
        // Disable all map interactions
        dragPan: false,
        scrollZoom: false,
        boxZoom: false,
        dragRotate: false,
        keyboard: false,
        doubleClickZoom: false,
        touchZoomRotate: false,
        fadeDuration: 0,
        renderWorldCopies: false
      });

      currentMap.once('style.load', () => {
        updateMarkers(locations);

        // Fade in the map after it's positioned
        mapContainer.style.transition = 'opacity 0.5s ease-in';
        mapContainer.style.opacity = '1';

        console.log('[MapNodeView] Map initialized with', locations.length, 'locations');
      });
    } else {
      // Map already exists, just update markers
      updateMarkers(locations);
    }
  };

  // Delay initial render until container is in DOM and has dimensions
  requestAnimationFrame(() => {
    // Double-check that container has dimensions
    const rect = mapContainer.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      renderMap();
    } else {
      // If still no dimensions, wait a bit longer
      setTimeout(() => renderMap(), 100);
    }
  });

  // Register callback for document changes
  const checkAndUpdate = () => {
    const locations = extractLocations();
    const newHash = computeGeoMarksHash(locations);

    if (newHash !== lastGeoMarksHash) {
      console.log('[MapNodeView] Geo-marks changed, updating map');
      lastGeoMarksHash = newHash;
      renderMap();
    }
  };

  // Initialize global callback array if needed
  if (!window.mapRenderCallbacks) {
    window.mapRenderCallbacks = [];
  }

  const callbackIndex = window.mapRenderCallbacks.length;
  window.mapRenderCallbacks.push(checkAndUpdate);

  return {
    dom,
    update(updatedNode: PMNode) {
      if (updatedNode.type !== node.type) {
        return false;
      }

      // Re-render map when document updates
      renderMap();
      return true;
    },
    destroy() {
      // Remove callback from global array
      if (window.mapRenderCallbacks && window.mapRenderCallbacks[callbackIndex]) {
        window.mapRenderCallbacks.splice(callbackIndex, 1);
      }

      // Clean up map
      if (currentMap) {
        currentMarkers.forEach(marker => marker.remove());
        currentMap.remove();
        currentMap = null;
      }
    }
  };
}
