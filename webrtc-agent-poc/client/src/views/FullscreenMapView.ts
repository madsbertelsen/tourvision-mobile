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
import type { Location, MapInteractionState } from '../types';
import type { WaypointController } from '../controllers/WaypointController';
import type { AwarenessOverlayRenderer } from './AwarenessOverlayRenderer';
import type { MapInteractionService } from '../services/MapInteractionService';
import { WebViewBridge } from '../controllers/WebViewBridge';

// Throttle utility - limits function calls to once per `wait` ms
function throttle<T extends (...args: any[]) => void>(fn: T, wait: number): T {
  let lastTime = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastTime);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastTime = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastTime = Date.now();
        timeout = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

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
  mapInteractionService?: MapInteractionService; // Optional for collaborative finger tracking
  onInteraction?: () => void; // Optional callback when user interacts with map
}

// Map style definitions
const MAP_STYLES: Record<string, string> = {
  light: 'mapbox://styles/mapbox/light-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/streets-v12',
  colorful: 'mapbox://styles/madsbertelsen/cmgz1s4y7005r01sbdkexgi5j',
};

// Default style for fullscreen map
const DEFAULT_FULLSCREEN_STYLE = 'streets';

const MAP_STYLE_STORAGE_KEY = 'tourvision-map-style';

export class FullscreenMapView {
  private deps: FullscreenMapViewDependencies;
  private fullscreenMap: mapboxgl.Map | null = null;
  private fullscreenMapUpdateListener: (() => void) | null = null;
  private currentStyle: string = DEFAULT_FULLSCREEN_STYLE;
  private currentLocations: Location[] = []; // Store for style change re-render

  // Pointer event tracking for collaborative finger sync
  private pointerEventHandlers: {
    pointerdown: (e: PointerEvent) => void;
    pointermove: (e: PointerEvent) => void;
    pointerup: (e: PointerEvent) => void;
    pointercancel: (e: PointerEvent) => void;
  } | null = null;
  private isPointerDown = false;

  // Remote finger overlay elements (keyed by clientId)
  private remoteFingerElements = new Map<number, HTMLElement>();
  // SVG line elements connecting avatar badge to finger (keyed by clientId)
  private remoteFingerLines = new Map<number, SVGSVGElement>();
  private remoteInteractionCallback: ((
    clientId: number,
    userName: string,
    userColor: string,
    state: MapInteractionState | null
  ) => void) | null = null;

  constructor(deps: FullscreenMapViewDependencies) {
    this.deps = deps;
    // Load saved style preference
    const savedStyle = localStorage.getItem(MAP_STYLE_STORAGE_KEY);
    if (savedStyle && MAP_STYLES[savedStyle]) {
      this.currentStyle = savedStyle;
    }
    // Setup style switcher event listeners
    this.setupStyleSwitcher();
  }

  /**
   * Public getter for the fullscreen map instance (for tool execution)
   */
  get map(): mapboxgl.Map | null {
    return this.fullscreenMap;
  }

