// Cache for geocoding results
const geocodeCache = new Map<string, { lat: number; lng: number; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface GeocodingResult {
  lat: number;
  lng: number;
  source: 'google' | 'cache';
}

/**
 * Get coordinates for a location name
 */
export async function geocodeLocation(
  placeName: string,
  googleApiKey?: string
): Promise<GeocodingResult | null> {
  console.log('[Geocoding] geocodeLocation called with:', placeName, 'API key:', googleApiKey ? 'present' : 'missing');
  if (!placeName) {
    console.log('[Geocoding] No place name provided');
    return null;
  }

  // Normalize the place name for better matching
  const normalizedName = placeName.toLowerCase().trim();

  // Check cache first
  const cached = geocodeCache.get(normalizedName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Geocoding] Cache hit for: ${placeName}`);
    return { lat: cached.lat, lng: cached.lng, source: 'cache' };
  }

  // Try Google Places API
  if (!googleApiKey || googleApiKey === 'your_google_maps_api_key_here') {
    console.warn(`[Geocoding] No valid Google API key configured. Key value:`, googleApiKey);
    return null;
  }

  try {
    console.log(`[Geocoding] Calling Google Places API for: ${placeName}`);

    // Use Place Search API for better results
    const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?` +
      `input=${encodeURIComponent(placeName)}` +
      `&inputtype=textquery` +
      `&fields=geometry,name,formatted_address` +
      `&key=${googleApiKey}`;

    console.log('[Geocoding] Making request to Google Places API');
    const response = await fetch(url);
    const data = await response.json();
    console.log('[Geocoding] Google API response status:', data.status);

    if (data.status === 'OK' && data.candidates?.[0]) {
      const location = data.candidates[0].geometry.location;
      const result = { lat: location.lat, lng: location.lng };

      console.log(`[Geocoding] Google API found: ${placeName} -> ${result.lat}, ${result.lng}`);

      // Cache the result
      geocodeCache.set(normalizedName, { ...result, timestamp: Date.now() });

      return { ...result, source: 'google' as const };
    } else if (data.status === 'REQUEST_DENIED') {
      console.error(`[Geocoding] Google API request denied. Check API key configuration.`);
    } else if (data.status === 'ZERO_RESULTS') {
      console.warn(`[Geocoding] Google API found no results for: ${placeName}`);
    } else {
      console.warn(`[Geocoding] Google API status: ${data.status} for ${placeName}`);
    }
  } catch (error) {
    console.error(`[Geocoding] Google API error for ${placeName}:`, error);
  }

  return null;
}

/**
 * Clear the geocoding cache
 */
export function clearGeocodeCache() {
  geocodeCache.clear();
}