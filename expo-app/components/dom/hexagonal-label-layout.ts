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

// Calculate distance from point to line segment
function distanceToLineSegment(
  px: number, py: number, // Point
  x1: number, y1: number, x2: number, y2: number // Line segment
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    // Line segment is actually a point
    const dpx = px - x1;
    const dpy = py - y1;
    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  // Calculate parameter t (projection of point onto line)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));

  // Find closest point on segment
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  // Return distance to closest point
  const dpx = px - closestX;
  const dpy = py - closestY;
  return Math.sqrt(dpx * dpx + dpy * dpy);
}

// Check if two line segments intersect
function doLinesIntersect(
  x1: number, y1: number, x2: number, y2: number, // Line 1
  x3: number, y3: number, x4: number, y4: number  // Line 2
): boolean {
  // Calculate direction of line segments
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

  // Lines are parallel if denominator is 0
  if (Math.abs(denom) < 0.0001) return false;

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  // Lines intersect if both parameters are between 0 and 1
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
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

// Filter hexagons that are too close to viewport edges
function filterEdgeHexagons(
  hexagons: Hexagon[],
  viewportWidth: number,
  viewportHeight: number,
  margin: number
): Hexagon[] {
  return hexagons.filter(hex => {
    // Exclude hexagons too close to any edge
    return (
      hex.x >= margin &&
      hex.x <= viewportWidth - margin &&
      hex.y >= margin &&
      hex.y <= viewportHeight - margin
    );
  });
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
  viewportHeight: number,
  existingAssignments: HexLabel[],
  minLabelDistance: number
): Hexagon | null {
  let nearest: Hexagon | null = null;
  let bestScore = Infinity;

  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  for (const hex of availableHexagons) {
    // Skip if already used
    if (usedHexagonIds.has(hex.id)) continue;

    // Skip if too close to any existing label
    let tooCloseToExisting = false;
    for (const existing of existingAssignments) {
      const dx = hex.x - existing.x;
      const dy = hex.y - existing.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < minLabelDistance) {
        tooCloseToExisting = true;
        break;
      }
    }
    if (tooCloseToExisting) continue;

    // Count how many existing connection lines would be crossed
    let crossingCount = 0;
    for (const existing of existingAssignments) {
      if (doLinesIntersect(
        targetX, targetY, hex.x, hex.y,
        existing.locationX, existing.locationY, existing.x, existing.y
      )) {
        crossingCount++;
      }
    }

    // Distance from target location (we want this small)
    const dxTarget = hex.x - targetX;
    const dyTarget = hex.y - targetY;
    const distanceToTarget = Math.sqrt(dxTarget * dxTarget + dyTarget * dyTarget);

    // Distance from viewport center (we want this large)
    const dxCenter = hex.x - centerX;
    const dyCenter = hex.y - centerY;
    const distanceFromCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);

    // Score: balance between being close to target, far from center, and avoiding crossings
    // Lower score is better
    // Weight the center distance negatively (subtract it) to prefer edge positions
    // Heavily penalize crossings (add 1000 per crossing to make them very undesirable)
    const score = distanceToTarget - (distanceFromCenter * 0.3) + (crossingCount * 1000);

    if (score < bestScore) {
      bestScore = score;
      nearest = hex;
    }
  }

  return nearest;
}