  /**
   * Setup event listeners for the map style switcher buttons
   */
  private setupStyleSwitcher(): void {
    const styleButtons = document.querySelectorAll('.map-style-btn');
    styleButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const style = target.dataset.style;
        if (style && MAP_STYLES[style]) {
          this.setMapStyle(style);
        }
      });
    });

    // Update active button state on page load
    this.updateStyleButtonState();
  }

  /**
   * Update the active state of style switcher buttons
   */
  private updateStyleButtonState(): void {
    const styleButtons = document.querySelectorAll('.map-style-btn');
    styleButtons.forEach((btn) => {
      const buttonStyle = (btn as HTMLElement).dataset.style;
      btn.classList.toggle('active', buttonStyle === this.currentStyle);
    });
  }

  /**
   * Change the map style
   * @param styleName The style name (light, dark, satellite, streets)
   * @param broadcast Whether to broadcast through awareness (default: true)
   */
  setMapStyle(styleName: string, broadcast: boolean = true): void {
    if (!MAP_STYLES[styleName]) {
      console.warn('[Fullscreen] Unknown map style:', styleName);
      return;
    }

    this.currentStyle = styleName;
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, styleName);
    this.updateStyleButtonState();

    if (this.fullscreenMap) {
      console.log('[Fullscreen] Changing map style to:', styleName);
      this.fullscreenMap.setStyle(MAP_STYLES[styleName]);
    }

    // Broadcast style change through awareness (for follow mode)
    if (broadcast && this.deps.globalAwareness) {
      const currentUser = this.deps.globalAwareness.getLocalState()?.user || {};
      this.deps.globalAwareness.setLocalStateField('user', {
        ...currentUser,
        mapStyle: styleName,
      });
      console.log('[Fullscreen] Broadcasted map style:', styleName);
    }
  }

  /**
   * Get current style name
   */
  getCurrentStyle(): string {
    return this.currentStyle;
  }

  /**
   * Get current map style URL
   */
  private getMapStyleUrl(): string {
    return MAP_STYLES[this.currentStyle] || MAP_STYLES[DEFAULT_FULLSCREEN_STYLE];
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

    const hasLocations = currentLocations.length > 0;
    if (!hasLocations) {
      console.log('[Fullscreen] No locations found - will show map centered on Europe');
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

    // Fade out the light map layer to reveal the pre-loaded colored map
    const lightMapContainer = blockMapElement._lightMapContainer as HTMLElement | undefined;
    if (lightMapContainer) {
      console.log('[Fullscreen] Fading out light map layer');
      lightMapContainer.style.opacity = '0';
    }

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
    } else if (!hasLocations) {
      // No locations: use default Europe bounds
      const europeBounds = new (window as any).mapboxgl.LngLatBounds(
        [-10, 35],  // Southwest: West of Portugal, South of Spain
        [30, 65]    // Northeast: East of Poland, North of Scandinavia
      );
      adjustedBounds = europeBounds;
      console.log('[Fullscreen] Using default Europe bounds (no locations)');
    } else {
      // Normal mode: calculate bounds from colored map (already visible behind light map)
      // Prefer the colored map instance for bounds calculation (same coordinates, but it's the one that will be visible)
      const coloredMap = blockMapElement._coloredMapInstance;
      const blockMap = coloredMap || blockMapElement._mapInstance;
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
    // Always use 'streets' style initially to match the pre-loaded colored map behind the block map
    // This ensures seamless transition: light fades → colored revealed → fullscreen appears with same style
    const mapOptions: any = {
      container: 'fullscreen-map',
      style: MAP_STYLES['streets'],
      interactive: true,
      trackResize: true,
      fadeDuration: 0,
      preserveDrawingBuffer: true, // Enable WebGL canvas capture for screenshots
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

    // Store locations for style change re-renders
    this.currentLocations = currentLocations;

    // Add markers on initial load (light style)
    this.fullscreenMap.on('load', () => {
      console.log('[Fullscreen] Initial map load complete');
      this.renderMarkersAndRoutes(currentLocations);
      this.setupReactiveUpdates(currentLocations);

      // Setup pointer event listeners for collaborative finger tracking
      this.setupPointerEventListeners();
      this.setupRemoteFingerOverlay();
    });

    // Re-render markers when style changes (e.g., user switches map style via style switcher)
    this.fullscreenMap.on('style.load', () => {
      console.log('[Fullscreen] Style loaded, re-rendering markers');
      // Re-render markers with current locations
      this.renderMarkersAndRoutes(this.currentLocations);
    });

    // Listen for map movement to update awareness (final position)
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

    // Real-time map position sync during drag (throttled ~50ms for follow mode)
    const throttledMoveBroadcast = throttle(() => {
      // Skip broadcasting if we're following someone (to avoid feedback loops)
      if (this.deps.shouldBroadcastBounds && !this.deps.shouldBroadcastBounds()) {
        return;
      }
      if (this.deps.globalAwareness && this.fullscreenMap) {
        this.deps.awarenessOverlayRenderer.updateMapBoundsAwareness(this.deps.globalAwareness, this.fullscreenMap);
      }
    }, 50);

    this.fullscreenMap.on('move', throttledMoveBroadcast);

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
        // Check if autoplay is enabled - if so, show sheet directly even in iframe
        const urlParams = new URLSearchParams(window.location.search);
        const isAutoplay = urlParams.get('autoplay') === 'true';
        console.log('[Fullscreen] isInWebView:', isInWebView, 'isAutoplay:', isAutoplay);

        if (isInWebView && !isAutoplay) {
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

                    // Re-render waypoint markers if waypoints exist
                    if (toLocation.waypoints && toLocation.waypoints.length > 0) {
                      this.deps.waypointController.renderWaypointMarkers(
                        this.fullscreenMap,
                        toLocation.geoId!,
                        toLocation.waypoints,
                        toLocation.color || '#3B82F6'
                      );
                    } else {
                      // Clear waypoint markers if no waypoints
                      this.deps.waypointController.clearMarkersForDestination(toLocation.geoId!);
                    }
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

    // Cleanup pointer event listeners and remote finger overlays
    this.cleanupPointerEventListeners();
    this.cleanupRemoteFingerOverlay();

    // Hide video call overlay if visible
    this.hideVideoCallOverlay();

    // Hide video thumbnail if visible
    this.hideVideoThumbnail();

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

    // Restore the light map layer opacity on the block map
    const mapContainers = document.querySelectorAll('.prosemirror-map');
    if (mapContainers.length > 0) {
      const blockMapElement = mapContainers[0] as any;
      const lightMapContainer = blockMapElement._lightMapContainer as HTMLElement | undefined;
      if (lightMapContainer) {
        console.log('[Fullscreen] Restoring light map layer');
        lightMapContainer.style.opacity = '1';
      }
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
   * Add a waypoint at the given coordinates by finding route layers via map style
   * This doesn't require clicking exactly on the route line - it finds route layers
   * from the style and adds a waypoint at the specified coordinates
   * Returns true if a waypoint was successfully added
   */
  addWaypointAtCoords(lat: number, lng: number): boolean {
    if (!this.fullscreenMap) {
      console.warn('[FullscreenMap] Cannot add waypoint - map not available');
      return false;
    }

    // Find route layers via map style (not queryRenderedFeatures which requires pixel-perfect coords)
    const style = this.fullscreenMap.getStyle();
    if (!style || !style.layers) {
      console.warn('[FullscreenMap] No style or layers available');
      return false;
    }

    // Route layers are named like "route-{fromGeoId}-{toGeoId}"
    const routeLayer = style.layers.find(l => l.id.startsWith('route-'));

    if (!routeLayer) {
      console.warn('[FullscreenMap] No route layer found in map style');
      return false;
    }

    console.log('[FullscreenMap] Found route layer via style:', routeLayer.id);

    // Log the route GeoJSON for debugging
    const source = this.fullscreenMap.getSource(routeLayer.id) as mapboxgl.GeoJSONSource;
    if (source && source._data) {
      console.log('[FullscreenMap] Route GeoJSON:', JSON.stringify(source._data, null, 2));
    } else {
      // Try querySourceFeatures instead
      const features = this.fullscreenMap.querySourceFeatures(routeLayer.id);
      console.log('[FullscreenMap] Route features from querySourceFeatures:', JSON.stringify(features, null, 2));
    }
    console.log('[FullscreenMap] Tap coordinates:', { lat, lng });

    return this.addWaypointToRoute(routeLayer.id, lat, lng);
  }

  /**
   * Add a waypoint to a specific route
   */
  private addWaypointToRoute(routeLayerId: string, lat: number, lng: number): boolean {
    // Parse the route layer ID to get the destination geoId
    // Format: "route-{fromGeoId}-{toGeoId}" (no "-to-" separator)
    // Since geoIds contain hyphens, we need to match against known locations
    const currentLocations = this.deps.extractLocationsForFullscreen();

    // Find which location's geoId is the destination (at the end of the route ID)
    let destGeoId: string | null = null;
    for (const loc of currentLocations) {
      if (loc.geoId && routeLayerId.endsWith(loc.geoId)) {
        destGeoId = loc.geoId;
        break;
      }
    }

    if (!destGeoId) {
      console.warn('[FullscreenMap] Could not find destination geoId in route layer ID:', routeLayerId);
      return false;
    }
    console.log('[FullscreenMap] Adding waypoint to route:', routeLayerId, 'destGeoId:', destGeoId, 'at:', lat, lng);

    // Add the waypoint
    const success = this.deps.waypointController.addWaypoint(destGeoId, lat, lng);

    if (success && this.fullscreenMap) {
      // Extract updated location to get the new waypoints array
      const updatedLocations = this.deps.extractLocationsForFullscreen();
      const updatedLocation = updatedLocations.find(loc => loc.geoId === destGeoId);

      if (updatedLocation && updatedLocation.waypoints) {
        this.deps.waypointController.renderWaypointMarkers(
          this.fullscreenMap,
          destGeoId,
          updatedLocation.waypoints,
          updatedLocation.color || '#3B82F6'
        );
      }
      console.log('[FullscreenMap] Waypoint added successfully');
    }

    return success;
  }

  /**
   * Show the video call overlay on the fullscreen map
   */
  showVideoCallOverlay(): void {
    const overlay = document.getElementById('video-call-overlay');
    if (overlay) {
      overlay.classList.add('visible');
      console.log('[Fullscreen] Video call overlay shown');
    }
  }

  /**
   * Hide the video call overlay
   */
  hideVideoCallOverlay(): void {
    const overlay = document.getElementById('video-call-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      console.log('[Fullscreen] Video call overlay hidden');
    }
  }

  /**
   * Check if the video call overlay is visible
   */
  isVideoCallOverlayVisible(): boolean {
    const overlay = document.getElementById('video-call-overlay');
    return overlay?.classList.contains('visible') ?? false;
  }

  /**
   * Show the video thumbnail (small PiP in top-left)
   * @param name - Name of the user to show (e.g., "Bob" or "Alice")
   * @param color - Background color for the avatar (e.g., "#10B981" or "#EC4899")
   */
  showVideoThumbnail(name?: string, color?: string): void {
    const thumbnail = document.getElementById('video-thumbnail');
    if (thumbnail) {
      // Update the avatar and name if provided
      if (name) {
        const avatarEl = thumbnail.querySelector('.thumbnail-avatar');
        const nameEl = thumbnail.querySelector('.thumbnail-name');
        if (avatarEl) {
          avatarEl.textContent = name.charAt(0).toUpperCase();
          if (color) {
            (avatarEl as HTMLElement).style.background = color;
          }
        }
        if (nameEl) {
          nameEl.textContent = name;
        }
      }
      thumbnail.classList.add('visible');
      console.log('[Fullscreen] Video thumbnail shown for', name || 'default');
    }
  }

  /**
   * Hide the video thumbnail
   */
  hideVideoThumbnail(): void {
    const thumbnail = document.getElementById('video-thumbnail');
    if (thumbnail) {
      thumbnail.classList.remove('visible');
      console.log('[Fullscreen] Video thumbnail hidden');
    }
  }

  /**
   * Check if the video thumbnail is visible
   */
  isVideoThumbnailVisible(): boolean {
    const thumbnail = document.getElementById('video-thumbnail');
    return thumbnail?.classList.contains('visible') ?? false;
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

      // Use jumpTo for instant sync (real-time follow mode)
      this.fullscreenMap.jumpTo({
        center: [cameraData.center.lng, cameraData.center.lat],
        zoom: cameraData.zoom,
        pitch: cameraData.pitch ?? 0,
        bearing: cameraData.bearing ?? 0
      });
    } else {
      // Fallback to bounds-based approach (for backwards compatibility)
      console.log('[Fullscreen] Falling back to bounds-based sync');
      const bounds = new (window as any).mapboxgl.LngLatBounds(
        [cameraData.west, cameraData.south],
        [cameraData.east, cameraData.north]
      );

      // Use instant transition for real-time follow mode
      this.fullscreenMap.fitBounds(bounds, {
        padding: 0,
        animate: false,
        duration: 0
      });
    }
  }

  // ==================== Pointer Event Handling for Collaborative Finger Sync ====================

  /**
   * Setup pointer event listeners to broadcast finger position
   */
  private setupPointerEventListeners(): void {
    const mapInteractionService = this.deps.mapInteractionService;
    if (!mapInteractionService || !this.fullscreenMap) {
      return;
    }

    // Set the map instance on the service for coordinate conversion
    mapInteractionService.setMap(this.fullscreenMap);

    const canvas = this.fullscreenMap.getCanvas();

    // Create event handlers
    this.pointerEventHandlers = {
      pointerdown: (e: PointerEvent) => {
        this.isPointerDown = true;

        // Notify that user is interacting (for control takeover in bidirectional following)
        this.deps.onInteraction?.();

        const lngLat = this.fullscreenMap?.unproject([e.clientX, e.clientY]);
        if (lngLat) {
          mapInteractionService.broadcastFingerPosition(
            { lng: lngLat.lng, lat: lngLat.lat },
            'pan'
          );
        }
      },

      pointermove: (e: PointerEvent) => {
        if (!this.isPointerDown) return;
        const lngLat = this.fullscreenMap?.unproject([e.clientX, e.clientY]);
        if (lngLat) {
          mapInteractionService.broadcastFingerPosition(
            { lng: lngLat.lng, lat: lngLat.lat },
            'pan'
          );
        }
      },

      pointerup: (_e: PointerEvent) => {
        if (this.isPointerDown) {
          this.isPointerDown = false;
          mapInteractionService.broadcastGestureEnd();
        }
      },

      pointercancel: (_e: PointerEvent) => {
        if (this.isPointerDown) {
          this.isPointerDown = false;
          mapInteractionService.broadcastGestureEnd();
        }
      },
    };

    // Attach listeners
    canvas.addEventListener('pointerdown', this.pointerEventHandlers.pointerdown);
    canvas.addEventListener('pointermove', this.pointerEventHandlers.pointermove);
    canvas.addEventListener('pointerup', this.pointerEventHandlers.pointerup);
    canvas.addEventListener('pointercancel', this.pointerEventHandlers.pointercancel);
    // Also listen on window for pointerup in case user drags outside canvas
    window.addEventListener('pointerup', this.pointerEventHandlers.pointerup);

    console.log('[Fullscreen] Pointer event listeners attached for finger sync');
  }

  /**
   * Cleanup pointer event listeners
   */
  private cleanupPointerEventListeners(): void {
    if (!this.pointerEventHandlers || !this.fullscreenMap) {
      return;
    }

    const canvas = this.fullscreenMap.getCanvas();
    canvas.removeEventListener('pointerdown', this.pointerEventHandlers.pointerdown);
    canvas.removeEventListener('pointermove', this.pointerEventHandlers.pointermove);
    canvas.removeEventListener('pointerup', this.pointerEventHandlers.pointerup);
    canvas.removeEventListener('pointercancel', this.pointerEventHandlers.pointercancel);
    window.removeEventListener('pointerup', this.pointerEventHandlers.pointerup);

    this.pointerEventHandlers = null;
    this.isPointerDown = false;

    // Clear any active interaction when closing
    this.deps.mapInteractionService?.broadcastGestureEnd();

    console.log('[Fullscreen] Pointer event listeners removed');
  }

  /**
   * Setup remote finger overlay rendering
   */
  private setupRemoteFingerOverlay(): void {
    const mapInteractionService = this.deps.mapInteractionService;
    if (!mapInteractionService) {
      return;
    }

    // Create callback for remote interactions
    this.remoteInteractionCallback = (
      clientId: number,
      userName: string,
      userColor: string,
      state: MapInteractionState | null
    ) => {
      this.updateRemoteFingerOverlay(clientId, userName, userColor, state);
    };

    mapInteractionService.onRemoteInteraction(this.remoteInteractionCallback);
    console.log('[Fullscreen] Remote finger overlay listener attached');
  }

  /**
   * Cleanup remote finger overlay
   */
  private cleanupRemoteFingerOverlay(): void {
    // Remove callback from service
    if (this.remoteInteractionCallback && this.deps.mapInteractionService) {
      this.deps.mapInteractionService.offRemoteInteraction(this.remoteInteractionCallback);
      this.remoteInteractionCallback = null;
    }

    // Remove all finger elements
    this.remoteFingerElements.forEach((element) => {
      element.remove();
    });
    this.remoteFingerElements.clear();

    console.log('[Fullscreen] Remote finger overlay cleaned up');
  }

  /**
   * Update remote finger overlay for a specific user
   */
  private updateRemoteFingerOverlay(
    clientId: number,
    userName: string,
    userColor: string,
    state: MapInteractionState | null
  ): void {
    if (!state || !state.fingerPosition || state.gestureType === 'idle') {
      // Remove finger element and line if interaction ended
      const existingElement = this.remoteFingerElements.get(clientId);
      if (existingElement) {
        existingElement.remove();
        this.remoteFingerElements.delete(clientId);
      }
      this.removeFingerLine(clientId);
      return;
    }

    // Get or create finger element
    let fingerElement = this.remoteFingerElements.get(clientId);
    if (!fingerElement) {
      fingerElement = this.createRemoteFingerElement(userName, userColor, clientId);
      this.remoteFingerElements.set(clientId, fingerElement);
    }

    // Project geographic coordinates to screen position
    if (!this.fullscreenMap) return;

    const screenPos = this.fullscreenMap.project([
      state.fingerPosition.lng,
      state.fingerPosition.lat
    ]);

    // Update element position (center touch indicator at the position)
    fingerElement.style.transform = `translate(${screenPos.x - 14}px, ${screenPos.y - 14}px)`;
    fingerElement.style.display = 'block';

    // Update the connecting line from avatar to finger
    this.updateFingerLine(clientId, screenPos.x - 14, screenPos.y - 14);
  }

  /**
   * Create DOM element for remote finger overlay with clean touch indicator
   */
  private createRemoteFingerElement(userName: string, userColor: string, clientId: number): HTMLElement {
    const container = document.createElement('div');
    container.className = 'remote-finger';
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 10005;
      transition: transform 50ms ease-out;
      display: none;
    `;

    // Clean circular touch indicator (replaces emoji)
    const touchIndicator = document.createElement('div');
    touchIndicator.className = 'remote-touch-indicator';
    touchIndicator.style.cssText = `
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: ${userColor}40;
      border: 2px solid ${userColor};
      position: relative;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      animation: pulse-ring 1.5s ease-out infinite;
    `;

    // Inner dot
    const innerDot = document.createElement('div');
    innerDot.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${userColor};
    `;
    touchIndicator.appendChild(innerDot);

    // Name label (positioned to the right of touch indicator)
    const label = document.createElement('div');
    label.className = 'remote-finger-label';
    label.style.cssText = `
      position: absolute;
      top: 50%;
      left: 36px;
      transform: translateY(-50%);
      background: ${userColor};
      color: white;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    `;
    label.textContent = userName;

    container.appendChild(touchIndicator);
    container.appendChild(label);

    // Create SVG line connecting avatar badge to finger
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'remote-finger-line');
    svg.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10004;
    `;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', userColor);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '6,4');
    line.setAttribute('stroke-opacity', '0.6');
    line.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line);

    // Add to fullscreen overlay
    const overlay = document.getElementById('fullscreen-overlay');
    if (overlay) {
      overlay.appendChild(svg);
      overlay.appendChild(container);
    }

    // Store SVG reference for later updates
    this.remoteFingerLines.set(clientId, svg);

    return container;
  }

  /**
   * Update the SVG line connecting avatar badge to finger position
   */
  private updateFingerLine(clientId: number, fingerX: number, fingerY: number): void {
    const svg = this.remoteFingerLines.get(clientId);
    if (!svg) return;

    const line = svg.querySelector('line');
    if (!line) return;

    // Find the avatar badge (video thumbnail) position
    const thumbnail = document.getElementById('video-thumbnail');
    if (!thumbnail) {
      // Hide line if avatar badge not found
      svg.style.display = 'none';
      return;
    }

    const thumbRect = thumbnail.getBoundingClientRect();
    const thumbCenterX = thumbRect.left + thumbRect.width / 2;
    const thumbCenterY = thumbRect.top + thumbRect.height / 2;

    // Update line coordinates (from avatar center to finger position + offset for indicator center)
    line.setAttribute('x1', String(thumbCenterX));
    line.setAttribute('y1', String(thumbCenterY));
    line.setAttribute('x2', String(fingerX + 14)); // Center of 28px touch indicator
    line.setAttribute('y2', String(fingerY + 14));

    svg.style.display = 'block';
  }

  /**
   * Remove SVG line for a client
   */
  private removeFingerLine(clientId: number): void {
    const svg = this.remoteFingerLines.get(clientId);
    if (svg) {
      svg.remove();
      this.remoteFingerLines.delete(clientId);
    }
  }

  /**
   * Get a point on the route at a given fraction (0-1) along the line
   * fraction=0 is the start, fraction=1 is the end, fraction=0.5 is the midpoint
   */
  getPointOnRoute(fraction: number = 0.5): { lat: number; lng: number } | null {
    if (!this.fullscreenMap) {
      console.warn('[FullscreenMap] Cannot get point on route - map not available');
      return null;
    }

    // Find route layer via map style
    const style = this.fullscreenMap.getStyle();
    if (!style || !style.layers) {
      console.warn('[FullscreenMap] No style or layers available');
      return null;
    }

    // Route layers are named like "route-{fromGeoId}-{toGeoId}"
    const routeLayer = style.layers.find(l => l.id.startsWith('route-'));

    if (!routeLayer) {
      console.warn('[FullscreenMap] No route layer found in map style');
      return null;
    }

    // Get the route GeoJSON source
    const source = this.fullscreenMap.getSource(routeLayer.id) as mapboxgl.GeoJSONSource;
    if (!source) {
      console.warn('[FullscreenMap] Route source not found:', routeLayer.id);
      return null;
    }

    // Access the internal _data property (GeoJSON)
    const data = (source as any)._data as GeoJSON.Feature | GeoJSON.FeatureCollection | null;
    if (!data) {
      console.warn('[FullscreenMap] Route source has no data');
      return null;
    }

    // Handle both Feature and FeatureCollection
    let geometry: GeoJSON.Geometry | null = null;
    if (data.type === 'Feature') {
      geometry = data.geometry;
    } else if (data.type === 'FeatureCollection' && data.features.length > 0) {
      geometry = data.features[0].geometry;
    }

    if (!geometry || geometry.type !== 'LineString') {
      console.warn('[FullscreenMap] Route geometry is not a LineString');
      return null;
    }

    const coords = geometry.coordinates as [number, number][];
    if (coords.length < 2) {
      console.warn('[FullscreenMap] Route has less than 2 coordinates');
      return null;
    }

    // Calculate total line length and find point at fraction
    const targetDistance = this.calculateLineLength(coords) * Math.max(0, Math.min(1, fraction));
    let accumulatedDistance = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const segmentLength = this.distanceBetween(coords[i], coords[i + 1]);

      if (accumulatedDistance + segmentLength >= targetDistance) {
        // Found the segment - interpolate within it
        const remainingDistance = targetDistance - accumulatedDistance;
        const t = segmentLength > 0 ? remainingDistance / segmentLength : 0;

        const lng = coords[i][0] + t * (coords[i + 1][0] - coords[i][0]);
        const lat = coords[i][1] + t * (coords[i + 1][1] - coords[i][1]);

        console.log(`[FullscreenMap] Point on route at fraction ${fraction}: lat=${lat}, lng=${lng}`);
        return { lat, lng };
      }

      accumulatedDistance += segmentLength;
    }

    // If we get here, return the last point
    const lastCoord = coords[coords.length - 1];
    return { lat: lastCoord[1], lng: lastCoord[0] };
  }

  /**
   * Calculate total length of a line (in coordinate units, not meters)
   */
  private calculateLineLength(coords: [number, number][]): number {
    let length = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      length += this.distanceBetween(coords[i], coords[i + 1]);
    }
    return length;
  }

  /**
   * Calculate distance between two points (Euclidean in coordinate space)
   */
  private distanceBetween(a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Add a waypoint at a specific fraction along the route
   * Returns the coordinates used and whether the waypoint was successfully added
   */
  addWaypointOnRoute(fraction: number = 0.5): { lat: number; lng: number; success: boolean } | null {
    const point = this.getPointOnRoute(fraction);
    if (!point) {
      return null;
    }

    const success = this.addWaypointAtCoords(point.lat, point.lng);
    return { ...point, success };
  }

  /**
   * Get the geographic coordinates of a waypoint by index
   * Returns null if waypoint not found
   */
  getWaypointCoords(waypointIndex: number): { lat: number; lng: number; destGeoId: string } | null {
    if (!this.fullscreenMap) {
      console.warn('[FullscreenMap] Cannot get waypoint coords - map not available');
      return null;
    }

    // Find route layer via map style
    const style = this.fullscreenMap.getStyle();
    if (!style || !style.layers) {
      console.warn('[FullscreenMap] No style or layers available');
      return null;
    }

    // Route layers are named like "route-{fromGeoId}-{toGeoId}"
    const routeLayer = style.layers.find(l => l.id.startsWith('route-'));
    if (!routeLayer) {
      console.warn('[FullscreenMap] No route layer found in map style');
      return null;
    }

    // Get current locations first to match destGeoId from route layer ID
    const currentLocations = this.deps.extractLocationsForFullscreen();

    // Extract destGeoId from route layer ID using endsWith() to handle hyphens in geoIds
    // (geoIds like "geo-setup-tivoli" contain hyphens, so we can't just split by '-')
    let destGeoId: string | null = null;
    for (const loc of currentLocations) {
      if (loc.geoId && routeLayer.id.endsWith(loc.geoId)) {
        destGeoId = loc.geoId;
        break;
      }
    }

    if (!destGeoId) {
      console.warn('[FullscreenMap] Could not find destination geoId in route layer ID:', routeLayer.id);
      return null;
    }
    console.log('[FullscreenMap] Extracted locations:', currentLocations.map(loc => ({
      geoId: loc.geoId,
      placeName: loc.placeName,
      waypointsCount: loc.waypoints?.length || 0,
      waypoints: loc.waypoints
    })));
    console.log('[FullscreenMap] Looking for destGeoId:', destGeoId);
    const destLocation = currentLocations.find(loc => loc.geoId === destGeoId);
    console.log('[FullscreenMap] Found destLocation:', destLocation ? {
      geoId: destLocation.geoId,
      placeName: destLocation.placeName,
      waypointsCount: destLocation.waypoints?.length || 0,
      waypoints: destLocation.waypoints
    } : 'NOT FOUND');

    if (!destLocation || !destLocation.waypoints || waypointIndex >= destLocation.waypoints.length) {
      console.warn('[FullscreenMap] Waypoint not found:', waypointIndex, {
        destLocation: !!destLocation,
        hasWaypoints: !!destLocation?.waypoints,
        waypointsLength: destLocation?.waypoints?.length || 0,
        requestedIndex: waypointIndex
      });
      return null;
    }

    const waypoint = destLocation.waypoints[waypointIndex];
    return { lat: waypoint.lat, lng: waypoint.lng, destGeoId };
  }

  /**
   * Update a waypoint's position to a new fraction along the route
   * Returns the new coordinates if successful
   */
  updateWaypointPosition(waypointIndex: number, newFraction: number): { lat: number; lng: number; success: boolean } | null {
    // Get the new position on the route
    const newPoint = this.getPointOnRoute(newFraction);
    if (!newPoint) {
      console.warn('[FullscreenMap] Could not get point on route at fraction', newFraction);
      return null;
    }

    // Find the destination geoId
    if (!this.fullscreenMap) {
      console.warn('[FullscreenMap] Cannot update waypoint - map not available');
      return null;
    }

    const style = this.fullscreenMap.getStyle();
    if (!style || !style.layers) {
      console.warn('[FullscreenMap] No style or layers available');
      return null;
    }

    const routeLayer = style.layers.find(l => l.id.startsWith('route-'));
    if (!routeLayer) {
      console.warn('[FullscreenMap] No route layer found');
      return null;
    }

    // Get current locations first to match destGeoId from route layer ID
    const currentLocations = this.deps.extractLocationsForFullscreen();

    // Extract destGeoId from route layer ID using endsWith() to handle hyphens in geoIds
    // (geoIds like "geo-setup-tivoli" contain hyphens, so we can't just split by '-')
    let destGeoId: string | null = null;
    for (const loc of currentLocations) {
      if (loc.geoId && routeLayer.id.endsWith(loc.geoId)) {
        destGeoId = loc.geoId;
        break;
      }
    }

    if (!destGeoId) {
      console.warn('[FullscreenMap] Could not find destination geoId in route layer ID:', routeLayer.id);
      return null;
    }

    console.log('[FullscreenMap] Updating waypoint', waypointIndex, 'for destination:', destGeoId);

    // Update waypoint position via WaypointController
    const success = this.deps.waypointController.updateWaypoint(destGeoId, waypointIndex, newPoint.lat, newPoint.lng);

    return { ...newPoint, success };
  }

  /**
   * Refresh the map to show updated routes and waypoints
   * Called when waypoints are added via Y.js sync
   */
  refresh(): void {
    if (!this.fullscreenMap) {
      return;
    }

    console.log('[FullscreenMap] Refreshing routes and waypoints');

    // Re-extract locations from document using provided callback
    const currentLocations = this.deps.extractLocationsForFullscreen();

    // Re-render all routes and markers with updated waypoints
    this.renderMarkersAndRoutes(currentLocations);
  }
}
