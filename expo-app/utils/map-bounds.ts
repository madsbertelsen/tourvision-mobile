export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Calculate bounding box from center coordinates and radius in kilometers
 * Uses approximate conversion: 1 degree latitude ≈ 111 km
 * Longitude degrees vary by latitude (closer at poles)
 */
export function getBoundingBoxFromCenterRadius(
  center: { lat: number; lng: number },
  radiusKm: number
): BoundingBox {
  // Approximate: 1 degree latitude ≈ 111 km
  const latDelta = radiusKm / 111;

  // Longitude varies by latitude (closer at poles)
  // At equator: 1 degree ≈ 111 km, at poles: 1 degree ≈ 0 km
  const lngDelta = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/**
 * Calculate bounding box from an array of locations
 */
export function calculateBoundingBox(
  locations: Array<{ lat: number; lng: number }>
): BoundingBox | null {
  if (locations.length === 0) return null;

  const bounds = {
    minLat: Infinity,
    maxLat: -Infinity,
    minLng: Infinity,
    maxLng: -Infinity,
  };

  locations.forEach((loc) => {
    bounds.minLat = Math.min(bounds.minLat, loc.lat);
    bounds.maxLat = Math.max(bounds.maxLat, loc.lat);
    bounds.minLng = Math.min(bounds.minLng, loc.lng);
    bounds.maxLng = Math.max(bounds.maxLng, loc.lng);
  });

  return bounds;
}

/**
 * Convert bounding box to optimal map view state (center + zoom)
 * Takes viewport dimensions into account
 */
export function getViewStateFromBounds(
  bounds: BoundingBox,
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 0.3 // 30% padding as fraction
): { center: { lat: number; lng: number }; zoom: number } {
  const center = {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };

  // Calculate latitude and longitude span
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;

  // Add padding to the spans
  const paddedLatSpan = latSpan * (1 + padding * 2);
  const paddedLngSpan = lngSpan * (1 + padding * 2);

  // Estimate zoom level (Mapbox uses 256x256 tiles)
  // Formula approximates zoom based on viewport size and coordinate span
  // At zoom 0, the entire world (360°) fits in 256 pixels
  const latZoom = Math.log2((viewportHeight * 360) / (paddedLatSpan * 256));
  const lngZoom = Math.log2((viewportWidth * 360) / (paddedLngSpan * 256));

  // Use the minimum zoom to ensure both dimensions fit
  const zoom = Math.floor(Math.min(latZoom, lngZoom));

  // Cap zoom between 2 (world view) and 12 (readable detail)
  return { center, zoom: Math.max(2, Math.min(12, zoom)) };
}
