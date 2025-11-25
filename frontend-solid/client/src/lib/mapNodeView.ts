import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import { COLORS } from './prosemirror-schema';
import { getDocumentStore } from '../stores/document';
import { fetchRoute, addRouteToMap, removeRouteFromMap } from './mapbox';

// TypeScript declaration for global map callbacks and map instance
declare global {
  interface Window {
    mapRenderCallbacks?: Array<() => void>;
  }
}

// Extend HTMLElement to include custom property
interface MapElement extends HTMLElement {
  _mapInstance?: mapboxgl.Map;
}

export function createMapNodeView(node: PMNode, view: EditorView, getPos: () => number | undefined) {
  const documentStore = getDocumentStore();
  const dom = document.createElement('div') as MapElement;
  dom.className = 'prosemirror-map';
  dom.style.cssText = `height: ${node.attrs.height}px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; position: relative; cursor: pointer;`;

  // Store document position for awareness tracking
  const pos = getPos();
  if (pos !== undefined) {
    dom.dataset.docPos = String(pos);
  }

  const mapContainer = document.createElement('div');
  mapContainer.style.cssText = 'width: 100%; height: 100%; border-radius: 8px; overflow: hidden; min-height: inherit;';
  dom.appendChild(mapContainer);

  // Create transparent click overlay
  const clickOverlay = document.createElement('div');
  clickOverlay.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1000; background: transparent; cursor: pointer;';
  dom.appendChild(clickOverlay);

  // Click detection for fullscreen toggle
  let touchStartTime = 0;

  clickOverlay.addEventListener('mousedown', () => {
    touchStartTime = Date.now();
  });

  clickOverlay.addEventListener('click', (e) => {
    const duration = Date.now() - touchStartTime;

    if (duration > 500) {
      // Long press - select node for editing
      const pos = getPos();
      if (pos !== undefined) {
        const tr = view.state.tr.setSelection(
          NodeSelection.create(view.state.doc, pos)
        );
        view.dispatch(tr);
        console.log('[MapNodeView] Long press - node selected');
      }
    } else {
      // Short click - open fullscreen map via navigation
      e.preventDefault();
      e.stopPropagation();
      const mapId = dom.dataset.docPos;
      if (mapId) {
        documentStore.openFullscreenMap(mapId);
        console.log('[MapNodeView] Short click - navigating to fullscreen map:', mapId);
      }
    }
  });

  let currentMap: mapboxgl.Map | null = null;
  let currentMarkers: mapboxgl.Marker[] = [];
  let isFirstLoad = true;
  let lastGeoMarksHash = '';

  // Compute hash of all geo-mark attributes (including transport and waypoints)
  const computeGeoMarksHash = (locations: ReturnType<typeof extractLocations>): string => {
    return locations
      .map(l => {
        const waypointsHash = l.waypoints?.map(wp => `${wp.lng.toFixed(6)},${wp.lat.toFixed(6)}`).join(';') || '';
        return `${l.geoId}:${l.lat}:${l.lng}:${l.placeName}:${l.colorIndex}:${l.transportFrom || ''}:${l.transportProfile || ''}:${waypointsHash}`;
      })
      .sort()
      .join('|');
  };

  // Route rendering constants and state
  const ROUTE_LAYER_ID = 'block-map-route';
  let lastRenderedRouteKey = '';

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
      transportFrom?: string;
      transportProfile?: 'walking' | 'driving' | 'cycling';
      waypoints?: Array<{ lng: number; lat: number }>;
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
              transportFrom: mark.attrs.transportFrom,
              transportProfile: mark.attrs.transportProfile,
              waypoints: mark.attrs.waypoints,
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

  // Update routes on map based on transport configuration
  const updateRoutes = async (locations: ReturnType<typeof extractLocations>) => {
    if (!currentMap || !currentMap.isStyleLoaded()) return;

    // Find location with transport configured
    const locWithTransport = locations.find(l => l.transportFrom && l.transportProfile);

    if (!locWithTransport || !locWithTransport.transportFrom || !locWithTransport.transportProfile) {
      // No transport configured - remove route if exists
      if (lastRenderedRouteKey) {
        console.log('[MapNodeView] Removing route - no transport configured');
        removeRouteFromMap(currentMap, ROUTE_LAYER_ID);
        lastRenderedRouteKey = '';
      }
      return;
    }

    // Find source location
    const sourceLoc = locations.find(l => l.geoId === locWithTransport.transportFrom);
    if (!sourceLoc) {
      console.warn('[MapNodeView] Source location not found:', locWithTransport.transportFrom);
      return;
    }

    // Get waypoints
    const waypoints = locWithTransport.waypoints || [];

    // Create key to prevent duplicate fetches (include waypoints hash)
    const waypointsHash = waypoints.map(wp => `${wp.lng.toFixed(6)},${wp.lat.toFixed(6)}`).join(';');
    const routeKey = `${sourceLoc.geoId}-${locWithTransport.geoId}-${locWithTransport.transportProfile}-${waypointsHash}`;
    if (routeKey === lastRenderedRouteKey) {
      return; // Already rendered this route
    }

    console.log('[MapNodeView] Fetching route:', routeKey, 'waypoints:', waypoints.length);

    try {
      const route = await fetchRoute(
        sourceLoc.lng,
        sourceLoc.lat,
        locWithTransport.lng,
        locWithTransport.lat,
        locWithTransport.transportProfile,
        waypoints.length > 0 ? waypoints : undefined
      );

      if (route && currentMap && currentMap.isStyleLoaded()) {
        const color = COLORS[sourceLoc.colorIndex % COLORS.length];
        addRouteToMap(currentMap, ROUTE_LAYER_ID, route.geometry, color);
        lastRenderedRouteKey = routeKey;
        console.log('[MapNodeView] Route rendered:', routeKey);
      }
    } catch (error) {
      console.error('[MapNodeView] Error fetching route:', error);
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

      // Store map instance on DOM element for fullscreen access
      dom._mapInstance = currentMap;

      currentMap.once('style.load', () => {
        updateMarkers(locations);
        updateRoutes(locations); // Render routes after markers

        // Fade in the map after it's positioned
        mapContainer.style.transition = 'opacity 0.5s ease-in';
        mapContainer.style.opacity = '1';

        console.log('[MapNodeView] Map initialized with', locations.length, 'locations');
      });
    } else {
      // Map already exists, just update markers and routes
      updateMarkers(locations);
      updateRoutes(locations);
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

  // Store reference to our callback for removal
  window.mapRenderCallbacks.push(checkAndUpdate);

  return {
    dom,
    update(updatedNode: PMNode) {
      if (updatedNode.type !== node.type) {
        return false;
      }

      // Update document position (may have changed if content was inserted before this node)
      const newPos = getPos();
      if (newPos !== undefined) {
        dom.dataset.docPos = String(newPos);
      }

      // Re-render map when document updates
      renderMap();
      return true;
    },
    destroy() {
      // Remove callback from global array by reference
      if (window.mapRenderCallbacks) {
        const idx = window.mapRenderCallbacks.indexOf(checkAndUpdate);
        if (idx !== -1) {
          window.mapRenderCallbacks.splice(idx, 1);
        }
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
