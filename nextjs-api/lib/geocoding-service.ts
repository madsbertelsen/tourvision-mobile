// Cache for geocoding results
const geocodeCache = new Map<string, { lat: number; lng: number; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export interface GeocodingResult {
  lat: number;
  lng: number;
  source: 'google' | 'cache' | 'llm-fallback';
}

export interface ProximityCoords {
  lat: number;
  lng: number;
}

/**
 * Get coordinates for a location name
 * @param placeName - Name of the place to geocode
 * @param googleApiKey - Google Maps API key
 * @param proximityCoords - Optional approximate coordinates to bias the search
 */
export async function geocodeLocation(
  placeName: string,
  googleApiKey?: string,
  proximityCoords?: ProximityCoords
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
    console.log(`[Geocoding] Calling Google Places API (Text Search) for: ${placeName}`);
    if (proximityCoords) {
      console.log(`[Geocoding] Using proximity bias: ${proximityCoords.lat}, ${proximityCoords.lng}`);
    }

    // Build request body for new Text Search API
    const requestBody: any = {
      textQuery: placeName,
    };

    // Add location bias if proximity coords provided
    if (proximityCoords) {
      requestBody.locationBias = {
        circle: {
          center: {
            latitude: proximityCoords.lat,
            longitude: proximityCoords.lng,
          },
          radius: 50000.0, // 50km radius
        },
      };
    }

    // Use new Text Search API
    const url = 'https://places.googleapis.com/v1/places:searchText';

    console.log('[Geocoding] Making POST request to Google Places API (Text Search)');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('[Geocoding] Google API response:', data);

    if (data.places && data.places.length > 0) {
      const place = data.places[0];
      const location = place.location;
      const result = { lat: location.latitude, lng: location.longitude };

      console.log(`[Geocoding] Google API found: ${placeName} -> ${result.lat}, ${result.lng}`);

      // Cache the result
      geocodeCache.set(normalizedName, { ...result, timestamp: Date.now() });

      return { ...result, source: 'google' as const };
    } else if (data.error) {
      console.error(`[Geocoding] Google API error:`, data.error);
    } else {
      console.warn(`[Geocoding] Google API found no results for: ${placeName}`);
    }
  } catch (error) {
    console.error(`[Geocoding] Google API error for ${placeName}:`, error);
  }

  // Fallback to LLM-provided coordinates if Google API failed
  if (proximityCoords) {
    console.log(`[Geocoding] Falling back to LLM-provided coordinates for: ${placeName}`);
    return {
      lat: proximityCoords.lat,
      lng: proximityCoords.lng,
      source: 'llm-fallback'
    };
  }

  return null;
}

/**
 * Clear the geocoding cache
 */
export function clearGeocodeCache() {
  geocodeCache.clear();
}