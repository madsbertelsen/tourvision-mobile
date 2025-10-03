export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  colorIndex?: number;
  photoName?: string;
}

export interface GeoHexagon {
  id: string;
  lat: number; // center latitude
  lng: number; // center longitude
  col: number;
  row: number;
}

export interface GeoHexLabel {
  id: string;
  name: string;
  lat: number;
  lng: number;
  hexagonId: string;
  locationLat: number;
  locationLng: number;
  color: string;
  photoName?: string;
}

// Calculate haversine distance between two points in kilometers
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate degrees per kilometer at a given latitude
// At equator: 1 deg lat ≈ 111km, 1 deg lng ≈ 111km
// At poles: 1 deg lat ≈ 111km, 1 deg lng ≈ 0km
function getDegreesPerKm(lat: number): { latPerKm: number; lngPerKm: number } {
  const latPerKm = 1 / 111; // Roughly constant
  const lngPerKm = 1 / (111 * Math.cos(lat * Math.PI / 180)); // Varies with latitude
  return { latPerKm, lngPerKm };
}

// Generate flat-top hexagonal grid in geographic coordinates
function generateGeoHexGrid(
  boundsLat: { min: number; max: number },
  boundsLng: { min: number; max: number },
  hexSizeKm: number
): GeoHexagon[] {
  const hexagons: GeoHexagon[] = [];

  // Use center latitude for degree calculations (approximation)
  const centerLat = (boundsLat.min + boundsLat.max) / 2;
  const { latPerKm, lngPerKm } = getDegreesPerKm(centerLat);

  // Flat-top hexagon spacing in kilometers
  const horizontalSpacingKm = Math.sqrt(3) * hexSizeKm;
  const verticalSpacingKm = 1.5 * hexSizeKm;

  // Convert to degrees
  const horizontalSpacingDeg = horizontalSpacingKm * lngPerKm;
  const verticalSpacingDeg = verticalSpacingKm * latPerKm;

  // Calculate grid dimensions with padding
  const lngRange = boundsLng.max - boundsLng.min;
  const latRange = boundsLat.max - boundsLat.min;

  const cols = Math.ceil(lngRange / horizontalSpacingDeg) + 4; // Extra padding
  const rows = Math.ceil(latRange / verticalSpacingDeg) + 4;

  // Start from bounds minimum with padding
  const startLng = boundsLng.min - horizontalSpacingDeg * 2;
  const startLat = boundsLat.min - verticalSpacingDeg * 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Offset every other row by half the horizontal spacing
      const offsetLng = (row % 2) * (horizontalSpacingDeg / 2);

      const lng = startLng + col * horizontalSpacingDeg + offsetLng;
      const lat = startLat + row * verticalSpacingDeg;

      hexagons.push({
        id: `hex-${row}-${col}`,
        lat,
        lng,
        col,
        row,
      });
    }
  }

  return hexagons;
}

// Filter hexagons that don't overlap with any location markers
function filterAvailableGeoHexagons(
  hexagons: GeoHexagon[],
  locations: Location[],
  exclusionRadiusKm: number
): GeoHexagon[] {
  return hexagons.filter(hex => {
    // Check if this hexagon is too close to any location marker
    for (const location of locations) {
      const distance = haversineDistance(hex.lat, hex.lng, location.lat, location.lng);
      if (distance < exclusionRadiusKm) {
        return false; // Hexagon overlaps with location, exclude it
      }
    }
    return true; // Hexagon is available
  });
}

// Find nearest available hexagon to a location
function findNearestGeoHexagon(
  targetLat: number,
  targetLng: number,
  availableHexagons: GeoHexagon[],
  usedHexagonIds: Set<string>
): GeoHexagon | null {
  let nearest: GeoHexagon | null = null;
  let minDistance = Infinity;

  for (const hex of availableHexagons) {
    // Skip if already used
    if (usedHexagonIds.has(hex.id)) continue;

    const distance = haversineDistance(targetLat, targetLng, hex.lat, hex.lng);

    if (distance < minDistance) {
      minDistance = distance;
      nearest = hex;
    }
  }

  return nearest;
}

// Calculate optimal hexagon size based on zoom level and viewport
function calculateGeoHexSizeKm(zoom: number, viewportHeightPx: number): number {
  // At zoom 0, entire world (40000km) fits in viewport
  // Each zoom level doubles the scale
  const worldHeightKm = 40000; // Approximate
  const viewportHeightKm = worldHeightKm / Math.pow(2, zoom);

  // Target about 8 hexagons vertically in viewport
  const targetHexagonsVertically = 8;
  const hexSizeKm = viewportHeightKm / targetHexagonsVertically / 2; // /2 for radius

  // Clamp between reasonable values (1km to 500km)
  return Math.max(1, Math.min(500, hexSizeKm));
}

export interface GeoHexGridData {
  labels: GeoHexLabel[];
  hexagons: GeoHexagon[];
  hexSizeKm: number;
  availableHexagons: GeoHexagon[];
  usedHexagonIds: Set<string>;
}

export function calculateGeoHexagonalLabels(
  locations: Location[],
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  },
  zoom: number,
  viewportHeightPx: number,
  markerColors: string[]
): GeoHexGridData {
  if (locations.length === 0) {
    return {
      labels: [],
      hexagons: [],
      hexSizeKm: 0,
      availableHexagons: [],
      usedHexagonIds: new Set(),
    };
  }

  // Calculate optimal hexagon size based on zoom level
  const hexSizeKm = calculateGeoHexSizeKm(zoom, viewportHeightPx);

  // Generate hexagonal grid in geographic coordinates
  const hexagons = generateGeoHexGrid(
    { min: bounds.south, max: bounds.north },
    { min: bounds.west, max: bounds.east },
    hexSizeKm
  );

  // Filter out hexagons that overlap with location markers
  // Use hexagon size + buffer to ensure entire hexagon doesn't cover location
  const exclusionRadiusKm = hexSizeKm * 1.2; // Hexagon radius + 20% buffer

  const availableHexagons = filterAvailableGeoHexagons(
    hexagons,
    locations,
    exclusionRadiusKm
  );

  // Assign each location to nearest available hexagon
  const assignments: GeoHexLabel[] = [];
  const usedHexagonIds = new Set<string>();

  for (let i = 0; i < locations.length; i++) {
    const location = locations[i];
    const colorIndex = location.colorIndex ?? i;
    const color = markerColors[colorIndex % markerColors.length];

    // Find nearest available hexagon
    const nearestHex = findNearestGeoHexagon(
      location.lat,
      location.lng,
      availableHexagons,
      usedHexagonIds
    );

    if (nearestHex) {
      assignments.push({
        id: location.id,
        name: location.name,
        lat: nearestHex.lat,
        lng: nearestHex.lng,
        hexagonId: nearestHex.id,
        locationLat: location.lat,
        locationLng: location.lng,
        color,
        photoName: location.photoName,
      });
      usedHexagonIds.add(nearestHex.id);
    }
  }

  return {
    labels: assignments,
    hexagons,
    hexSizeKm,
    availableHexagons,
    usedHexagonIds,
  };
}
