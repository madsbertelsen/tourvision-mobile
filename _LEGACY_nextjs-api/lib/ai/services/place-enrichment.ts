interface PlaceEnrichmentResult {
  placeName: string;
  description: string;
  coordinates: [number, number]; // [longitude, latitude]
  imageUrl?: string;
  category: 'attraction' | 'restaurant' | 'activity' | 'accommodation' | 'shopping' | 'nature';
  rating?: number;
  priceLevel?: '$' | '$$' | '$$$' | '$$$$';
  estimatedDuration?: string;
  address?: string;
  whyVisit: string;
  tags?: string[];
  placeId?: string;
}

interface PlaceToEnrich {
  placeName: string;
  description: string;
  category: 'attraction' | 'restaurant' | 'activity' | 'accommodation' | 'shopping' | 'nature';
  whyVisit: string;
  estimatedDuration?: string;
  tags?: string[];
  priceLevel?: '$' | '$$' | '$$$' | '$$$$';
}

// Simple in-memory cache for Google Places results
const placeCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Enriches a place with real data from Google Places API
 */
export async function enrichPlaceWithGoogleData(
  place: PlaceToEnrich,
  city: string
): Promise<PlaceEnrichmentResult> {
  const cacheKey = `${place.placeName}:${city}`;
  
  // Check cache first
  const cached = placeCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Query Google Places API
    const searchQuery = `${place.placeName} ${city}`;
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.NEXT_PUBLIC_BASE_URL || ''
      : `http://localhost:${process.env.PORT || 3000}`;
    
    const response = await fetch(
      `${baseUrl}/api/places?q=${encodeURIComponent(searchQuery)}&type=geocode`
    );
    
    if (response.ok) {
      const placeData = await response.json();
      
      // Create enriched result with Google Places data
      const enrichedPlace: PlaceEnrichmentResult = {
        placeName: place.placeName,
        description: place.description,
        // Google Places returns [lng, lat] which is what we want for Mapbox
        coordinates: placeData.coordinates || [0, 0],
        category: place.category,
        rating: placeData.rating,
        priceLevel: place.priceLevel,
        estimatedDuration: place.estimatedDuration,
        address: placeData.formattedAddress || placeData.address,
        whyVisit: place.whyVisit,
        tags: place.tags || placeData.types?.slice(0, 3),
        placeId: placeData.placeId,
        imageUrl: placeData.photoUrl || placeData.photos?.[0]?.url,
      };
      
      // Cache the result
      placeCache.set(cacheKey, { 
        data: enrichedPlace, 
        timestamp: Date.now() 
      });
      
      console.log(`[PlaceEnrichment] Enriched ${place.placeName} with coordinates:`, enrichedPlace.coordinates);
      console.log(`[PlaceEnrichment] Photo URL for ${place.placeName}:`, enrichedPlace.imageUrl);
      return enrichedPlace;
    }
  } catch (error) {
    console.error(`[PlaceEnrichment] Failed to enrich ${place.placeName}:`, error);
  }
  
  // Fallback: return place with default coordinates for the city
  // This ensures the UI still works even if Google Places fails
  const fallbackCoordinates = getCityDefaultCoordinates(city);
  
  return {
    ...place,
    coordinates: fallbackCoordinates,
    address: `${place.placeName}, ${city}`,
  };
}

/**
 * Get default coordinates for major cities as fallback
 */
function getCityDefaultCoordinates(city: string): [number, number] {
  const cityLower = city.toLowerCase();
  
  const cityCoordinates: Record<string, [number, number]> = {
    'barcelona': [2.1734, 41.3851],
    'madrid': [-3.7038, 40.4168],
    'paris': [2.3522, 48.8566],
    'london': [-0.1276, 51.5074],
    'rome': [12.4964, 41.9028],
    'berlin': [13.4050, 52.5200],
    'amsterdam': [4.9041, 52.3676],
    'lisbon': [-9.1393, 38.7223],
    'copenhagen': [12.5683, 55.6761],
    'stockholm': [18.0686, 59.3293],
    'oslo': [10.7522, 59.9139],
    'vienna': [16.3738, 48.2082],
    'prague': [14.4378, 50.0755],
    'budapest': [19.0402, 47.4979],
    'warsaw': [21.0122, 52.2297],
  };
  
  // Try to find city coordinates
  for (const [key, coords] of Object.entries(cityCoordinates)) {
    if (cityLower.includes(key)) {
      return coords;
    }
  }
  
  // Default fallback (center of Europe)
  return [10.0, 50.0];
}

/**
 * Batch enrich multiple places with progress callback
 */
export async function enrichPlacesWithGoogleData(
  places: PlaceToEnrich[],
  city: string,
  onProgress?: (enrichedPlace: PlaceEnrichmentResult, index: number) => void
): Promise<PlaceEnrichmentResult[]> {
  const enrichedPlaces: PlaceEnrichmentResult[] = [];
  
  for (let i = 0; i < places.length; i++) {
    const enrichedPlace = await enrichPlaceWithGoogleData(places[i], city);
    enrichedPlaces.push(enrichedPlace);
    
    if (onProgress) {
      onProgress(enrichedPlace, i);
    }
    
    // Add a small delay to avoid rate limiting
    if (i < places.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return enrichedPlaces;
}