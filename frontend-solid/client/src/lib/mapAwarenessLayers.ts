import mapboxgl from 'mapbox-gl';

// Viewport corners: array of 4 [lng, lat] coordinates
// Order: top-left, top-right, bottom-right, bottom-left
export type ViewportCorners = Array<[number, number]>;

// Store current corners and animation state per user
const currentCornersPerUser = new Map<string, ViewportCorners>();
const animationFramesPerUser = new Map<string, number>();

// Lerp function for smooth interpolation of corners
function lerpCorners(
  from: ViewportCorners,
  to: ViewportCorners,
  t: number
): ViewportCorners {
  return from.map((fromCorner, i) => [
    fromCorner[0] + (to[i][0] - fromCorner[0]) * t,
    fromCorner[1] + (to[i][1] - fromCorner[1]) * t
  ]) as ViewportCorners;
}

// Easing function for smooth animation
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Convert viewport corners to GeoJSON Polygon feature
function cornersToGeoJSON(
  corners: ViewportCorners,
  userName: string,
  userColor: string,
  userId: string
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        corners[0],  // top-left
        corners[1],  // top-right
        corners[2],  // bottom-right
        corners[3],  // bottom-left
        corners[0]   // close the ring
      ]]
    },
    properties: {
      userName,
      userColor,
      userId
    }
  };
}

// Get source and layer IDs for a user
export function getLayerIds(userId: string) {
  return {
    source: `awareness-${userId}`,
    fillLayer: `awareness-fill-${userId}`,
    lineLayer: `awareness-line-${userId}`,
    labelLayer: `awareness-label-${userId}`
  };
}

// Add awareness layers for a user viewing fullscreen
export function addAwarenessLayer(
  map: mapboxgl.Map,
  userId: string,
  corners: ViewportCorners,
  color: string,
  userName: string
): void {
  // Check if map style is loaded before manipulating layers
  if (!map.isStyleLoaded()) {
    return;
  }

  const ids = getLayerIds(userId);

  // Remove existing layers if they exist
  removeAwarenessLayer(map, userId);

  // Create GeoJSON feature
  const feature = cornersToGeoJSON(corners, userName, color, userId);

  // Add source
  map.addSource(ids.source, {
    type: 'geojson',
    data: feature
  });

  // Add fill layer (semi-transparent)
  map.addLayer({
    id: ids.fillLayer,
    type: 'fill',
    source: ids.source,
    paint: {
      'fill-color': color,
      'fill-opacity': 0.15
    }
  });

  // Add line layer (border)
  map.addLayer({
    id: ids.lineLayer,
    type: 'line',
    source: ids.source,
    paint: {
      'line-color': color,
      'line-width': 3,
      'line-opacity': 0.8
    }
  });

  // Add label layer
  map.addLayer({
    id: ids.labelLayer,
    type: 'symbol',
    source: ids.source,
    layout: {
      'text-field': `${userName} (viewing)`,
      'text-anchor': 'top-left',
      'text-offset': [0.5, 0.5],
      'text-size': 12,
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold']
    },
    paint: {
      'text-color': color,
      'text-halo-color': '#ffffff',
      'text-halo-width': 2
    }
  });

  // Track initial corners for animation
  currentCornersPerUser.set(userId, corners);

  console.log('[MapAwarenessLayers] Added awareness layer for user:', userId, userName);
}

// Animate corners update
function animateCornersUpdate(
  map: mapboxgl.Map,
  userId: string,
  targetCorners: ViewportCorners,
  color: string,
  userName: string,
  duration: number = 300
): void {
  const ids = getLayerIds(userId);
  const source = map.getSource(ids.source) as mapboxgl.GeoJSONSource;
  if (!source) return;

  // Cancel any ongoing animation
  const existingFrame = animationFramesPerUser.get(userId);
  if (existingFrame) {
    cancelAnimationFrame(existingFrame);
  }

  const startCorners = currentCornersPerUser.get(userId) || targetCorners;
  const startTime = performance.now();

  function animate() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);

    const interpolatedCorners = lerpCorners(startCorners, targetCorners, easedProgress);
    const feature = cornersToGeoJSON(interpolatedCorners, userName, color, userId);
    source.setData(feature);

    if (progress < 1) {
      const frameId = requestAnimationFrame(animate);
      animationFramesPerUser.set(userId, frameId);
    } else {
      currentCornersPerUser.set(userId, targetCorners);
      animationFramesPerUser.delete(userId);
    }
  }

  animate();
}

