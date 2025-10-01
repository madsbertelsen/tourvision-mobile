export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  colorIndex?: number;
}

export interface EdgeLabel {
  id: string;
  name: string;
  x: number;
  y: number;
  edge: 'top' | 'right' | 'bottom' | 'left';
  color: string;
  locationX: number;
  locationY: number;
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const LABEL_WIDTH = 120;
const LABEL_HEIGHT = 32;
const EDGE_PADDING = 8;
const MIN_LABEL_SPACING = 8;

// Helper to check if two boxes overlap
function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

// Get edge position based on quadrant
function getEdgeForLocation(
  x: number,
  y: number,
  width: number,
  height: number
): 'top' | 'right' | 'bottom' | 'left' {
  const centerX = width / 2;
  const centerY = height / 2;

  const dx = x - centerX;
  const dy = y - centerY;

  // Determine which edge is closest
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX > absY) {
    return dx > 0 ? 'right' : 'left';
  } else {
    return dy > 0 ? 'bottom' : 'top';
  }
}

// Calculate initial edge positions
function getInitialEdgePosition(
  edge: 'top' | 'right' | 'bottom' | 'left',
  locationX: number,
  locationY: number,
  width: number,
  height: number
): { x: number; y: number } {
  switch (edge) {
    case 'top':
      return {
        x: Math.max(LABEL_WIDTH / 2, Math.min(width - LABEL_WIDTH / 2, locationX)),
        y: EDGE_PADDING + LABEL_HEIGHT / 2,
      };
    case 'bottom':
      return {
        x: Math.max(LABEL_WIDTH / 2, Math.min(width - LABEL_WIDTH / 2, locationX)),
        y: height - EDGE_PADDING - LABEL_HEIGHT / 2,
      };
    case 'left':
      return {
        x: EDGE_PADDING + LABEL_WIDTH / 2,
        y: Math.max(LABEL_HEIGHT / 2, Math.min(height - LABEL_HEIGHT / 2, locationY)),
      };
    case 'right':
      return {
        x: width - EDGE_PADDING - LABEL_WIDTH / 2,
        y: Math.max(LABEL_HEIGHT / 2, Math.min(height - LABEL_HEIGHT / 2, locationY)),
      };
  }
}

// Simple force-directed layout to resolve overlaps
function resolveOverlaps(
  labels: Array<EdgeLabel>,
  width: number,
  height: number,
  iterations: number = 50
): Array<EdgeLabel> {
  const result = labels.map(label => ({ ...label }));

  for (let iter = 0; iter < iterations; iter++) {
    let hasOverlap = false;

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];

        // Only check labels on the same edge
        if (a.edge !== b.edge) continue;

        const boxA: LabelBox = {
          x: a.x - LABEL_WIDTH / 2,
          y: a.y - LABEL_HEIGHT / 2,
          width: LABEL_WIDTH,
          height: LABEL_HEIGHT,
        };

        const boxB: LabelBox = {
          x: b.x - LABEL_WIDTH / 2,
          y: b.y - LABEL_HEIGHT / 2,
          width: LABEL_WIDTH,
          height: LABEL_HEIGHT,
        };

        if (boxesOverlap(boxA, boxB)) {
          hasOverlap = true;

          // Calculate repulsion force
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (LABEL_WIDTH + MIN_LABEL_SPACING - distance) / 2;

          // Apply force based on edge direction
          if (a.edge === 'top' || a.edge === 'bottom') {
            // Move horizontally
            const moveX = (dx / distance) * force;
            a.x -= moveX;
            b.x += moveX;

            // Constrain to edge
            a.x = Math.max(LABEL_WIDTH / 2, Math.min(width - LABEL_WIDTH / 2, a.x));
            b.x = Math.max(LABEL_WIDTH / 2, Math.min(width - LABEL_WIDTH / 2, b.x));
          } else {
            // Move vertically
            const moveY = (dy / distance) * force;
            a.y -= moveY;
            b.y += moveY;

            // Constrain to edge
            a.y = Math.max(LABEL_HEIGHT / 2, Math.min(height - LABEL_HEIGHT / 2, a.y));
            b.y = Math.max(LABEL_HEIGHT / 2, Math.min(height - LABEL_HEIGHT / 2, b.y));
          }
        }
      }
    }

    // If no overlaps, we can stop early
    if (!hasOverlap) break;
  }

  return result;
}

export function calculateEdgeLabels(
  locations: Location[],
  mapProjection: (lng: number, lat: number) => { x: number; y: number } | null,
  viewportWidth: number,
  viewportHeight: number,
  markerColors: string[]
): EdgeLabel[] {
  if (locations.length === 0) return [];

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

  // Assign initial edge positions
  const initialLabels: EdgeLabel[] = projectedLocations.map((location, index) => {
    const edge = getEdgeForLocation(
      location.screenX,
      location.screenY,
      viewportWidth,
      viewportHeight
    );

    const position = getInitialEdgePosition(
      edge,
      location.screenX,
      location.screenY,
      viewportWidth,
      viewportHeight
    );

    const colorIndex = location.colorIndex ?? index;
    const color = markerColors[colorIndex % markerColors.length];

    return {
      id: location.id,
      name: location.name,
      x: position.x,
      y: position.y,
      edge,
      color,
      locationX: location.screenX,
      locationY: location.screenY,
    };
  });

  // Resolve overlaps using force-directed layout
  return resolveOverlaps(initialLabels, viewportWidth, viewportHeight);
}
