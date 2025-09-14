export interface TransportationOption {
  mode: 'walking' | 'metro' | 'bus' | 'taxi' | 'uber' | 'bike' | 'car' | 'train';
  duration: number; // seconds
  distance: number; // meters
  formattedDuration: string;
  formattedDistance: string;
  estimatedCost?: number;
  routeUrl: string;
  recommended?: boolean;
}

export interface RouteDetails {
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  distance: number;
  duration: number;
  legs?: any[];
}

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Fetch transportation options between two locations
 */
export async function fetchTransportationOptions(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<TransportationOption[]> {
  try {
    const params = new URLSearchParams({
      fromLat: fromLat.toString(),
      fromLng: fromLng.toString(),
      toLat: toLat.toString(),
      toLng: toLng.toString(),
    });

    const response = await fetch(
      `${API_BASE_URL}/api/transportation/options?${params}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch transportation options: ${response.statusText}`);
    }

    const options = await response.json();
    return options;
  } catch (error) {
    console.error('Error fetching transportation options:', error);
    throw error;
  }
}

/**
 * Fetch detailed route information
 */
export async function fetchRouteDetails(routeUrl: string): Promise<RouteDetails> {
  try {
    // Ensure the URL is absolute
    const fullUrl = routeUrl.startsWith('http') 
      ? routeUrl 
      : `${API_BASE_URL}${routeUrl}`;

    const response = await fetch(fullUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch route details: ${response.statusText}`);
    }

    const details = await response.json();
    return details;
  } catch (error) {
    console.error('Error fetching route details:', error);
    throw error;
  }
}

/**
 * Cache for route details to avoid redundant fetches
 */
const routeCache = new Map<string, RouteDetails>();

/**
 * Fetch route details with caching
 */
export async function fetchRouteDetailsWithCache(routeUrl: string): Promise<RouteDetails> {
  // Check cache first
  if (routeCache.has(routeUrl)) {
    return routeCache.get(routeUrl)!;
  }

  // Fetch and cache
  const details = await fetchRouteDetails(routeUrl);
  routeCache.set(routeUrl, details);
  
  // Clear cache after 1 hour
  setTimeout(() => {
    routeCache.delete(routeUrl);
  }, 60 * 60 * 1000);

  return details;
}

/**
 * Clear the route cache
 */
export function clearRouteCache() {
  routeCache.clear();
}