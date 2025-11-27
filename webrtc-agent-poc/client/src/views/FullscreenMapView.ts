/**
 * FullscreenMapView - Manages fullscreen map overlay
 *
 * Consolidates fullscreen map logic from main.ts:
 * - Lines 295-720 (showFullscreenMap function)
 * - Lines 723-759 (hideFullscreenMap function)
 * - Handles fullscreen map initialization
 * - Renders location markers with interaction handlers
 * - Displays routes between locations
 * - Manages overlay visibility and transitions
 */

import type mapboxgl from 'mapbox-gl';
import type { Location } from '../types';
import type { WaypointController } from '../controllers/WaypointController';
import type { AwarenessOverlayRenderer } from './AwarenessOverlayRenderer';
import { WebViewBridge } from '../controllers/WebViewBridge';

export interface FullscreenMapViewDependencies {
  waypointController: WaypointController;
  awarenessOverlayRenderer: AwarenessOverlayRenderer;
  mapboxToken: string;
  geoMarkChangeListeners: Set<() => void>;
  createMarkerElement: (colorIndex: number) => HTMLElement;
  extractLocationsForFullscreen: () => Location[];
  showLocationSheet: (location: any, allLocations: Location[]) => void;
  globalAwareness: any;
  shouldBroadcastBounds?: () => boolean; // Optional check for follow mode
}

export class FullscreenMapView {
  private deps: FullscreenMapViewDependencies;
  private fullscreenMap: mapboxgl.Map | null = null;
  private fullscreenMapUpdateListener: (() => void) | null = null;

  constructor(deps: FullscreenMapViewDependencies) {
    this.deps = deps;
  }

  /**
   * Show fullscreen map overlay
   * Extracted from main.ts:295-720
   * @param targetCamera Optional camera state to use (for follow mode - skips local calculation)
   */
  show(targetCamera?: {
    north: number; south: number; east: number; west: number;
    center?: { lng: number; lat: number };
    zoom?: number;
    pitch?: number;
    bearing?: number
  }): void {
    console.log('[Fullscreen] Showing fullscreen map', targetCamera ? '(with target camera)' : '');

    // Notify parent that fullscreen map is opening
    WebViewBridge.sendFullscreenMapOpened();

    // Extract locations from document
    const currentLocations = this.deps.extractLocationsForFullscreen();

    if (currentLocations.length === 0) {
      console.warn('[Fullscreen] No locations found to display');
      return;
    }

    // Find the first map container in the document to get its position
    const mapContainers = document.querySelectorAll('.prosemirror-map');
    if (mapContainers.length === 0) {
      console.warn('[Fullscreen] No map container found');
      return;
    }

    const blockMapElement = mapContainers[0] as any;
    const rect = blockMapElement.getBoundingClientRect();

    // Calculate padding for alignment reference
    const padding = {
      top: rect.top,
      left: rect.left,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom
    };

    console.log('[Fullscreen] Container rect:', rect);
    console.log('[Fullscreen] Alignment padding:', padding);

    // Use target camera (follow mode) or calculate from block map
    let adjustedBounds: any = null;
    let initialCenter: { lng: number; lat: number } | undefined;
    let initialZoom: number | undefined;

    if (targetCamera) {
      // Follow mode: use the followed user's camera state directly
      if (targetCamera.center && targetCamera.zoom !== undefined) {
        // Use center/zoom for accurate follow (works with pitch)
        initialCenter = targetCamera.center;
        initialZoom = targetCamera.zoom;
        console.log('[Fullscreen] Using target camera from followed user:', targetCamera);
      } else {
        // Fallback to bounds if center/zoom not available
        adjustedBounds = new (window as any).mapboxgl.LngLatBounds(
          [targetCamera.west, targetCamera.south],
          [targetCamera.east, targetCamera.north]
        );
        console.log('[Fullscreen] Using target bounds from followed user (fallback):', targetCamera);
      }
    } else {
      // Normal mode: calculate bounds from block map
      const blockMap = blockMapElement._mapInstance;
      if (!blockMap) {
        console.error('[Fullscreen] Block map instance not found');
        return;
      }

      // Calculate adjusted bounds that account for the fullscreen viewport
      // We use the block map's unproject to find geographic coordinates
      // at the fullscreen viewport edges, accounting for the block map's position

      // The block map's pixel coordinates relative to viewport
      const blockMapPixels = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      };

      // Fullscreen viewport edges in the block map's coordinate system
      // Negative values mean "outside" the block map
      const fsTopLeftInBlockMap = {
        x: -blockMapPixels.left,
        y: -blockMapPixels.top
      };
      const fsBottomRightInBlockMap = {
        x: window.innerWidth - blockMapPixels.left,
        y: window.innerHeight - blockMapPixels.top
      };

      // Unproject these to get geographic coordinates
      const topLeft = blockMap.unproject([fsTopLeftInBlockMap.x, fsTopLeftInBlockMap.y]);
      const bottomRight = blockMap.unproject([fsBottomRightInBlockMap.x, fsBottomRightInBlockMap.y]);

      // Create bounds from these coordinates
      adjustedBounds = new (window as any).mapboxgl.LngLatBounds(topLeft, bottomRight);

      console.log('[Fullscreen] Adjusted bounds for fullscreen:', {
        north: adjustedBounds.getNorth(),
        south: adjustedBounds.getSouth(),
        east: adjustedBounds.getEast(),
        west: adjustedBounds.getWest()
      });
    }

