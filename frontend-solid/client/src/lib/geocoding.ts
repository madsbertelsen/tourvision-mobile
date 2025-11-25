// Geocode a location using Nominatim API
export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

export async function geocodeLocation(locationName: string): Promise<GeocodingResult | null> {
  try {
    console.log(`[Geocoding] Geocoding "${locationName}"...`);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`,
      {
        headers: {
          'User-Agent': 'TourVision-Solid/1.0'
        }
      }
    );

    if (!response.ok) {
      console.error('[Geocoding] Nominatim API error:', response.status);
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name
      };
    }

    console.log(`[Geocoding] No results found for "${locationName}"`);
    return null;
  } catch (error) {
    console.error('[Geocoding] Error:', error);
    return null;
  }
}
