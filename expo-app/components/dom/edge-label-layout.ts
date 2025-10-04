export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  colorIndex?: number;
  photoName?: string;
}

export interface EdgePosition {
  id: string;
  x: number;
  y: number;
  edge: 'top' | 'right' | 'bottom' | 'left';
}

export interface EdgeLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  edgePositionId: string;
  locationX: number;
  locationY: number;
  color: string;
  photoName?: string;
  edge: 'top' | 'right' | 'bottom' | 'left';
}

const LABEL_WIDTH = 120;
const LABEL_HEIGHT = 32;
const EDGE_MARGIN = 20; // Distance from viewport edge

// Calculate distance from point to line segment
function distanceToLineSegment(
  px: number, py: number, // Point
  x1: number, y1: number, x2: number, y2: number // Line segment
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    const dpx = px - x1;
    const dpy = py - y1;
    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const dpx = px - closestX;
  const dpy = py - closestY;
  return Math.sqrt(dpx * dpx + dpy * dpy);
}

// Check if two line segments intersect
function doLinesIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < 0.0001) return false;

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

// Generate edge positions (points along viewport edges)
function generateEdgePositions(
  viewportWidth: number,
  viewportHeight: number,
  spacing: number = 80 // Space between edge positions
): EdgePosition[] {
  const positions: EdgePosition[] = [];
  let id = 0;

  // Top edge
  for (let x = EDGE_MARGIN + LABEL_WIDTH / 2; x < viewportWidth - EDGE_MARGIN - LABEL_WIDTH / 2; x += spacing) {
    positions.push({
      id: `edge-${id++}`,
      x,
      y: EDGE_MARGIN + LABEL_HEIGHT / 2,
      edge: 'top',
    });
  }

  // Right edge
  for (let y = EDGE_MARGIN + LABEL_HEIGHT / 2; y < viewportHeight - EDGE_MARGIN - LABEL_HEIGHT / 2; y += spacing) {
    positions.push({
      id: `edge-${id++}`,
      x: viewportWidth - EDGE_MARGIN - LABEL_WIDTH / 2,
      y,
      edge: 'right',
    });
  }

  // Bottom edge
  for (let x = viewportWidth - EDGE_MARGIN - LABEL_WIDTH / 2; x > EDGE_MARGIN + LABEL_WIDTH / 2; x -= spacing) {
    positions.push({
      id: `edge-${id++}`,
      x,
      y: viewportHeight - EDGE_MARGIN - LABEL_HEIGHT / 2,
      edge: 'bottom',
    });
  }

  // Left edge
  for (let y = viewportHeight - EDGE_MARGIN - LABEL_HEIGHT / 2; y > EDGE_MARGIN + LABEL_HEIGHT / 2; y -= spacing) {
    positions.push({
      id: `edge-${id++}`,
      x: EDGE_MARGIN + LABEL_WIDTH / 2,
      y,
      edge: 'left',
    });
  }

  return positions;
}