// Update existing awareness layer with new corners
export function updateAwarenessLayer(
  map: mapboxgl.Map,
  userId: string,
  corners: ViewportCorners,
  color: string,
  userName: string
): void {
  // Check if map style is loaded before manipulating layers
  if (!map.isStyleLoaded()) {
    return;
  }

  const ids = getLayerIds(userId);
  const source = map.getSource(ids.source) as mapboxgl.GeoJSONSource | undefined;

  if (source) {
    // Animate to new corners
    animateCornersUpdate(map, userId, corners, color, userName);
    console.log('[MapAwarenessLayers] Animating awareness layer for user:', userId);
  } else {
    // Source doesn't exist, create it (no animation for initial appearance)
    currentCornersPerUser.set(userId, corners);
    addAwarenessLayer(map, userId, corners, color, userName);
  }
}

// Remove awareness layers for a user
export function removeAwarenessLayer(map: mapboxgl.Map, userId: string): void {
  // Cancel any ongoing animation
  const frameId = animationFramesPerUser.get(userId);
  if (frameId) {
    cancelAnimationFrame(frameId);
    animationFramesPerUser.delete(userId);
  }
  currentCornersPerUser.delete(userId);

  // Check if map style is loaded before manipulating layers
  if (!map.isStyleLoaded()) {
    return;
  }

  const ids = getLayerIds(userId);

  try {
    // Remove layers first (order matters)
    if (map.getLayer(ids.labelLayer)) {
      map.removeLayer(ids.labelLayer);
    }
    if (map.getLayer(ids.lineLayer)) {
      map.removeLayer(ids.lineLayer);
    }
    if (map.getLayer(ids.fillLayer)) {
      map.removeLayer(ids.fillLayer);
    }

    // Then remove source
    if (map.getSource(ids.source)) {
      map.removeSource(ids.source);
      console.log('[MapAwarenessLayers] Removed awareness layer for user:', userId);
    }
  } catch (e) {
    // Ignore errors when map is being destroyed
    console.warn('[MapAwarenessLayers] Error removing layer:', e);
  }
}

// Remove all awareness layers from a map
export function removeAllAwarenessLayers(map: mapboxgl.Map): void {
  const style = map.getStyle();
  if (!style || !style.layers) return;

  // Find all awareness layers
  const awarenessLayers = style.layers.filter(
    layer => layer.id.startsWith('awareness-')
  );

  // Get unique user IDs from layer names
  const userIds = new Set<string>();
  awarenessLayers.forEach(layer => {
    // Extract userId from "awareness-fill-{userId}" or "awareness-line-{userId}"
    const match = layer.id.match(/^awareness-(?:fill|line|label)-(.+)$/);
    if (match) {
      userIds.add(match[1]);
    }
  });

  // Remove each user's layers
  userIds.forEach(userId => {
    removeAwarenessLayer(map, userId);
  });
}

// Check if awareness layer exists for a user
export function hasAwarenessLayer(map: mapboxgl.Map, userId: string): boolean {
  if (!map.isStyleLoaded()) {
    return false;
  }
  const ids = getLayerIds(userId);
  return !!map.getSource(ids.source);
}

// Get viewport corners from a map instance
// Accounts for pitch and bearing by unprojecting screen corners
export function getViewportCorners(map: mapboxgl.Map): ViewportCorners {
  const canvas = map.getCanvas();
  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;

  const topLeft = map.unproject([0, 0]);
  const topRight = map.unproject([width, 0]);
  const bottomRight = map.unproject([width, height]);
  const bottomLeft = map.unproject([0, height]);

  return [
    [topLeft.lng, topLeft.lat],
    [topRight.lng, topRight.lat],
    [bottomRight.lng, bottomRight.lat],
    [bottomLeft.lng, bottomLeft.lat]
  ];
}
