import hexGrid from '@turf/hex-grid';
import { point } from '@turf/helpers';
import distance from '@turf/distance';
import type { Feature, Polygon } from 'geojson';

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
  feature: Feature<Polygon>; // GeoJSON feature from Turf.js
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

// Calculate haversine distance between two points in kilometers using Turf.js
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const from = point([lng1, lat1]);
  const to = point([lng2, lat2]);
  return distance(from, to, { units: 'kilometers' });
}

// Generate flat-top hexagonal grid in geographic coordinates using Turf.js
function generateGeoHexGrid(
  boundsLat: { min: number; max: number },
  boundsLng: { min: number; max: number },
  hexSizeKm: number
): GeoHexagon[] {
  // Turf.js hexGrid expects bbox in [minX, minY, maxX, maxY] format (lng, lat)
  const bbox: [number, number, number, number] = [
    boundsLng.min,
    boundsLat.min,
    boundsLng.max,
    boundsLat.max,
  ];

  // Generate hexagonal grid using Turf.js
  const grid = hexGrid(bbox, hexSizeKm, { units: 'kilometers' });

  // Convert Turf.js features to our GeoHexagon format
  const hexagons: GeoHexagon[] = grid.features.map((feature, index) => {
    // Calculate center point of hexagon
    const coordinates = feature.geometry.coordinates[0];
    const centerLng = coordinates.reduce((sum, coord) => sum + coord[0], 0) / coordinates.length;
    const centerLat = coordinates.reduce((sum, coord) => sum + coord[1], 0) / coordinates.length;

    return {
      id: `hex-${index}`,
      lat: centerLat,
      lng: centerLng,
      feature,
    };
  });

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
