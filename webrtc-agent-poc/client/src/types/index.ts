/**
 * Shared TypeScript interfaces for the WebRTC Agent POC
 */

import type { EditorView } from 'prosemirror-view';
import type mapboxgl from 'mapbox-gl';

/**
 * Transport mode for route calculation
 */
export type TransportMode = 'walking' | 'cycling' | 'driving';

/**
 * Geographic location with metadata
 */
export interface Location {
  geoId: string;
  displayText: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex: number;
  color: string;
  transportFrom?: string;
  transportProfile?: TransportMode;
  waypoints?: Waypoint[];
}

/**
 * Waypoint on a route
 */
export interface Waypoint {
  lat: number;
  lng: number;
}

/**
 * Geocoding result from Nominatim API
 */
export interface GeocodingResult {
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Route geometry from Mapbox Directions API
 */
export interface Route {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  distance: number; // meters
  duration: number; // seconds
}

/**
 * Mapbox Directions API response
 */
export interface DirectionsResponse {
  routes: Route[];
  code: string;
}

/**
 * Route rendering configuration
 */
export interface RouteConfig {
  fromLocation: Location;
  toLocation: Location;
  profile: TransportMode;
  color: string;
}

/**
 * Geographic bounds (LngLatBounds)
 */
export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Awareness state for collaborative features
 */
export interface AwarenessState {
  user: {
    name: string;
    color: string;
    colorIndex: number;
  };
  mapBounds?: Bounds | null;
}

/**
 * Map interaction state for collaborative finger/gesture tracking
 * Uses geographic coordinates so position is correct regardless of viewport size/zoom
 */
export interface MapInteractionState {
  fingerPosition?: {
    lat: number;
    lng: number;
  };
  gestureType: 'idle' | 'pan' | 'pinch' | 'tap' | null;
  timestamp: number;  // For ordering/staleness detection
}

/**
 * Editor controller interface (for dependency injection)
 */
export interface IEditorController {
  getView(): EditorView | null;
  updateGeoMark(geoId: string, updatedAttrs: Partial<Location>): void;
}

/**
 * Marker click handler callback
 */
export type MarkerClickHandler = (location: Location) => void;

/**
 * Route click handler callback
 */
export type RouteClickHandler = (destGeoId: string, coordinates: [number, number]) => void;

/**
 * Waypoint drag handler callback
 */
export type WaypointDragHandler = (destGeoId: string, waypointIndex: number, lngLat: mapboxgl.LngLat) => void;

// Voice input types
export * from './voice';
