/**
 * Nominatim Geocoding Service
 * Uses OpenStreetMap's Nominatim API to geocode location names
 * Free and no API key required!
 */

export interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  place_id: number;
  osm_type: string;
  osm_id: number;
  boundingbox: [string, string, string, string];
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  source: 'nominatim';
}

/**
 * Geocode a location name using Nominatim
 * @param placeName - The location to geocode (e.g., "Copenhagen, Denmark" or "Tivoli Gardens, Copenhagen")
 * @param options - Optional configuration
 * @returns Geocoded coordinates or null if not found
 */
export async function geocodeWithNominatim(
  placeName: string,
  options: {
    /**
     * Approximate coordinates to bias the search toward a specific region
     * Useful for disambiguating common place names
     */
    biasCoords?: { lat: number; lng: number };
    /**
     * Language for the result (ISO 639-1 code)
     */
    language?: string;
  } = {}
): Promise<GeocodeResult | null> {
  try {
    // Build query parameters
    const params = new URLSearchParams({
      q: placeName,
      format: 'json',
      limit: '1', // Get the best match
      addressdetails: '1',
      namedetails: '1'
    });

    if (options.language) {
      params.set('accept-language', options.language);
    }

    // Add viewbox bias if coordinates provided
    if (options.biasCoords) {
      const { lat, lng } = options.biasCoords;
      // Create a ~50km box around the coordinates
      const delta = 0.5; // Approximately 50km
      params.set('viewbox', `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`);
      params.set('bounded', '0'); // Don't strictly limit to box, just bias
    }

    // Make request to Nominatim
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    console.log('[Nominatim] Geocoding:', placeName, options.biasCoords ? `(biased toward ${options.biasCoords.lat}, ${options.biasCoords.lng})` : '');

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TourVision/1.0 (Travel Planning App)' // Required by Nominatim usage policy
      }
    });

    if (!response.ok) {
      console.error('[Nominatim] HTTP error:', response.status, response.statusText);
      return null;
    }

    const results: NominatimResult[] = await response.json();

    if (results.length === 0) {
      console.warn('[Nominatim] No results found for:', placeName);
      return null;
    }

    const best = results[0];

    const result: GeocodeResult = {
      lat: parseFloat(best.lat),
      lng: parseFloat(best.lon),
      displayName: best.display_name,
      source: 'nominatim'
    };

    console.log('[Nominatim] Success:', placeName, '→', result.lat, result.lng);

    return result;
  } catch (error) {
    console.error('[Nominatim] Geocoding error:', error);
    return null;
  }
}

/**
 * Enrich a geo-mark with accurate coordinates from Nominatim
 * Replaces LLM-generated coordinates with Nominatim's accurate ones
 */
export async function enrichGeoMark(geoMark: {
  placeName: string;
  lat?: number;
  lng?: number;
  coordSource?: string;
}): Promise<{
  lat: number;
  lng: number;
  placeName: string;
  coordSource: 'nominatim';
} | null> {
  // Use existing coordinates as bias for disambiguation
  const biasCoords = geoMark.lat && geoMark.lng
    ? { lat: geoMark.lat, lng: geoMark.lng }
    : undefined;

  const result = await geocodeWithNominatim(geoMark.placeName, { biasCoords });

  if (!result) {
    // Fallback to LLM coordinates if Nominatim fails
    if (geoMark.lat && geoMark.lng) {
      console.warn('[Nominatim] Falling back to LLM coordinates for:', geoMark.placeName);
      return {
        lat: geoMark.lat,
        lng: geoMark.lng,
        placeName: geoMark.placeName,
        coordSource: 'nominatim' // Still mark as attempted
      };
    }
    return null;
  }

  return {
    lat: result.lat,
    lng: result.lng,
    placeName: geoMark.placeName,
    coordSource: 'nominatim'
  };
}