// Apply force simulation to relax label positions
function applyForceSimulation(
  labels: HexLabel[],
  viewportWidth: number,
  viewportHeight: number,
  routeSegments: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  iterations: number = 50
): HexLabel[] {
  const labelPositions = labels.map(label => ({ x: label.x, y: label.y }));

  const edgeMargin = 100;
  const minDistance = LABEL_WIDTH + 20;
  const routeRepulsionDistance = 60; // Minimum distance from route lines

  for (let iter = 0; iter < iterations; iter++) {
    const forces = labelPositions.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < labels.length; i++) {
      // Force 1: Attraction to target location (anchor)
      const dxTarget = labels[i].locationX - labelPositions[i].x;
      const dyTarget = labels[i].locationY - labelPositions[i].y;
      const distTarget = Math.sqrt(dxTarget * dxTarget + dyTarget * dyTarget);
      if (distTarget > 0) {
        forces[i].x += (dxTarget / distTarget) * 0.5;
        forces[i].y += (dyTarget / distTarget) * 0.5;
      }

      // Force 2: Repulsion from other labels
      for (let j = 0; j < labels.length; j++) {
        if (i === j) continue;

        const dx = labelPositions[i].x - labelPositions[j].x;
        const dy = labelPositions[i].y - labelPositions[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < minDistance && dist > 0) {
          const repulsion = (minDistance - dist) / dist;
          forces[i].x += (dx / dist) * repulsion * 2;
          forces[i].y += (dy / dist) * repulsion * 2;
        }
      }

      // Force 3: Keep within viewport bounds
      if (labelPositions[i].x < edgeMargin) {
        forces[i].x += (edgeMargin - labelPositions[i].x) * 0.3;
      }
      if (labelPositions[i].x > viewportWidth - edgeMargin) {
        forces[i].x -= (labelPositions[i].x - (viewportWidth - edgeMargin)) * 0.3;
      }
      if (labelPositions[i].y < edgeMargin) {
        forces[i].y += (edgeMargin - labelPositions[i].y) * 0.3;
      }
      if (labelPositions[i].y > viewportHeight - edgeMargin) {
        forces[i].y -= (labelPositions[i].y - (viewportHeight - edgeMargin)) * 0.3;
      }

      // Force 4: Avoid line crossings
      for (let j = 0; j < labels.length; j++) {
        if (i === j) continue;

        if (doLinesIntersect(
          labels[i].locationX, labels[i].locationY, labelPositions[i].x, labelPositions[i].y,
          labels[j].locationX, labels[j].locationY, labelPositions[j].x, labelPositions[j].y
        )) {
          // Push labels perpendicular to their connection vectors
          const dx = labelPositions[i].x - labels[i].locationX;
          const dy = labelPositions[i].y - labels[i].locationY;
          const perpX = -dy;
          const perpY = dx;
          const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
          if (perpLen > 0) {
            forces[i].x += (perpX / perpLen) * 1.0;
            forces[i].y += (perpY / perpLen) * 1.0;
          }
        }
      }

      // Force 5: Repulsion from route lines
      for (const segment of routeSegments) {
        const dist = distanceToLineSegment(
          labelPositions[i].x, labelPositions[i].y,
          segment.x1, segment.y1, segment.x2, segment.y2
        );

        if (dist < routeRepulsionDistance) {
          // Calculate repulsion direction (perpendicular to route segment)
          const dx = segment.x2 - segment.x1;
          const dy = segment.y2 - segment.y1;
          const len = Math.sqrt(dx * dx + dy * dy);

          if (len > 0) {
            // Find closest point on segment
            const t = Math.max(0, Math.min(1,
              ((labelPositions[i].x - segment.x1) * dx + (labelPositions[i].y - segment.y1) * dy) / (len * len)
            ));
            const closestX = segment.x1 + t * dx;
            const closestY = segment.y1 + t * dy;

            // Push away from closest point
            const repelX = labelPositions[i].x - closestX;
            const repelY = labelPositions[i].y - closestY;
            const repelLen = Math.sqrt(repelX * repelX + repelY * repelY);

            if (repelLen > 0) {
              const strength = (routeRepulsionDistance - dist) / routeRepulsionDistance;
              forces[i].x += (repelX / repelLen) * strength * 1.5;
              forces[i].y += (repelY / repelLen) * strength * 1.5;
            }
          }
        }
      }
    }

    // Apply forces with damping
    const damping = 0.5;
    for (let i = 0; i < labelPositions.length; i++) {
      labelPositions[i].x += forces[i].x * damping;
      labelPositions[i].y += forces[i].y * damping;
    }
  }

  // Return labels (positions will be snapped to hexagons later)
  return labels.map((label, i) => ({
    ...label,
    idealX: labelPositions[i].x,
    idealY: labelPositions[i].y,
  }));
}

