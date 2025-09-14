// Simple geocoding utility with hardcoded coordinates for common cities
// In production, this would use Mapbox Geocoding API

interface Coordinates {
  lat: number;
  lng: number;
}

const CITY_COORDINATES: Record<string, Coordinates> = {
  'paris': { lat: 48.8566, lng: 2.3522 },
  'paris, france': { lat: 48.8566, lng: 2.3522 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'london, uk': { lat: 51.5074, lng: -0.1278 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'new york, usa': { lat: 40.7128, lng: -74.0060 },
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'tokyo, japan': { lat: 35.6762, lng: 139.6503 },
  'rome': { lat: 41.9028, lng: 12.4964 },
  'rome, italy': { lat: 41.9028, lng: 12.4964 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'barcelona, spain': { lat: 41.3851, lng: 2.1734 },
  'amsterdam': { lat: 52.3676, lng: 4.9041 },
  'amsterdam, netherlands': { lat: 52.3676, lng: 4.9041 },
  'berlin': { lat: 52.5200, lng: 13.4050 },
  'berlin, germany': { lat: 52.5200, lng: 13.4050 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'sydney, australia': { lat: -33.8688, lng: 151.2093 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'san francisco, usa': { lat: 37.7749, lng: -122.4194 },
};

export async function geocodeLocation(locationName: string): Promise<Coordinates | null> {
  // Normalize the location name for lookup
  const normalized = locationName.toLowerCase().trim();
  
  // Check if we have hardcoded coordinates
  if (CITY_COORDINATES[normalized]) {
    return CITY_COORDINATES[normalized];
  }
  
  // Check partial matches (e.g., "Paris" without "France")
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (key.includes(normalized) || normalized.includes(key.split(',')[0])) {
      return coords;
    }
  }
  
  // In production, make API call to Mapbox Geocoding API here
  // For now, return default coordinates (center of Europe)
  return { lat: 48.8566, lng: 2.3522 };
}

export function getRandomNearbyCoordinate(baseCoords: Coordinates, radiusKm: number = 50): Coordinates {
  // Generate random offset within radius
  const radiusInDegrees = radiusKm / 111; // Rough conversion (1 degree ≈ 111km)
  const randomAngle = Math.random() * 2 * Math.PI;
  const randomDistance = Math.random() * radiusInDegrees;
  
  return {
    lat: baseCoords.lat + randomDistance * Math.cos(randomAngle),
    lng: baseCoords.lng + randomDistance * Math.sin(randomAngle)
  };
}