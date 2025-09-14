import type { Location } from './location-parser';

export type TravelMode = 'walking' | 'driving' | 'cycling';

export interface Waypoint {
  coordinates: [number, number];
  isDragging?: boolean;
  id?: string; // Unique identifier for tracking
}

export interface RouteSegment {
  from: Location;
  to: Location;
  mode: TravelMode;
  waypoints?: Waypoint[]; // Optional intermediate waypoints
  geometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  distance?: number; // meters
  duration?: number; // seconds
}

// Cache for route data to avoid repeated API calls
const routeCache = new Map<string, RouteSegment>();

/**
 * Generate a cache key for a route segment
 */
function getCacheKey(from: Location, to: Location, mode: TravelMode, waypoints?: Waypoint[]): string {
  const waypointKey = waypoints?.map(w => w.coordinates.join(',')).join('_') || '';
  return `${from.coordinates?.join(',')}_${to.coordinates?.join(',')}_${mode}_${waypointKey}`;
}

/**
 * Detect travel mode from itinerary text context
 */
export function detectTravelMode(fromLocation: Location, toLocation: Location, text?: string): TravelMode {
  const context = text?.toLowerCase() || '';
  
  // Check for explicit mode mentions
  if (context.includes('walk') || context.includes('stroll') || context.includes('on foot')) {
    return 'walking';
  }
  if (context.includes('drive') || context.includes('car') || context.includes('taxi')) {
    return 'driving';
  }
  if (context.includes('cycle') || context.includes('bike') || context.includes('bicycle')) {
    return 'cycling';
  }
  
  // Default based on distance (rough estimate)
  if (fromLocation.coordinates && toLocation.coordinates) {
    const [lng1, lat1] = fromLocation.coordinates;
    const [lng2, lat2] = toLocation.coordinates;
    const distance = Math.sqrt(Math.pow(lng2 - lng1, 2) + Math.pow(lat2 - lat1, 2));
    
    // If distance is small (roughly < 2km), default to walking
    if (distance < 0.02) { // approximately 2km at mid-latitudes
      return 'walking';
    }
  }
  
  // Default to walking for short distances within city
  return 'walking';
}

/**
 * Group locations into logical route segments
 */
export function groupIntoSegments(locations: Location[]): Array<{ from: Location; to: Location; mode: TravelMode }> {
  const segments: Array<{ from: Location; to: Location; mode: TravelMode }> = [];
  
  for (let i = 0; i < locations.length - 1; i++) {
    const from = locations[i];
    const to = locations[i + 1];
    
    // Skip if either location doesn't have coordinates
    if (!from.coordinates || !to.coordinates) continue;
    
    // Detect travel mode based on location names and context
    const mode = detectTravelMode(from, to, `${from.description} to ${to.description}`);
    
    segments.push({ from, to, mode });
  }
  
  return segments;
}

/**
 * Fetch route geometry from Mapbox API
 */
export async function fetchRouteGeometry(
  from: Location,
  to: Location,
  mode: TravelMode = 'walking',
  waypoints?: Waypoint[]
): Promise<RouteSegment | null> {
  // Check cache first
  const cacheKey = getCacheKey(from, to, mode, waypoints);
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }
  
  if (!from.coordinates || !to.coordinates) {
    return null;
  }
  
  try {
    // Format coordinates for Mapbox API - include waypoints
    let coordinates = `${from.coordinates[0]},${from.coordinates[1]}`;
    
    // Add waypoints if any
    if (waypoints && waypoints.length > 0) {
      for (const waypoint of waypoints) {
        coordinates += `;${waypoint.coordinates[0]},${waypoint.coordinates[1]}`;
      }
    }
    
    coordinates += `;${to.coordinates[0]},${to.coordinates[1]}`;
    
    // Use GET request for caching benefits
    const response = await fetch(`/api/route?coordinates=${encodeURIComponent(coordinates)}&mode=${mode}`);
    
    if (!response.ok) {
      console.error('Failed to fetch route:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    const segment: RouteSegment = {
      from,
      to,
      mode,
      waypoints,
      geometry: data.geometry,
      distance: data.distance,
      duration: data.duration,
    };
    
    // Cache the result
    routeCache.set(cacheKey, segment);
    
    return segment;
  } catch (error) {
    console.error('Error fetching route:', error);
    return null;
  }
}

/**
 * Fetch all routes for a list of locations
 */
export async function fetchAllRoutes(locations: Location[]): Promise<RouteSegment[]> {
  const segments = groupIntoSegments(locations);
  const routes: RouteSegment[] = [];
  
  // Fetch routes in parallel for better performance
  const promises = segments.map(({ from, to, mode }) =>
    fetchRouteGeometry(from, to, mode)
  );
  
  const results = await Promise.all(promises);
  
  for (const result of results) {
    if (result) {
      routes.push(result);
    }
  }
  
  return routes;
}

/**
 * Get color for travel mode
 */
export function getModeColor(mode: TravelMode): string {
  switch (mode) {
    case 'walking':
      return '#10b981'; // green
    case 'driving':
      return '#3b82f6'; // blue
    case 'cycling':
      return '#f59e0b'; // amber
    default:
      return '#6b7280'; // gray
  }
}

/**
 * Get line style for travel mode
 */
export function getModeLineStyle(mode: TravelMode): 'solid' | 'dashed' {
  return mode === 'walking' ? 'dashed' : 'solid';
}

/**
 * Format distance for display
 */
export function formatDistance(meters?: number): string {
  if (!meters) return '';
  
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  
  const minutes = Math.round(seconds / 60);
  
  if (minutes < 60) {
    return `${minutes}min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}min`;
}