// Snap label positions to nearest hexagon centers, avoiding clustering
function snapLabelsToHexagons(
  labels: Array<HexLabel & { idealX: number; idealY: number }>,
  hexagons: Hexagon[],
  usedHexagonIds: Set<string>
): HexLabel[] {
  const snappedLabels: HexLabel[] = [];
  const newUsedIds = new Set(usedHexagonIds);
  const minHexDistance = LABEL_WIDTH + 20; // Same minimum distance as in force simulation

  for (const label of labels) {
    // Find nearest available hexagon to ideal position
    let nearestHex: Hexagon | null = null;
    let minDist = Infinity;

    for (const hex of hexagons) {
      // Skip if already used by another label in this snapping pass
      if (newUsedIds.has(hex.id) && hex.id !== label.hexagonId) continue;

      // Skip if too close to any already-snapped label
      let tooCloseToSnapped = false;
      for (const snapped of snappedLabels) {
        const dx = hex.x - snapped.x;
        const dy = hex.y - snapped.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minHexDistance) {
          tooCloseToSnapped = true;
          break;
        }
      }
      if (tooCloseToSnapped) continue;

      const dx = hex.x - label.idealX;
      const dy = hex.y - label.idealY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        minDist = dist;
        nearestHex = hex;
      }
    }

    if (nearestHex) {
      snappedLabels.push({
        ...label,
        x: nearestHex.x,
        y: nearestHex.y,
        hexagonId: nearestHex.id,
      });
      newUsedIds.add(nearestHex.id);
    } else {
      // Fallback to original position if no hexagon found
      snappedLabels.push({
        id: label.id,
        name: label.name,
        x: label.x,
        y: label.y,
        hexagonId: label.hexagonId,
        locationX: label.locationX,
        locationY: label.locationY,
        color: label.color,
        connectionPointX: label.connectionPointX,
        connectionPointY: label.connectionPointY,
        photoName: label.photoName,
      });
    }
  }

  return snappedLabels;
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
  markerColors: string[],
  routes: Array<{ geometry?: { coordinates?: [number, number][] } }> = []
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

  // Minimum distance between labels to prevent overlap
  // Account for label width and some padding
  const minLabelDistance = LABEL_WIDTH + 20;

  for (let i = 0; i < projectedLocations.length; i++) {
    const location = projectedLocations[i];
    const colorIndex = location.colorIndex ?? i;
    const color = markerColors[colorIndex % markerColors.length];

    // Find nearest available hexagon (preferring edge positions, avoiding overlap)
    const nearestHex = findNearestHexagon(
      location.screenX,
      location.screenY,
      availableHexagons,
      usedHexagonIds,
      viewportWidth,
      viewportHeight,
      assignments,
      minLabelDistance
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

  // Convert routes to screen-space line segments
  const routeSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const route of routes) {
    if (!route.geometry?.coordinates) continue;

    const coords = route.geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const start = mapProjection(coords[i][0], coords[i][1]);
      const end = mapProjection(coords[i + 1][0], coords[i + 1][1]);

      if (start && end) {
        routeSegments.push({
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
        });
      }
    }
  }

  // Apply force simulation to find ideal label positions
  const relaxedLabels = applyForceSimulation(assignments, viewportWidth, viewportHeight, routeSegments);

  // Snap relaxed positions back to hexagon centers
  const snappedLabels = snapLabelsToHexagons(relaxedLabels, hexagons, new Set());

  return {
    labels: snappedLabels,
    hexagons,
    hexSize,
    availableHexagons,
    usedHexagonIds,
  };
}
