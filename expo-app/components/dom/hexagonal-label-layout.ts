export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  colorIndex?: number;
  photoName?: string;
}

export interface Hexagon {
  id: string;
  x: number; // center x
  y: number; // center y
  col: number;
  row: number;
}

export interface HexLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  hexagonId: string;
  locationX: number;
  locationY: number;
  color: string;
  connectionPointX: number;
  connectionPointY: number;
  photoName?: string;
}

const LABEL_WIDTH = 120;
const LABEL_HEIGHT = 32;

// Get vertices of a flat-top hexagon
function getHexagonVertices(centerX: number, centerY: number, size: number): [number, number][] {
  const points: [number, number][] = [];

  // Flat-top hexagon has 6 vertices, starting at 30° offset
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6; // 60 degrees apart, starting at 30°
    const x = centerX + size * Math.cos(angle);
    const y = centerY + size * Math.sin(angle);
    points.push([x, y]);
  }

  return points;
}

// Generate SVG path for a flat-top hexagon
export function getHexagonPath(centerX: number, centerY: number, size: number): string {
  const points = getHexagonVertices(centerX, centerY, size);

  // Create SVG path
  const pathData = points.map((point, i) => {
    const command = i === 0 ? 'M' : 'L';
    return `${command} ${point[0]} ${point[1]}`;
  }).join(' ') + ' Z'; // Close path

  return pathData;
}

// Find the perpendicular intersection point on a line segment, or null if perpendicular doesn't intersect
function getPerpendicularIntersection(
  x1: number, y1: number, // Line segment start
  x2: number, y2: number, // Line segment end
  px: number, py: number  // Point to project
): { x: number; y: number } | null {
  const dx = x2 - x1;
  const dy = y2 - y1;

  // Calculate parameter t for the perpendicular projection
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);

  // Check if the perpendicular intersection is within the line segment
  if (t < 0 || t > 1) {
    return null; // Perpendicular doesn't intersect the segment
  }

  // Calculate the intersection point
  return {
    x: x1 + t * dx,
    y: y1 + t * dy
  };
}

// Find the closest point on the hexagon perimeter (perpendicular to edge or closest vertex)
function getClosestPointOnHexagon(
  hexCenterX: number,
  hexCenterY: number,
  hexSize: number,
  pointX: number,
  pointY: number
): { x: number; y: number } {
  const vertices = getHexagonVertices(hexCenterX, hexCenterY, hexSize);

  let closestPoint = { x: vertices[0][0], y: vertices[0][1] };
  let minDistance = Infinity;

  // Check all edges for perpendicular intersection
  for (let i = 0; i < vertices.length; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];

    const perpPoint = getPerpendicularIntersection(v1[0], v1[1], v2[0], v2[1], pointX, pointY);

    if (perpPoint) {
      const dx = perpPoint.x - pointX;
      const dy = perpPoint.y - pointY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = perpPoint;
      }
    }
  }

  // Check all vertices (corners)
  for (const vertex of vertices) {
    const dx = vertex[0] - pointX;
    const dy = vertex[1] - pointY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = { x: vertex[0], y: vertex[1] };
    }
  }

  return closestPoint;
}

// Generate flat-top hexagonal grid
function generateHexGrid(
  viewportWidth: number,
  viewportHeight: number,
  hexSize: number
): Hexagon[] {
  const hexagons: Hexagon[] = [];

  // Flat-top hexagon dimensions (hexSize = circumradius = center to vertex)
  // Width (flat to flat) = sqrt(3) * hexSize
  // Height (point to point) = 2 * hexSize
  const horizontalSpacing = Math.sqrt(3) * hexSize; // Distance between hexagon centers horizontally
  const verticalSpacing = 1.5 * hexSize; // Distance between hexagon centers vertically

  // Calculate grid dimensions with padding
  const cols = Math.ceil(viewportWidth / horizontalSpacing) + 2;
  const rows = Math.ceil(viewportHeight / verticalSpacing) + 2;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Offset every other row by half the horizontal spacing
      const offsetX = (row % 2) * (horizontalSpacing / 2);

      const x = col * horizontalSpacing + offsetX;
      const y = row * verticalSpacing;

      // Only include hexagons within viewport bounds (with some margin)
      if (x >= -hexSize && x <= viewportWidth + hexSize &&
          y >= -hexSize && y <= viewportHeight + hexSize) {
        hexagons.push({
          id: `hex-${row}-${col}`,
          x,
          y,
          col,
          row,
        });
      }
    }
  }

  return hexagons;
}

// Check if a point is within radius of a hexagon center
function isPointInHexagonRadius(
  pointX: number,
  pointY: number,
  hexX: number,
  hexY: number,
  radius: number
): boolean {
  const dx = pointX - hexX;
  const dy = pointY - hexY;
  return Math.sqrt(dx * dx + dy * dy) < radius;
}

// Filter hexagons that don't overlap with any location markers
function filterAvailableHexagons(
  hexagons: Hexagon[],
  locations: Array<{ x: number; y: number }>,
  exclusionRadius: number
): Hexagon[] {
  return hexagons.filter(hex => {
    // Check if this hexagon is too close to any location marker
    for (const location of locations) {
      if (isPointInHexagonRadius(location.x, location.y, hex.x, hex.y, exclusionRadius)) {
        return false; // Hexagon overlaps with location, exclude it
      }
    }
    return true; // Hexagon is available
  });
}