// Apply force simulation to find optimal positions
function applyForceSimulation(
  labels: EdgeLabel[],
  viewportWidth: number,
  viewportHeight: number,
  routeSegments: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  iterations: number = 50
): Array<EdgeLabel & { idealX: number; idealY: number }> {
  const labelPositions = labels.map(label => ({ x: label.x, y: label.y }));

  const minDistance = LABEL_WIDTH + 40; // Minimum distance between labels
  const routeRepulsionDistance = 60; // Minimum distance from routes
  const edgeAttractionStrength = 2.0; // Strong attraction to keep labels on edges

  for (let iter = 0; iter < iterations; iter++) {
    const forces = labelPositions.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];

      // Force 1: Strong attraction to assigned edge position
      const edgeX = label.x;
      const edgeY = label.y;
      const dxEdge = edgeX - labelPositions[i].x;
      const dyEdge = edgeY - labelPositions[i].y;
      forces[i].x += dxEdge * edgeAttractionStrength;
      forces[i].y += dyEdge * edgeAttractionStrength;

      // Force 2: Moderate attraction to marker location (to stay nearby)
      const dxTarget = label.locationX - labelPositions[i].x;
      const dyTarget = label.locationY - labelPositions[i].y;
      const distTarget = Math.sqrt(dxTarget * dxTarget + dyTarget * dyTarget);
      if (distTarget > 0) {
        forces[i].x += (dxTarget / distTarget) * 0.3;
        forces[i].y += (dyTarget / distTarget) * 0.3;
      }

      // Force 3: Repulsion from other labels
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

      // Force 4: Avoid line crossings
      for (let j = 0; j < labels.length; j++) {
        if (i === j) continue;

        if (doLinesIntersect(
          label.locationX, label.locationY, labelPositions[i].x, labelPositions[i].y,
          labels[j].locationX, labels[j].locationY, labelPositions[j].x, labelPositions[j].y
        )) {
          const dx = labelPositions[i].x - label.locationX;
          const dy = labelPositions[i].y - label.locationY;
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
          const dx = segment.x2 - segment.x1;
          const dy = segment.y2 - segment.y1;
          const len = Math.sqrt(dx * dx + dy * dy);

          if (len > 0) {
            const t = Math.max(0, Math.min(1,
              ((labelPositions[i].x - segment.x1) * dx + (labelPositions[i].y - segment.y1) * dy) / (len * len)
            ));
            const closestX = segment.x1 + t * dx;
            const closestY = segment.y1 + t * dy;

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

  return labels.map((label, i) => ({
    ...label,
    idealX: labelPositions[i].x,
    idealY: labelPositions[i].y,
  }));
}

// Snap ideal positions to nearest available edge positions
function snapLabelsToEdges(
  labels: Array<EdgeLabel & { idealX: number; idealY: number }>,
  edgePositions: EdgePosition[],
  usedEdgeIds: Set<string>
): EdgeLabel[] {
  const snappedLabels: EdgeLabel[] = [];
  const newUsedIds = new Set(usedEdgeIds);
  const minEdgeDistance = LABEL_WIDTH + 20;

  for (const label of labels) {
    let nearestEdge: EdgePosition | null = null;
    let minDist = Infinity;

    for (const edgePos of edgePositions) {
      // Skip if already used
      if (newUsedIds.has(edgePos.id) && edgePos.id !== label.edgePositionId) continue;

      // Skip if too close to already-snapped labels
      let tooClose = false;
      for (const snapped of snappedLabels) {
        const dx = edgePos.x - snapped.x;
        const dy = edgePos.y - snapped.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minEdgeDistance) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const dx = edgePos.x - label.idealX;
      const dy = edgePos.y - label.idealY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        minDist = dist;
        nearestEdge = edgePos;
      }
    }

    if (nearestEdge) {
      snappedLabels.push({
        ...label,
        x: nearestEdge.x,
        y: nearestEdge.y,
        edgePositionId: nearestEdge.id,
        edge: nearestEdge.edge,
      });
      newUsedIds.add(nearestEdge.id);
    } else {
      // Fallback to current position
      snappedLabels.push(label);
    }
  }

  return snappedLabels;
}

export interface EdgeGridData {
  labels: EdgeLabel[];
  edgePositions: EdgePosition[];
  availableEdgePositions: EdgePosition[];
  usedEdgeIds: Set<string>;
}

export function calculateEdgeLabels(
  locations: Location[],
  mapProjection: (lng: number, lat: number) => { x: number; y: number } | null,
  viewportWidth: number,
  viewportHeight: number,
  markerColors: string[],
  routes: Array<{ geometry?: { coordinates?: [number, number][] } }> = []
): EdgeGridData {
  if (locations.length === 0) {
    return {
      labels: [],
      edgePositions: [],
      availableEdgePositions: [],
      usedEdgeIds: new Set(),
    };
  }

  // Generate edge positions
  const edgePositions = generateEdgePositions(viewportWidth, viewportHeight);

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

  // Initial assignment: find nearest edge position for each location
  const initialAssignments: EdgeLabel[] = [];
  const usedEdgeIds = new Set<string>();

  for (let i = 0; i < projectedLocations.length; i++) {
    const location = projectedLocations[i];
    const colorIndex = location.colorIndex ?? i;
    const color = markerColors[colorIndex % markerColors.length];

    // Find nearest available edge position
    let nearestEdge: EdgePosition | null = null;
    let minDist = Infinity;

    for (const edgePos of edgePositions) {
      if (usedEdgeIds.has(edgePos.id)) continue;

      const dx = edgePos.x - location.screenX;
      const dy = edgePos.y - location.screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist) {
        minDist = dist;
        nearestEdge = edgePos;
      }
    }

    if (nearestEdge) {
      initialAssignments.push({
        id: location.id,
        name: location.name,
        x: nearestEdge.x,
        y: nearestEdge.y,
        edgePositionId: nearestEdge.id,
        locationX: location.screenX,
        locationY: location.screenY,
        color,
        photoName: location.photoName,
        edge: nearestEdge.edge,
      });
      usedEdgeIds.add(nearestEdge.id);
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

  // Apply force simulation to optimize positions
  const relaxedLabels = applyForceSimulation(
    initialAssignments,
    viewportWidth,
    viewportHeight,
    routeSegments
  );

  // Snap to nearest edge positions
  const snappedLabels = snapLabelsToEdges(relaxedLabels, edgePositions, new Set());

  return {
    labels: snappedLabels,
    edgePositions,
    availableEdgePositions: edgePositions.filter(pos => !usedEdgeIds.has(pos.id)),
    usedEdgeIds,
  };
}
