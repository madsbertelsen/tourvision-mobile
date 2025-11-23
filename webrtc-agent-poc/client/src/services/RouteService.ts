/**
 * RouteService - Handles route fetching and rendering
 *
 * Consolidates duplicate route rendering logic from main.ts:
 * - Lines 604-737 (fullscreen map initial)
 * - Lines 780-899 (fullscreen map update)
 * - Lines 1314-1383 (block map initial)
 * - Lines 1460-1527 (block map update)
 *
 * This eliminates ~600 lines of duplicate code!
 */

import type mapboxgl from 'mapbox-gl';
import type { Location, Waypoint, DirectionsResponse, RouteClickHandler } from '../types';

export interface RouteRenderOptions {
  /** Mapbox access token */
  mapboxToken: string;
  /** Callback when route is clicked (for adding waypoints) */
  onRouteClick?: RouteClickHandler;
  /** Callback to render waypoint markers */
  renderWaypoints?: (map: mapboxgl.Map, destGeoId: string, waypoints: Waypoint[], color: string) => void;
}

export class RouteService {
  private mapboxToken: string;

  constructor(mapboxToken: string) {
    this.mapboxToken = mapboxToken;
  }

  /**
   * Build waypoints string for Mapbox Directions API
   * Extracted from main.ts:267-270
   */
  private buildWaypointsString(waypoints: Waypoint[] = []): string {
    if (!waypoints || waypoints.length === 0) return '';
    return ';' + waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
  }

  /**
   * Get Mapbox profile from transport mode
   */
  private getMapboxProfile(mode: 'walking' | 'cycling' | 'driving'): string {
    switch (mode) {
      case 'walking':
        return 'walking';
      case 'cycling':
        return 'cycling';
      default:
        return 'driving-traffic';
    }
  }

  /**
   * Fetch route from Mapbox Directions API
   *
   * @param fromLocation - Starting location
   * @param toLocation - Destination location
   * @param waypoints - Optional waypoints along the route
   * @returns Route data or null if fetch fails
   */
  async fetchRoute(
    fromLocation: Location,
    toLocation: Location,
    waypoints: Waypoint[] = []
  ): Promise<DirectionsResponse['routes'][0] | null> {
    if (!toLocation.transportProfile) {
      console.warn('[RouteService] No transport profile specified');
      return null;
    }

    try {
      const profile = this.getMapboxProfile(toLocation.transportProfile);
      const waypointsStr = this.buildWaypointsString(waypoints);

      const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
        `${fromLocation.lng},${fromLocation.lat}${waypointsStr};${toLocation.lng},${toLocation.lat}` +
        `?geometries=geojson&overview=full&access_token=${this.mapboxToken}`;

      console.log(`[RouteService] Fetching route: ${fromLocation.placeName} → ${toLocation.placeName} (${toLocation.transportProfile})`);

      const response = await fetch(url);
      const data: DirectionsResponse = await response.json();

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        console.log(`[RouteService] Route fetched: ${(route.distance / 1000).toFixed(1)}km, ${Math.round(route.duration / 60)}min`);
        return route;
      } else {
        console.warn('[RouteService] No route found in Mapbox response');
        return null;
      }
    } catch (error) {
      console.error('[RouteService] Error fetching route:', error);
      return null;
    }
  }

  /**
   * Render route on map
   *
   * @param map - Mapbox map instance
   * @param fromLocation - Starting location
   * @param toLocation - Destination location
   * @param options - Rendering options
   */
  async renderRoute(
    map: mapboxgl.Map,
    fromLocation: Location,
    toLocation: Location,
    options: RouteRenderOptions
  ): Promise<void> {
    const route = await this.fetchRoute(fromLocation, toLocation, toLocation.waypoints);
    if (!route) return;

    const routeId = `route-${fromLocation.geoId}-${toLocation.geoId}`;

    // Remove existing route if present
    if (map.getLayer(routeId)) {
      map.removeLayer(routeId);
    }
    if (map.getSource(routeId)) {
      map.removeSource(routeId);
    }

    // Add route as GeoJSON source
    map.addSource(routeId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: route.geometry
      }
    });

    // Add route line layer
    map.addLayer({
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
        'line-opacity': 0.7
      }
    });

    // Add click handler to route for adding waypoints
    if (options.onRouteClick) {
      map.on('click', routeId, (e) => {
        console.log('[RouteService] Route clicked:', routeId, e.lngLat);
        const { lng, lat } = e.lngLat;
        options.onRouteClick!(toLocation.geoId, [lng, lat]);
      });

      // Change cursor on hover
      map.on('mouseenter', routeId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', routeId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // Render waypoint markers if waypoints exist
    if (toLocation.waypoints && toLocation.waypoints.length > 0 && options.renderWaypoints) {
      options.renderWaypoints(map, toLocation.geoId, toLocation.waypoints, toLocation.color || '#3B82F6');
    }

    console.log('[RouteService] Route rendered on map:', routeId);
  }

  /**
   * Render all routes for a set of locations
   *
   * @param map - Mapbox map instance
   * @param locations - Array of locations (some may have transport config)
   * @param options - Rendering options
   */
  async renderAllRoutes(
    map: mapboxgl.Map,
    locations: Location[],
    options: RouteRenderOptions
  ): Promise<void> {
    for (const toLocation of locations) {
      if (toLocation.transportFrom && toLocation.transportProfile) {
        const fromLocation = locations.find(loc => loc.geoId === toLocation.transportFrom);
        if (!fromLocation) {
          console.warn('[RouteService] Source location not found:', toLocation.transportFrom);
          continue;
        }

        await this.renderRoute(map, fromLocation, toLocation, options);
      }
    }
  }

  /**
   * Remove route from map
   *
   * @param map - Mapbox map instance
   * @param fromGeoId - Source location ID
   * @param toGeoId - Destination location ID
   */
  removeRoute(map: mapboxgl.Map, fromGeoId: string, toGeoId: string): void {
    const routeId = `route-${fromGeoId}-${toGeoId}`;

    if (map.getLayer(routeId)) {
      map.removeLayer(routeId);
    }
    if (map.getSource(routeId)) {
      map.removeSource(routeId);
    }

    console.log('[RouteService] Route removed from map:', routeId);
  }

  /**
   * Remove all routes from map
   *
   * @param map - Mapbox map instance
   */
  removeAllRoutes(map: mapboxgl.Map): void {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    // Find all route layers
    const routeLayers = style.layers.filter(layer => layer.id.startsWith('route-'));

    // Remove each route layer and source
    routeLayers.forEach(layer => {
      if (map.getLayer(layer.id)) {
        map.removeLayer(layer.id);
      }
      if (map.getSource(layer.id)) {
        map.removeSource(layer.id);
      }
    });

    console.log('[RouteService] All routes removed from map');
  }
}