// Find nearest available hexagon to a point, preferring edge positions
function findNearestHexagon(
  targetX: number,
  targetY: number,
  availableHexagons: Hexagon[],
  usedHexagonIds: Set<string>,
  viewportWidth: number,
  viewportHeight: number
): Hexagon | null {
  let nearest: Hexagon | null = null;
  let bestScore = Infinity;

  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  for (const hex of availableHexagons) {
    // Skip if already used
    if (usedHexagonIds.has(hex.id)) continue;

    // Distance from target location (we want this small)
    const dxTarget = hex.x - targetX;
    const dyTarget = hex.y - targetY;
    const distanceToTarget = Math.sqrt(dxTarget * dxTarget + dyTarget * dyTarget);

    // Distance from viewport center (we want this large)
    const dxCenter = hex.x - centerX;
    const dyCenter = hex.y - centerY;
    const distanceFromCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);

    // Score: balance between being close to target and far from center
    // Lower score is better
    // Weight the center distance negatively (subtract it) to prefer edge positions
    const score = distanceToTarget - (distanceFromCenter * 0.3);

    if (score < bestScore) {
      bestScore = score;
      nearest = hex;
    }
  }

  return nearest;
}

// Calculate optimal hexagon size based on label dimensions and viewport
function calculateHexSize(viewportWidth: number, viewportHeight: number): number {
  // Base size on label dimensions
  // A hexagon should be able to contain a label with some padding
  const labelDiagonal = Math.sqrt(LABEL_WIDTH * LABEL_WIDTH + LABEL_HEIGHT * LABEL_HEIGHT);
  const baseSize = labelDiagonal / 2;

  // Adjust based on viewport to get reasonable grid density
  const viewportDiagonal = Math.sqrt(viewportWidth * viewportWidth + viewportHeight * viewportHeight);
  const targetHexagonsAcrossDiagonal = 8; // Target number of hexagons across diagonal
  const sizeFromViewport = viewportDiagonal / (targetHexagonsAcrossDiagonal * 2);

  // Use average of both approaches
  return (baseSize + sizeFromViewport) / 2;
}

export interface HexGridData {
  labels: HexLabel[];
  hexagons: Hexagon[];
  hexSize: number;
  availableHexagons: Hexagon[];
  usedHexagonIds: Set<string>;
}

export function calculateHexagonalLabels(
  locations: Location[],
  mapProjection: (lng: number, lat: number) => { x: number; y: number } | null,
  viewportWidth: number,
  viewportHeight: number,
  markerColors: string[]
): HexGridData {
  if (locations.length === 0) {
    return {
      labels: [],
      hexagons: [],
      hexSize: 0,
      availableHexagons: [],
      usedHexagonIds: new Set(),
    };
  }

  // Calculate optimal hexagon size
  const hexSize = calculateHexSize(viewportWidth, viewportHeight);

  // Generate hexagonal grid
  const hexagons = generateHexGrid(viewportWidth, viewportHeight, hexSize);

  // Project locations to screen coordinates
  const projectedLocations = locations
    .map(location => {
      const projected = mapProjection(location.lng, location.lat);
      if (!projected) return null;

      return {
        ...location,
        screenX: projected.x,
        screenY: projected.y,
      };
    })
    .filter((loc): loc is NonNullable<typeof loc> => loc !== null);

  // Filter out hexagons that overlap with location markers
  // Use hexagon circumradius + buffer to ensure entire hexagon doesn't cover location
  const exclusionRadius = hexSize * 1.2; // Hexagon radius + 20% buffer

  const availableHexagons = filterAvailableHexagons(
    hexagons,
    projectedLocations.map(loc => ({ x: loc.screenX, y: loc.screenY })),
    exclusionRadius
  );

  // Assign each location to nearest available hexagon
  const assignments: HexLabel[] = [];
  const usedHexagonIds = new Set<string>();

  for (let i = 0; i < projectedLocations.length; i++) {
    const location = projectedLocations[i];
    const colorIndex = location.colorIndex ?? i;
    const color = markerColors[colorIndex % markerColors.length];

    // Find nearest available hexagon (preferring edge positions)
    const nearestHex = findNearestHexagon(
      location.screenX,
      location.screenY,
      availableHexagons,
      usedHexagonIds,
      viewportWidth,
      viewportHeight
    );

    if (nearestHex) {
      // Find the closest point on the hexagon perimeter (vertex or edge midpoint)
      const connectionPoint = getClosestPointOnHexagon(
        nearestHex.x,
        nearestHex.y,
        hexSize,
        location.screenX,
        location.screenY
      );

      // Position label at hexagon center
      // The label will be rendered in a separate overlay layer above the hexagons
      assignments.push({
        id: location.id,
        name: location.name,
        x: nearestHex.x,
        y: nearestHex.y,
        hexagonId: nearestHex.id,
        locationX: location.screenX,
        locationY: location.screenY,
        color,
        connectionPointX: connectionPoint.x,
        connectionPointY: connectionPoint.y,
        photoName: location.photoName,
      });
      usedHexagonIds.add(nearestHex.id);
    }
  }

  return {
    labels: assignments,
    hexagons,
    hexSize,
    availableHexagons,
    usedHexagonIds,
  };
}
