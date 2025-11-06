/**
 * Nominatim Geocoding Service
 * Uses OpenStreetMap's Nominatim API to geocode location names
 * Free and no API key required!
 *
 * Includes rate limiting (1 req/sec) and LRU caching to respect Nominatim usage policy
 */

import { RateLimiter, LRUCache } from './rate-limiter';

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

// Global rate limiter and cache (shared across all requests)
const rateLimiter = new RateLimiter<NominatimRequestArgs, GeocodeResult | null>(1000, 50); // 1 req/sec, max 50 queued
const geocodeCache = new LRUCache<string, GeocodeResult>(100, 3600000); // 100 entries, 1 hour TTL

interface NominatimRequestArgs {
  placeName: string;
  biasCoords?: { lat: number; lng: number };
  language?: string;
}

/**
 * Calculate Haversine distance between two coordinates in kilometers
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Internal function that actually makes the Nominatim API request
 * Called by the rate limiter
 */
async function geocodeRequest(args: NominatimRequestArgs): Promise<GeocodeResult | null> {
  const { placeName, biasCoords, language } = args;

  try {
    // Build query parameters
    const params = new URLSearchParams({
      q: placeName,
      format: 'json',
      limit: biasCoords ? '10' : '1', // Get multiple results if we have bias coords to disambiguate
      addressdetails: '1',
      namedetails: '1'
    });

    if (language) {
      params.set('accept-language', language);
    }

    // Add viewbox bias if coordinates provided
    if (biasCoords) {
      const { lat, lng } = biasCoords;
      // Create a ~50km box around the coordinates
      const delta = 0.5; // Approximately 50km
      params.set('viewbox', `${lng - delta},${lat + delta},${lng + delta},${lat - delta}`);
      params.set('bounded', '0'); // Don't strictly limit to box, just bias
    }

    // Make request to Nominatim
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    console.log('[Nominatim] Geocoding:', placeName, biasCoords ? `(biased toward ${biasCoords.lat}, ${biasCoords.lng})` : '');

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

    // If we have bias coordinates, pick the closest result
    let best: NominatimResult;
    if (biasCoords && results.length > 1) {
      console.log(`[Nominatim] Found ${results.length} results, selecting closest to bias coordinates`);

      // Calculate distance from bias coords to each result
      const resultsWithDistance = results.map(result => {
        const distance = calculateDistance(
          biasCoords!.lat,
          biasCoords!.lng,
          parseFloat(result.lat),
          parseFloat(result.lon)
        );
        return { result, distance };
      });

      // Sort by distance and pick closest
      resultsWithDistance.sort((a, b) => a.distance - b.distance);
      best = resultsWithDistance[0].result;

      console.log(`[Nominatim] Selected: ${best.display_name} (${resultsWithDistance[0].distance.toFixed(2)} km from bias coords)`);
    } else {
      best = results[0];
    }

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
 * Geocode a location name using Nominatim with rate limiting and caching
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
     * When provided with multiple results, picks the closest match
     */
    biasCoords?: { lat: number; lng: number };
    /**
     * Language for the result (ISO 639-1 code)
     */
    language?: string;
  } = {}
): Promise<GeocodeResult | null> {
  // Generate cache key (includes bias coords for uniqueness)
  const cacheKey = options.biasCoords
    ? `${placeName}|${options.biasCoords.lat.toFixed(2)},${options.biasCoords.lng.toFixed(2)}`
    : placeName;

  // Check cache first
  const cached = geocodeCache.get(cacheKey);
  if (cached) {
    console.log('[Nominatim] Cache hit:', placeName);
    return cached;
  }

  console.log('[Nominatim] Cache miss, queueing request:', placeName);
  console.log('[Nominatim] Queue length:', rateLimiter.getQueueLength());

  // Enqueue with rate limiter
  try {
    const result = await rateLimiter.enqueue(
      { placeName, biasCoords: options.biasCoords, language: options.language },
      geocodeRequest
    );

    // Cache successful results
    if (result) {
      geocodeCache.set(cacheKey, result);
    }

    return result;
  } catch (error) {
    console.error('[Nominatim] Rate limiter error:', error);
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
