// Cache for geocoding results
const geocodeCache = new Map<string, { lat: number; lng: number; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Mock coordinates for common locations (fallback when no API key)
const MOCK_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'paris': { lat: 48.8566, lng: 2.3522 },
  'eiffel tower': { lat: 48.8584, lng: 2.2945 },
  'louvre museum': { lat: 48.8606, lng: 2.3376 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'sagrada familia': { lat: 41.4036, lng: 2.1744 },
  'park güell': { lat: 41.4145, lng: 2.1527 },
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'shibuya crossing': { lat: 35.6595, lng: 139.7006 },
  'senso-ji temple': { lat: 35.7148, lng: 139.7967 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'times square': { lat: 40.7580, lng: -73.9855 },
  'central park': { lat: 40.7829, lng: -73.9654 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'big ben': { lat: 51.5007, lng: -0.1246 },
  'london eye': { lat: 51.5033, lng: -0.1196 },
};

export interface GeocodingResult {
  lat: number;
  lng: number;
  source: 'google' | 'cache' | 'mock';
}

/**
 * Get coordinates for a location name
 */
export async function geocodeLocation(
  placeName: string,
  googleApiKey?: string
): Promise<GeocodingResult | null> {
  if (!placeName) return null;

  // Check cache first
  const cached = geocodeCache.get(placeName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { lat: cached.lat, lng: cached.lng, source: 'cache' };
  }

  // Try Google Places API if key is available
  if (googleApiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(placeName)}&key=${googleApiKey}`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.results?.[0]) {
          const location = data.results[0].geometry.location;
          const result = { lat: location.lat, lng: location.lng };

          // Cache the result
          geocodeCache.set(placeName, { ...result, timestamp: Date.now() });

          return { ...result, source: 'google' as const };
        }
      }
    } catch (error) {
      console.error(`Geocoding error for ${placeName}:`, error);
    }
  }

  // Fallback to mock coordinates
  const normalizedName = placeName.toLowerCase().trim();
  for (const [key, coords] of Object.entries(MOCK_COORDINATES)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      // Cache the mock result
      geocodeCache.set(placeName, { ...coords, timestamp: Date.now() });
      return { ...coords, source: 'mock' as const };
    }
  }

  return null;
}

/**
 * Clear the geocoding cache
 */
export function clearGeocodeCache() {
  geocodeCache.clear();
}