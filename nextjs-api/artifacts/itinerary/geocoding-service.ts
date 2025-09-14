export interface GeocodedLocation {
  name: string;
  coordinates: [number, number];
  placeId?: string;
  formattedAddress?: string;
  types?: string[];
  rating?: number;
  url: string;
  source: 'google' | 'mapbox';
}

// Client-side cache for geocoded results
const clientGeocodeCache = new Map<string, GeocodedLocation>();

/**
 * Geocode a location name to get coordinates and place information
 * @param name - Location name to geocode
 * @param context - Optional context (e.g., "Stockholm, Sweden") to improve accuracy
 * @returns Geocoded location information or null if not found
 */
export async function geocodeLocation(
  name: string,
  context?: string
): Promise<GeocodedLocation | null> {
  try {
    // Build the query with optional context
    const query = context ? `${name}, ${context}` : name;
    
    // Check client-side cache first
    const cacheKey = query.toLowerCase();
    if (clientGeocodeCache.has(cacheKey)) {
      return clientGeocodeCache.get(cacheKey)!;
    }

    // Call the places API - use proper URL based on environment
    let baseUrl = '';
    if (typeof window === 'undefined') {
      // Server-side: use absolute URL
      if (process.env.NEXT_PUBLIC_APP_URL) {
        baseUrl = process.env.NEXT_PUBLIC_APP_URL;
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else {
        baseUrl = 'http://localhost:3002';
      }
    }
    const response = await fetch(`${baseUrl}/api/places?q=${encodeURIComponent(query)}&type=geocode`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Location not found: ${query}`);
        return null;
      }
      throw new Error(`Failed to geocode: ${response.statusText}`);
    }

    const result = await response.json() as GeocodedLocation;
    
    // Cache the result
    clientGeocodeCache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error(`Error geocoding location "${name}":`, error);
    return null;
  }
}

/**
 * Batch geocode multiple locations
 * @param locations - Array of location names
 * @param context - Optional context for all locations
 * @returns Map of location names to geocoded results
 */
export async function batchGeocodeLocations(
  locations: string[],
  context?: string
): Promise<Map<string, GeocodedLocation | null>> {
  const results = new Map<string, GeocodedLocation | null>();
  
  // Process in parallel with a limit to avoid rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < locations.length; i += BATCH_SIZE) {
    const batch = locations.slice(i, i + BATCH_SIZE);
    const promises = batch.map(location => 
      geocodeLocation(location, context)
        .then(result => ({ location, result }))
    );
    
    const batchResults = await Promise.all(promises);
    for (const { location, result } of batchResults) {
      results.set(location, result);
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < locations.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Extract context from itinerary content (e.g., city name from title)
 */
export function extractContextFromItinerary(content: string): string | undefined {
  // Strip HTML tags to get plain text
  const plainContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  
  // First check for city name in title (e.g., "Oslo 2-Day Itinerary")
  const titlePatterns = [
    /^#*\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+\d*-?Day\s+(?:Trip|Itinerary)/im,
    /^#*\s*\d*-?Day\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:Trip|Itinerary)/im,
    /(?:itinerary for|trip to|visiting|exploring)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  ];
  
  for (const pattern of titlePatterns) {
    const match = plainContent.match(pattern);
    if (match?.[1]) {
      const city = match[1].trim();
      // Add country context for common Nordic cities
      const nordicCities = {
        'Oslo': 'Oslo, Norway',
        'Bergen': 'Bergen, Norway',
        'Trondheim': 'Trondheim, Norway',
        'Stockholm': 'Stockholm, Sweden',
        'Gothenburg': 'Gothenburg, Sweden',
        'Malmö': 'Malmö, Sweden',
        'Copenhagen': 'Copenhagen, Denmark',
        'Aarhus': 'Aarhus, Denmark',
        'Helsinki': 'Helsinki, Finland',
        'Reykjavik': 'Reykjavik, Iceland'
      };
      
      return nordicCities[city] || city;
    }
  }
  
  // Look for city names in the first few lines
  const lines = plainContent.split('\n').slice(0, 10);
  for (const line of lines) {
    // Skip lines that are too long (likely paragraphs)
    if (line.length > 100) continue;
    
    // Look for patterns like "in Oslo" or "to Oslo, Norway"
    const cityMatch = line.match(/(?:in|at|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s*([A-Z][a-z]+)?/);
    if (cityMatch) {
      const city = cityMatch[1].trim();
      const country = cityMatch[2]?.trim();
      
      // Only return if it looks like a city name, not a sentence fragment
      if (city.split(' ').length <= 2) {
        return country ? `${city}, ${country}` : city;
      }
    }
  }
  
  return undefined;
}

/**
 * Clear the geocoding cache
 */
export function clearGeocodeCache() {
  clientGeocodeCache.clear();
}