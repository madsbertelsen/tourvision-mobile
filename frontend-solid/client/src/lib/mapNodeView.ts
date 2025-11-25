import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { COLORS } from './prosemirror-schema';

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

    view.state.doc.descendants((node) => {
      if (node.isText && node.marks.length > 0) {
        for (const mark of node.marks) {
          if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
            locations.push({
              geoId: mark.attrs.geoId,
              displayText: mark.attrs.displayText || node.text || '',
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
      if (currentMap) {
        currentMarkers.forEach(marker => marker.remove());
        currentMap.remove();
        currentMap = null;
      }
    }
  };
}