    // Show overlay
    const overlay = document.getElementById('fullscreen-overlay');
    if (!overlay) {
      console.error('[Fullscreen] Overlay element not found');
      return;
    }
    overlay.classList.add('visible');

    // Trigger fade-in after DOM update
    setTimeout(() => {
      overlay.classList.add('fade-in');
    }, 10);

    // Initialize fullscreen map (pass camera state for follow mode)
    const initialPitch = targetCamera?.pitch;
    const initialBearing = targetCamera?.bearing;
    setTimeout(() => {
      this.initializeFullscreenMap(adjustedBounds, currentLocations, initialPitch, initialBearing, initialCenter, initialZoom);
    }, 100);
  }

  /**
   * Initialize and render fullscreen map
   * @param adjustedBounds Bounds to fit (null if using center/zoom)
   * @param currentLocations Locations to display
   * @param initialPitch Optional initial pitch/tilt (for follow mode)
   * @param initialBearing Optional initial bearing/heading (for follow mode)
   * @param initialCenter Optional initial center (for follow mode - more accurate than bounds with pitch)
   * @param initialZoom Optional initial zoom (for follow mode)
   */
  private initializeFullscreenMap(
    adjustedBounds: any,
    currentLocations: Location[],
    initialPitch?: number,
    initialBearing?: number,
    initialCenter?: { lng: number; lat: number },
    initialZoom?: number
  ): void {
    // Remove existing map if any
    if (this.fullscreenMap) {
      this.fullscreenMap.remove();
    }

    console.log('[Fullscreen] Creating map', {
      useCenter: !!initialCenter,
      center: initialCenter,
      zoom: initialZoom,
      pitch: initialPitch,
      bearing: initialBearing
    });

    // Set Mapbox token
    (window as any).mapboxgl.accessToken = this.deps.mapboxToken;

    // Create fullscreen map
    // Use center/zoom for follow mode (more accurate with pitch), otherwise use bounds
    const mapOptions: any = {
      container: 'fullscreen-map',
      style: 'mapbox://styles/mapbox/light-v11',
      interactive: true,
      trackResize: true,
      fadeDuration: 0
    };

    if (initialCenter && initialZoom !== undefined) {
      // Follow mode: use exact camera state (center, zoom, pitch, bearing)
      // This is more accurate than bounds when pitch is applied
      mapOptions.center = [initialCenter.lng, initialCenter.lat];
      mapOptions.zoom = initialZoom;
      mapOptions.pitch = initialPitch ?? 0;
      mapOptions.bearing = initialBearing ?? 0;
    } else if (adjustedBounds) {
      // Normal mode: use bounds with optional pitch/bearing
      mapOptions.bounds = adjustedBounds;
      mapOptions.fitBoundsOptions = {
        padding: 0,  // No padding needed - bounds are already adjusted
        duration: 0
      };
      if (initialPitch !== undefined) {
        mapOptions.pitch = initialPitch;
      }
      if (initialBearing !== undefined) {
        mapOptions.bearing = initialBearing;
      }
    }

    this.fullscreenMap = new (window as any).mapboxgl.Map(mapOptions);

    // Add markers
    this.fullscreenMap.on('load', () => {
      this.renderMarkersAndRoutes(currentLocations);
      this.setupReactiveUpdates(currentLocations);
    });

    // Listen for map movement to update awareness
    this.fullscreenMap.on('moveend', () => {
      // Skip broadcasting if we're following someone (to avoid conflicts)
      if (this.deps.shouldBroadcastBounds && !this.deps.shouldBroadcastBounds()) {
        console.log('[Fullscreen] Map moveend - skipping broadcast (following mode)');
        return;
      }
      console.log('[Fullscreen] Map moveend - updating awareness');
      if (this.deps.globalAwareness && this.fullscreenMap) {
        this.deps.awarenessOverlayRenderer.updateMapBoundsAwareness(this.deps.globalAwareness, this.fullscreenMap);
      }
    });

    // Update awareness once after initial load
    this.fullscreenMap.once('idle', () => {
      // Skip broadcasting if we're following someone (to avoid conflicts)
      if (this.deps.shouldBroadcastBounds && !this.deps.shouldBroadcastBounds()) {
        console.log('[Fullscreen] Map idle - skipping broadcast (following mode)');
        return;
      }
      console.log('[Fullscreen] Map idle - initial bounds update');
      if (this.deps.globalAwareness && this.fullscreenMap) {
        this.deps.awarenessOverlayRenderer.updateMapBoundsAwareness(this.deps.globalAwareness, this.fullscreenMap);
      }
    });
  }

  /**
   * Render markers and routes on fullscreen map
   */
  private renderMarkersAndRoutes(currentLocations: Location[]): void {
    console.log('[Fullscreen] Map loaded, adding markers');
    
    currentLocations.forEach((location) => {
      const el = this.deps.createMarkerElement(location.colorIndex);

      // Create marker (no popup - using location sheet instead)
      const marker = new (window as any).mapboxgl.Marker(el)
        .setLngLat([location.lng, location.lat])
        .addTo(this.fullscreenMap!);

      // Add click handler to the actual marker element after it's been added
      const markerElement = marker.getElement();

      // Handler function for both click and touch events
      const handleMarkerInteraction = (e: Event) => {
        console.log('[Fullscreen] Marker interaction triggered:', e.type, location);
        // Check if we're in a WebView/iframe context
        const isInWebView = WebViewBridge.isInWebView();
        console.log('[Fullscreen] isInWebView:', isInWebView);

        if (isInWebView) {
          // In WebView: prevent default and send postMessage
          e.preventDefault();
          e.stopPropagation();

          // Extract ALL locations from document
          const allLocations = this.deps.extractLocationsForFullscreen();
          console.log('[Fullscreen] All locations from document:', allLocations);

          const message = {
            type: 'openLocationDetails',
            location: {
              geoId: location.geoId,
              displayText: location.displayText,
              placeName: location.placeName,
              lat: location.lat,
              lng: location.lng,
              colorIndex: location.colorIndex
            },
            allLocations: allLocations // Send all locations to React Native
          };

          // Send via WebViewBridge
          WebViewBridge.postMessage(message as any, '[Fullscreen]');
        } else {
          // In regular browser: show location sheet
          console.log('[Fullscreen] In browser, showing location sheet');
          this.deps.showLocationSheet({
            geoId: location.geoId,
            displayText: location.displayText,
            placeName: location.placeName,
            lat: location.lat,
            lng: location.lng,
            colorIndex: location.colorIndex,
            color: location.color,
            transportFrom: location.transportFrom,
            transportProfile: location.transportProfile,
            waypoints: location.waypoints
          }, currentLocations);
        }
      };

      // Listen to both click (browser) and touchend (mobile) events
      markerElement.addEventListener('click', handleMarkerInteraction);
      markerElement.addEventListener('touchend', handleMarkerInteraction);
      console.log('[Fullscreen] Added click and touchend listeners to marker:', location.geoId);
    });

    // Render routes for locations with transport configuration
    this.renderRoutes(currentLocations);
  }

  /**
   * Render routes between locations
   */
  private async renderRoutes(currentLocations: Location[]): Promise<void> {
    console.log('[Routes] Checking for transport configurations...');
    console.log('[Routes] currentLocations at map load:', JSON.stringify(currentLocations, null, 2));
    console.log('[Routes] Locations with transport:', currentLocations.filter(loc => loc.transportFrom || loc.transportProfile));
    
    for (const toLocation of currentLocations) {
      if (toLocation.transportFrom && toLocation.transportProfile) {
        const fromLocation = currentLocations.find(loc => loc.geoId === toLocation.transportFrom);
        if (!fromLocation) {
          console.warn('[Routes] Source location not found:', toLocation.transportFrom);
          continue;
        }

        const profile = toLocation.transportProfile === 'walking' ? 'walking' :
                       toLocation.transportProfile === 'cycling' ? 'cycling' :
                       'driving-traffic';

        const waypointsStr = this.deps.waypointController.buildWaypointsString(toLocation.waypoints);
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}?geometries=geojson&overview=full&access_token=${this.deps.mapboxToken}`;

        try {
          console.log('[Routes] Fetching route:', { from: fromLocation.geoId, to: toLocation.geoId, profile });
          const response = await fetch(url);
          const data = await response.json();

          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

            console.log('[Routes] Route fetched, distance:', route.distance, 'duration:', route.duration);

            if (this.fullscreenMap && !this.fullscreenMap.getSource(routeId)) {
              this.fullscreenMap.addSource(routeId, {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: route.geometry
                }
              });

              this.fullscreenMap.addLayer({
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

              // Add click handler to route for adding waypoints
              this.fullscreenMap.on('click', routeId, (e: any) => {
                console.log('[Routes] Route clicked:', routeId, e.lngLat);

                // Get the clicked coordinates
                const { lng, lat } = e.lngLat;

                // Add waypoint to the geo-mark using controller
                const destGeoId = toLocation.geoId!;
                const success = this.deps.waypointController.addWaypoint(destGeoId, lat, lng);

                // If waypoint was added successfully, render all waypoint markers for this location
                if (success && this.fullscreenMap) {
                  // Extract updated location to get the new waypoints array
                  const updatedLocations = this.deps.extractLocationsForFullscreen();
                  const updatedLocation = updatedLocations.find(loc => loc.geoId === destGeoId);

                  if (updatedLocation && updatedLocation.waypoints) {
                    this.deps.waypointController.renderWaypointMarkers(
                      this.fullscreenMap,
                      destGeoId,
                      updatedLocation.waypoints,
                      toLocation.color || '#3B82F6'
                    );
                  }
                }
              });

              // Change cursor on hover
              this.fullscreenMap.on('mouseenter', routeId, () => {
                this.fullscreenMap!.getCanvas().style.cursor = 'pointer';
              });
              this.fullscreenMap.on('mouseleave', routeId, () => {
                this.fullscreenMap!.getCanvas().style.cursor = '';
              });

              // Render waypoint markers if waypoints exist
              if (toLocation.waypoints && toLocation.waypoints.length > 0) {
                this.deps.waypointController.renderWaypointMarkers(
                  this.fullscreenMap,
                  toLocation.geoId!,
                  toLocation.waypoints,
                  toLocation.color || '#3B82F6'
                );
              }

              console.log('[Routes] Route layer added:', routeId);
            }
          }
        } catch (error) {
          console.error('[Routes] Error fetching route:', error);
        }
      }
    }
  }

  /**
   * Setup reactive route updates when locations change
   */
  private setupReactiveUpdates(initialLocations: Location[]): void {
    // Cache for tracking route changes
    let previousLocations = initialLocations;

    const updateRoutesIfChanged = () => {
      const updatedLocations = this.deps.extractLocationsForFullscreen();
      const locationsChanged = JSON.stringify(updatedLocations.map(loc => ({
        geoId: loc.geoId,
        transportFrom: loc.transportFrom,
        transportProfile: loc.transportProfile,
        waypoints: loc.waypoints
      }))) !== JSON.stringify(previousLocations.map(loc => ({
        geoId: loc.geoId,
        transportFrom: loc.transportFrom,
        transportProfile: loc.transportProfile,
        waypoints: loc.waypoints
      })));

      if (locationsChanged) {
        console.log('[Routes] Locations changed, updating routes');
        previousLocations = updatedLocations;

        // Update routes
        updatedLocations.forEach(async (toLocation) => {
          if (toLocation.transportFrom && toLocation.transportProfile) {
            const fromLocation = updatedLocations.find(loc => loc.geoId === toLocation.transportFrom);
            if (!fromLocation) {
              console.warn('[Routes] Source location not found:', toLocation.transportFrom);
              return;
            }

            const profile = toLocation.transportProfile === 'walking' ? 'walking' :
                           toLocation.transportProfile === 'cycling' ? 'cycling' :
                           'driving-traffic';

            const waypointsStr = this.deps.waypointController.buildWaypointsString(toLocation.waypoints);
            const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}?geometries=geojson&overview=full&access_token=${this.deps.mapboxToken}`;

            try {
              const response = await fetch(url);
              const data = await response.json();

              if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

                if (this.fullscreenMap) {
                  const existingSource = this.fullscreenMap.getSource(routeId);

                  if (existingSource) {
                    // Update existing source
                    (existingSource as any).setData({
                      type: 'Feature',
                      properties: {},
                      geometry: route.geometry
                    });
                    console.log('[Routes] Route updated:', routeId);
                  } else {
                    // Add new source and layer
                    this.fullscreenMap.addSource(routeId, {
                      type: 'geojson',
                      data: {
                        type: 'Feature',
                        properties: {},
                        geometry: route.geometry
                      }
                    });

                    this.fullscreenMap.addLayer({
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

                    // Add click handler to route for adding waypoints
                    this.fullscreenMap.on('click', routeId, (e: any) => {
                      console.log('[Routes] Route clicked:', routeId, e.lngLat);

                      // Get the clicked coordinates
                      const { lng, lat } = e.lngLat;

                      // Add waypoint to the geo-mark using controller
                      const destGeoId = toLocation.geoId!;
                      const success = this.deps.waypointController.addWaypoint(destGeoId, lat, lng);

                      // If waypoint was added successfully, render all waypoint markers for this location
                      if (success && this.fullscreenMap) {
                        // Extract updated location to get the new waypoints array
                        const updatedLocations = this.deps.extractLocationsForFullscreen();
                        const updatedLocation = updatedLocations.find(loc => loc.geoId === destGeoId);

                        if (updatedLocation && updatedLocation.waypoints) {
                          this.deps.waypointController.renderWaypointMarkers(
                            this.fullscreenMap,
                            destGeoId,
                            updatedLocation.waypoints,
                            toLocation.color || '#3B82F6'
                          );
                        }
                      }
                    });

                    // Change cursor on hover
                    this.fullscreenMap.on('mouseenter', routeId, () => {
                      this.fullscreenMap!.getCanvas().style.cursor = 'pointer';
                    });
                    this.fullscreenMap.on('mouseleave', routeId, () => {
                      this.fullscreenMap!.getCanvas().style.cursor = '';
                    });

                    // Render waypoint markers if waypoints exist
                    if (toLocation.waypoints && toLocation.waypoints.length > 0) {
                      this.deps.waypointController.renderWaypointMarkers(
                        this.fullscreenMap,
                        toLocation.geoId!,
                        toLocation.waypoints,
                        toLocation.color || '#3B82F6'
                      );
                    }

                    console.log('[Routes] New route added:', routeId);
                  }
                }
              }
            } catch (error) {
              console.error('[Routes] Error updating route:', error);
            }
          }
        });
      }
    };

    // Listen to geo-mark changes reactively
    this.fullscreenMapUpdateListener = updateRoutesIfChanged;
    this.deps.geoMarkChangeListeners.add(updateRoutesIfChanged);
    console.log('[Fullscreen] Added geo-mark change listener');
  }

  /**
   * Hide fullscreen map overlay
   * Extracted from main.ts:723-759
   */
  hide(): void {
    console.log('[Fullscreen] Hiding fullscreen map');

    // Notify parent that fullscreen map is closing
    WebViewBridge.sendFullscreenMapClosed();
    console.log('[Fullscreen] Sent fullscreenMapClosed message to parent');

    // Clear map bounds from awareness
    if (this.deps.globalAwareness) {
      const currentUser = this.deps.globalAwareness.getLocalState()?.user || {};
      this.deps.globalAwareness.setLocalStateField('user', {
        ...currentUser,
        mapBounds: null,
      });
      console.log('[Awareness] Cleared map bounds');
    }

    // Remove geo-mark change listener
    if (this.fullscreenMapUpdateListener) {
      this.deps.geoMarkChangeListeners.delete(this.fullscreenMapUpdateListener);
      this.fullscreenMapUpdateListener = null;
      console.log('[Fullscreen] Removed geo-mark change listener');
    }

    const overlay = document.getElementById('fullscreen-overlay');
    if (overlay) {
      overlay.classList.remove('fade-in');

      setTimeout(() => {
        overlay.classList.remove('visible');
        if (this.fullscreenMap) {
          this.fullscreenMap.remove();
          this.fullscreenMap = null;
        }
      }, 300);
    }
  }

  /**
   * Get the current fullscreen map instance
   */
  getMap(): mapboxgl.Map | null {
    return this.fullscreenMap;
  }

  /**
   * Sync the fullscreen map to the followed user's camera state
   * Uses center/zoom/pitch/bearing for accurate sync (bounds alone don't work with pitch)
   */
  fitBounds(cameraData: {
    north: number; south: number; east: number; west: number;
    center?: { lng: number; lat: number };
    zoom?: number;
    pitch?: number;
    bearing?: number
  }): void {
    if (!this.fullscreenMap || !cameraData) {
      console.log('[Fullscreen] Cannot sync camera - map not available or no camera data');
      return;
    }

    // If we have full camera state (center, zoom, pitch, bearing), use it directly
    // This is more accurate than trying to reconstruct from bounds with pitch
    if (cameraData.center && cameraData.zoom !== undefined) {
      console.log('[Fullscreen] Syncing camera state:', {
        center: cameraData.center,
        zoom: cameraData.zoom,
        pitch: cameraData.pitch,
        bearing: cameraData.bearing
      });

      this.fullscreenMap.flyTo({
        center: [cameraData.center.lng, cameraData.center.lat],
        zoom: cameraData.zoom,
        pitch: cameraData.pitch ?? 0,
        bearing: cameraData.bearing ?? 0,
        duration: 300,
        essential: true
      });
    } else {
      // Fallback to bounds-based approach (for backwards compatibility)
      console.log('[Fullscreen] Falling back to bounds-based sync');
      const bounds = new (window as any).mapboxgl.LngLatBounds(
        [cameraData.west, cameraData.south],
        [cameraData.east, cameraData.north]
      );

      this.fullscreenMap.fitBounds(bounds, {
        padding: 0,
        animate: true,
        duration: 300
      });
    }
  }
}
