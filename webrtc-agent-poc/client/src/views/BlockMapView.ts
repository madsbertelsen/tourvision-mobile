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
   * @param getPos - Function to get node's position in document
   */
  create(node: any, editorView: EditorView, getPos: () => number | undefined) {
    // Capture deps in local variable for use in closures (including destroy())
    const deps = this.deps;
    const dom = document.createElement('div');
    dom.className = 'prosemirror-map';
    dom.style.cssText = `height: ${node.attrs.height}px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; position: relative; overflow: hidden;`;

    // Create wrapper for both maps
    const mapWrapper = document.createElement('div');
    mapWrapper.style.cssText = 'width: 100%; height: 100%; border-radius: 8px; overflow: hidden; position: relative;';
    dom.appendChild(mapWrapper);

    // Colored map container (behind, z-index: 1) - pre-loads streets style
    const coloredMapContainer = document.createElement('div');
    coloredMapContainer.style.cssText = 'position: absolute; inset: 0; z-index: 1;';
    mapWrapper.appendChild(coloredMapContainer);

    // Light map container (on top, z-index: 2) - visible by default
    const lightMapContainer = document.createElement('div');
    lightMapContainer.className = 'block-map-light-layer';
    lightMapContainer.style.cssText = 'position: absolute; inset: 0; z-index: 2; transition: opacity 300ms ease-out;';
    mapWrapper.appendChild(lightMapContainer);

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

    // Two map instances: light (visible) and colored (pre-loading behind)
    let lightMap: mapboxgl.Map | null = null;
    let coloredMap: mapboxgl.Map | null = null;
    let lightMarkers: mapboxgl.Marker[] = [];
    let coloredMarkers: mapboxgl.Marker[] = [];
    let currentRouteIds: string[] = []; // Track route layer IDs for cleanup (on colored map)

    /**
     * Find the section boundaries for this map (between previous heading and map position)
     */
    const getSectionBounds = (): { start: number; end: number } => {
      const mapPos = getPos();
      if (mapPos === undefined) return { start: 0, end: 0 };

      const doc = editorView.state.doc;
      let sectionStart = 0;

      // Find the last heading before this map's position
      doc.nodesBetween(0, mapPos, (node, pos) => {
        if (node.type.name === 'heading') {
          sectionStart = pos + node.nodeSize; // Start after the heading
        }
      });

      return { start: sectionStart, end: mapPos };
    };

    // Extract locations from this section only
    const extractLocations = (): Location[] => {
      const locations: Location[] = [];
      const { start, end } = getSectionBounds();

      if (end <= start) return locations;

      editorView.state.doc.nodesBetween(start, end, (node) => {
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
        lightMapContainer.innerHTML = `
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #6b7280;">
            🗺️ No locations found
          </div>
        `;
        if (lightMap) {
          lightMap.remove();
          lightMap = null;
        }
        if (coloredMap) {
          coloredMap.remove();
          coloredMap = null;
        }
        return;
      }

      if (!lightMap) {
        // Initialize Mapbox maps
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

        // Common map options (no interaction - block map is read-only)
        const commonMapOptions = {
          center: initialCenter,
          zoom: initialZoom,
          dragPan: false,
          scrollZoom: false,
          boxZoom: false,
          dragRotate: false,
          keyboard: false,
          doubleClickZoom: false,
          touchZoomRotate: false,
        };

        // Create LIGHT map (visible on top)
        lightMap = new (window as any).mapboxgl.Map({
          container: lightMapContainer,
          style: 'mapbox://styles/mapbox/light-v11',
          ...commonMapOptions,
        });

        // Create COLORED map (pre-loading behind)
        coloredMap = new (window as any).mapboxgl.Map({
          container: coloredMapContainer,
          style: 'mapbox://styles/mapbox/streets-v12',
          ...commonMapOptions,
        });

        // Store both map instances on DOM for fullscreen transition
        (dom as any)._lightMapInstance = lightMap;
        (dom as any)._coloredMapInstance = coloredMap;
        (dom as any)._lightMapContainer = lightMapContainer;
        // Keep backward compatibility
        (dom as any)._mapInstance = lightMap;

        // Add markers and fit bounds on LIGHT map
        lightMap.once('style.load', () => {
          // Add markers to light map
          locations.forEach((location: Location) => {
            const el = deps.createMarkerElement(location.colorIndex);
            const marker = new (window as any).mapboxgl.Marker(el)
              .setLngLat([location.lng, location.lat])
              .addTo(lightMap!);
            lightMarkers.push(marker);
          });

          // Render routes on light map
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

                  if (lightMap && !lightMap.getSource(routeId)) {
                    lightMap.addSource(routeId, {
                      type: 'geojson',
                      data: {
                        type: 'Feature',
                        properties: {},
                        geometry: route.geometry
                      }
                    });

                    lightMap.addLayer({
                      id: routeId,
                      type: 'line',
                      source: routeId,
                      layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                      },
                      paint: {
                        'line-color': toLocation.color || '#3B82F6',
                        'line-width': 4,
                        'line-opacity': 0.8
                      }
                    });

                    currentRouteIds.push(routeId);
                    console.log('[BlockMap] Route created on light map:', routeId);
                  }
                }
              } catch (error) {
                console.error('[BlockMap] Error fetching route:', error);
              }
            }
          });

          // Fit bounds on light map
          if (locations.length === 1) {
            lightMap!.jumpTo({
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
            lightMap!.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15,
              duration: 0
            });
          }
        });

        // Add markers, routes, and fit bounds on COLORED map
        coloredMap.once('style.load', () => {
          // Add markers to colored map
          locations.forEach((location: Location) => {
            const el = deps.createMarkerElement(location.colorIndex);
            const marker = new (window as any).mapboxgl.Marker(el)
              .setLngLat([location.lng, location.lat])
              .addTo(coloredMap!);
            coloredMarkers.push(marker);
          });

          // Render routes on colored map (for fullscreen transition)
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

                  if (coloredMap && !coloredMap.getSource(routeId)) {
                    coloredMap.addSource(routeId, {
                      type: 'geojson',
                      data: {
                        type: 'Feature',
                        properties: {},
                        geometry: route.geometry
                      }
                    });

                    coloredMap.addLayer({
                      id: routeId,
                      type: 'line',
                      source: routeId,
                      layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                      },
                      paint: {
                        'line-color': toLocation.color || '#3B82F6',
                        'line-width': 4,
                        'line-opacity': 0.8
                      }
                    });

                    currentRouteIds.push(routeId); // Track for cleanup
                    console.log('[BlockMap] Route created on colored map:', routeId);
                  }
                }
              } catch (error) {
                console.error('[BlockMap] Error fetching route:', error);
              }
            }
          });

          // Fit bounds on colored map (same as light map)
          if (locations.length === 1) {
            coloredMap!.jumpTo({
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
            coloredMap!.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15,
              duration: 0
            });
          }

          console.log('[BlockMap] Colored map pre-loaded and ready');
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

        // Remove old markers from both maps
        lightMarkers.forEach(marker => marker.remove());
        lightMarkers = [];
        coloredMarkers.forEach(marker => marker.remove());
        coloredMarkers = [];

        // Remove old route layers and sources from colored map
        if (coloredMap) {
          currentRouteIds.forEach(routeId => {
            try {
              if (coloredMap!.getLayer(routeId)) {
                coloredMap!.removeLayer(routeId);
              }
              if (coloredMap!.getSource(routeId)) {
                coloredMap!.removeSource(routeId);
              }
            } catch (e) {
              console.warn('[BlockMap] Error removing route:', routeId, e);
            }
          });
        }
        currentRouteIds = [];

        if (locations.length === 0) {
          if (lightMap) {
            lightMap.remove();
            lightMap = null;
          }
          if (coloredMap) {
            coloredMap.remove();
            coloredMap = null;
          }
          return;
        }

        if (!lightMap) {
          updateMap();
        } else {
          // Add new markers to LIGHT map
          locations.forEach((location: Location) => {
            const el = deps.createMarkerElement(location.colorIndex);
            const marker = new (window as any).mapboxgl.Marker(el)
              .setLngLat([location.lng, location.lat])
              .addTo(lightMap!);
            lightMarkers.push(marker);
          });

          // Update routes on LIGHT map
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

                  if (lightMap) {
                    const existingSource = lightMap.getSource(routeId);

                    if (existingSource) {
                      // Update existing source data
                      (existingSource as mapboxgl.GeoJSONSource).setData({
                        type: 'Feature',
                        properties: {},
                        geometry: route.geometry
                      });
                      console.log('[BlockMap] Route source updated on light map:', routeId);
                    } else {
                      // Add new source and layer
                      lightMap.addSource(routeId, {
                        type: 'geojson',
                        data: {
                          type: 'Feature',
                          properties: {},
                          geometry: route.geometry
                        }
                      });

                      lightMap.addLayer({
                        id: routeId,
                        type: 'line',
                        source: routeId,
                        layout: {
                          'line-join': 'round',
                          'line-cap': 'round'
                        },
                        paint: {
                          'line-color': toLocation.color || '#3B82F6',
                          'line-width': 4,
                          'line-opacity': 0.8
                        }
                      });

                      currentRouteIds.push(routeId);
                      console.log('[BlockMap] Route created on light map:', routeId);
                    }
                  }
                }
              } catch (error) {
                console.error('[BlockMap] Error updating route on light map:', error);
              }
            }
          });

          // Add new markers to COLORED map
          if (coloredMap) {
            locations.forEach((location: Location) => {
              const el = deps.createMarkerElement(location.colorIndex);
              const marker = new (window as any).mapboxgl.Marker(el)
                .setLngLat([location.lng, location.lat])
                .addTo(coloredMap!);
              coloredMarkers.push(marker);
            });
          }

          // Update routes on COLORED map (for fullscreen transition)
          if (coloredMap) {
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

                    if (coloredMap) {
                      const existingSource = coloredMap.getSource(routeId);

                      if (existingSource) {
                        // Update existing source data
                        (existingSource as mapboxgl.GeoJSONSource).setData({
                          type: 'Feature',
                          properties: {},
                          geometry: route.geometry
                        });
                        console.log('[BlockMap] Route source updated on colored map:', routeId);
                      } else {
                        // Add new source and layer
                        coloredMap.addSource(routeId, {
                          type: 'geojson',
                          data: {
                            type: 'Feature',
                            properties: {},
                            geometry: route.geometry
                          }
                        });

                        coloredMap.addLayer({
                          id: routeId,
                          type: 'line',
                          source: routeId,
                          layout: {
                            'line-join': 'round',
                            'line-cap': 'round'
                          },
                          paint: {
                            'line-color': toLocation.color || '#3B82F6',
                            'line-width': 4,
                            'line-opacity': 0.8
                          }
                        });

                        currentRouteIds.push(routeId); // Track for cleanup
                        console.log('[BlockMap] Route created on colored map:', routeId);
                      }
                    }
                  }
                } catch (error) {
                  console.error('[BlockMap] Error updating route on colored map:', error);
                }
              }
            });
          }

          // Re-fit bounds on BOTH maps
          if (locations.length === 1) {
            lightMap.flyTo({
              center: [locations[0].lng, locations[0].lat],
              zoom: 12,
              duration: 1500
            });
            if (coloredMap) {
              coloredMap.flyTo({
                center: [locations[0].lng, locations[0].lat],
                zoom: 12,
                duration: 1500
              });
            }
          } else if (locations.length > 1) {
            const lngs = locations.map((l: Location) => l.lng);
            const lats = locations.map((l: Location) => l.lat);
            const bounds = new (window as any).mapboxgl.LngLatBounds(
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            );
            lightMap.fitBounds(bounds, {
              padding: 50,
              maxZoom: 15,
              duration: 1500
            });
            if (coloredMap) {
              coloredMap.fitBounds(bounds, {
                padding: 50,
                maxZoom: 15,
                duration: 1500
              });
            }
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
        if (lightMap) {
          lightMap.remove();
        }
        if (coloredMap) {
          coloredMap.remove();
        }
      }
    };
  }
}
