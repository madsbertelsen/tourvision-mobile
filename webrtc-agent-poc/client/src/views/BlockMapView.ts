/**
 * BlockMapView - Renders inline Mapbox map blocks in ProseMirror
 *
 * Consolidates map node view logic from main.ts:972-1356
 * - Creates interactive Mapbox map blocks
 * - Renders location markers
 * - Displays routes between locations
 * - Handles reactive updates when locations change
 * - Provides fullscreen map transition
 */

import type mapboxgl from 'mapbox-gl';
import type { EditorView } from 'prosemirror-view';
import type { WaypointController } from '../controllers/WaypointController';
import type { Location } from '../types';

export interface BlockMapViewDependencies {
  waypointController: WaypointController;
  colors: string[];
  mapboxToken: string;
  geoMarkChangeListeners: Set<() => void>;
  createMarkerElement: (colorIndex: number) => HTMLElement;
  showFullscreenMap?: () => void;
}

/**
 * BlockMapView - ProseMirror NodeView for map blocks
 */
export class BlockMapView {
  private deps: BlockMapViewDependencies;

  constructor(deps: BlockMapViewDependencies) {
    this.deps = deps;
  }

  /**
   * Create a ProseMirror NodeView for a map block
   * Extracted from main.ts:972-1356
   *
   * @param node - ProseMirror map node
   * @param editorView - ProseMirror editor view
   */
  create(node: any, editorView: EditorView) {
    // Capture deps in local variable for use in closures (including destroy())
    const deps = this.deps;
    const dom = document.createElement('div');
    dom.className = 'prosemirror-map';
    dom.style.cssText = `height: ${node.attrs.height}px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; position: relative; overflow: hidden;`;

    const mapContainer = document.createElement('div');
    mapContainer.style.cssText = 'width: 100%; height: 100%; border-radius: 8px; overflow: hidden;';
    dom.appendChild(mapContainer);

    // Create clickable overlay for fullscreen
    const clickOverlay = document.createElement('div');
    clickOverlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 1000;
      cursor: pointer;
      background: transparent;
    `;
    clickOverlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (deps.showFullscreenMap) {
        deps.showFullscreenMap();
      }
    });
    dom.appendChild(clickOverlay);

    let currentMap: mapboxgl.Map | null = null;
    let currentMarkers: mapboxgl.Marker[] = [];

    // Extract locations from document
    const extractLocations = (): Location[] => {
      const locations: Location[] = [];
      editorView.state.doc.descendants((node) => {
        if (node.isText && node.marks.length > 0) {
          for (const mark of node.marks) {
            if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
              const colorIndex = mark.attrs.colorIndex ?? 0;
              locations.push({
                geoId: mark.attrs.geoId,
                displayText: mark.attrs.displayText || node.text || '',
                placeName: mark.attrs.placeName,
                lat: parseFloat(mark.attrs.lat),
                lng: parseFloat(mark.attrs.lng),
                colorIndex: colorIndex,
                color: deps.colors[colorIndex % deps.colors.length],
                transportFrom: mark.attrs.transportFrom,
                transportProfile: mark.attrs.transportProfile,
                waypoints: mark.attrs.waypoints || [],
              });
            }
          }
        }
      });
      return locations;
    };

    // Initialize and update map
    const updateMap = () => {
      const locations = extractLocations();

      if (locations.length === 0) {
        mapContainer.innerHTML = `
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #6b7280;">
            🗺️ No locations found
          </div>
        `;
        if (currentMap) {
          currentMap.remove();
          currentMap = null;
        }
        return;
      }

      if (!currentMap) {
        // Initialize Mapbox map
        (window as any).mapboxgl.accessToken = deps.mapboxToken;

        let initialCenter: [number, number] = [0, 0];
        let initialZoom = 2;

        if (locations.length === 1) {
          initialCenter = [locations[0].lng, locations[0].lat];
          initialZoom = 12;
        } else if (locations.length > 1) {
          const lngs = locations.map((l: Location) => l.lng);
          const lats = locations.map((l: Location) => l.lat);
          initialCenter = [
            (Math.min(...lngs) + Math.max(...lngs)) / 2,
            (Math.min(...lats) + Math.max(...lats)) / 2
          ];
        }

        currentMap = new (window as any).mapboxgl.Map({
          container: mapContainer,
          style: 'mapbox://styles/mapbox/light-v11',
          center: initialCenter,
          zoom: initialZoom,
          dragPan: false,
          scrollZoom: false,
          boxZoom: false,
          dragRotate: false,
          keyboard: false,
          doubleClickZoom: false,
          touchZoomRotate: false,
        });

        // Store map instance on DOM for fullscreen transition
        (dom as any)._mapInstance = currentMap;

        currentMap.once('style.load', () => {
          // Add markers
          locations.forEach((location: Location) => {
            const el = deps.createMarkerElement(location.colorIndex);
            const marker = new (window as any).mapboxgl.Marker(el)
              .setLngLat([location.lng, location.lat])
              .addTo(currentMap!);
            currentMarkers.push(marker);
          });

          // Render routes for locations with transport configuration
          locations.forEach(async (toLocation: Location) => {
            if (toLocation.transportFrom && toLocation.transportProfile) {
              const fromLocation = locations.find((loc: Location) => loc.geoId === toLocation.transportFrom);
              if (!fromLocation) return;

              const profile = toLocation.transportProfile === 'walking' ? 'walking' :
                             toLocation.transportProfile === 'cycling' ? 'cycling' :
                             'driving-traffic';

              const waypointsStr = deps.waypointController.buildWaypointsString(toLocation.waypoints);
              const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}?geometries=geojson&overview=full&access_token=${deps.mapboxToken}`;

              try {
                const response = await fetch(url);
                const data = await response.json();

                if (data.routes && data.routes.length > 0) {
                  const route = data.routes[0];
                  const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

                  if (currentMap && !currentMap.getSource(routeId)) {
                    currentMap.addSource(routeId, {
                      type: 'geojson',
                      data: {
                        type: 'Feature',
                        properties: {},
                        geometry: route.geometry
                      }
                    });

                    currentMap.addLayer({
                      id: routeId,
                      type: 'line',
                      source: routeId,
                      layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                      },
                      paint: {
                        'line-color': toLocation.color || '#3B82F6',
                        'line-width': 3,
                        'line-opacity': 0.7
                      }
                    });

                    console.log('[BlockMap] Route created:', routeId);
                  }
                }
              } catch (error) {
                console.error('[BlockMap] Error fetching route:', error);
              }
            }
          });

          // Fit bounds to show all locations
          if (locations.length === 1) {
            currentMap!.jumpTo({
              center: [locations[0].lng, locations[0].lat],
              zoom: 12
            });
          } else if (locations.length > 1) {
            const lngs = locations.map((l: Location) => l.lng);
            const lats = locations.map((l: Location) => l.lat);
            const bounds = new (window as any).mapboxgl.LngLatBounds(
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            );
            currentMap!.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15,
              duration: 0
            });
          }
        });
      }
    };

    // Initial render
    setTimeout(updateMap, 100);

    // Set up reactive updates
    let previousLocationsHash = '';
    const updateMapIfChanged = () => {
      const locations = extractLocations();
      const locationsHash = JSON.stringify(locations.map(loc => ({
        geoId: loc.geoId,
        lat: loc.lat,
        lng: loc.lng,
        transportFrom: loc.transportFrom,
        transportProfile: loc.transportProfile,
        waypoints: loc.waypoints
      })));

      if (locationsHash !== previousLocationsHash) {
        previousLocationsHash = locationsHash;

        // Remove old markers
        currentMarkers.forEach(marker => marker.remove());
        currentMarkers = [];

        if (locations.length === 0) {
          if (currentMap) {
            currentMap.remove();
            currentMap = null;
          }
          return;
        }

        if (!currentMap) {
          updateMap();
        } else {
          // Add new markers
          locations.forEach((location: Location) => {
            const el = deps.createMarkerElement(location.colorIndex);
            const marker = new (window as any).mapboxgl.Marker(el)
              .setLngLat([location.lng, location.lat])
              .addTo(currentMap!);
            currentMarkers.push(marker);
          });

          // Update routes
          locations.forEach(async (toLocation: Location) => {
            if (toLocation.transportFrom && toLocation.transportProfile) {
              const fromLocation = locations.find((loc: Location) => loc.geoId === toLocation.transportFrom);
              if (!fromLocation) return;

              const profile = toLocation.transportProfile === 'walking' ? 'walking' :
                             toLocation.transportProfile === 'cycling' ? 'cycling' :
                             'driving-traffic';

              const waypointsStr = deps.waypointController.buildWaypointsString(toLocation.waypoints);
              const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}?geometries=geojson&overview=full&access_token=${deps.mapboxToken}`;

              try {
                const response = await fetch(url);
                const data = await response.json();

                if (data.routes && data.routes.length > 0) {
                  const route = data.routes[0];
                  const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

                  if (currentMap) {
                    const existingSource = currentMap.getSource(routeId);

                    if (existingSource) {
                      // Update existing source data
                      (existingSource as mapboxgl.GeoJSONSource).setData({
                        type: 'Feature',
                        properties: {},
                        geometry: route.geometry
                      });
                      console.log('[BlockMap] Route source updated:', routeId);
                    } else {
                      // Add new source and layer
                      currentMap.addSource(routeId, {
                        type: 'geojson',
                        data: {
                          type: 'Feature',
                          properties: {},
                          geometry: route.geometry
                        }
                      });

                      currentMap.addLayer({
                        id: routeId,
                        type: 'line',
                        source: routeId,
                        layout: {
                          'line-join': 'round',
                          'line-cap': 'round'
                        },
                        paint: {
                          'line-color': toLocation.color || '#3B82F6',
                          'line-width': 3,
                          'line-opacity': 0.7
                        }
                      });

                      console.log('[BlockMap] Route created:', routeId);
                    }
                  }
                }
              } catch (error) {
                console.error('[BlockMap] Error updating route:', error);
              }
            }
          });

          // Re-fit bounds to show all locations
          if (locations.length === 1) {
            currentMap.flyTo({
              center: [locations[0].lng, locations[0].lat],
              zoom: 12,
              duration: 1500
            });
          } else if (locations.length > 1) {
            const lngs = locations.map((l: Location) => l.lng);
            const lats = locations.map((l: Location) => l.lat);
            const bounds = new (window as any).mapboxgl.LngLatBounds(
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            );
            currentMap.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15,
              duration: 1500
            });
          }
        }
      }
    };

    // Listen to geo-mark changes reactively
    deps.geoMarkChangeListeners.add(updateMapIfChanged);

    return {
      dom,
      update(newNode: any) {
        if (newNode.type.name !== 'map') return false;
        updateMap();
        return true;
      },
      destroy() {
        // Remove geo-mark change listener (use deps from closure, not this.deps)
        deps.geoMarkChangeListeners.delete(updateMapIfChanged);
        if (currentMap) {
          currentMap.remove();
        }
      }
    };
  }
}
