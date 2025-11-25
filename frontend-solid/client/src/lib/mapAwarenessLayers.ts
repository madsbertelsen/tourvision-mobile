import mapboxgl from 'mapbox-gl';

interface AwarenessBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// Store current bounds and animation state per user
const currentBoundsPerUser = new Map<string, AwarenessBounds>();
const animationFramesPerUser = new Map<string, number>();

// Lerp function for smooth interpolation
function lerpBounds(
  from: AwarenessBounds,
  to: AwarenessBounds,
  t: number
): AwarenessBounds {
  return {
    north: from.north + (to.north - from.north) * t,
    south: from.south + (to.south - from.south) * t,
    east: from.east + (to.east - from.east) * t,
    west: from.west + (to.west - from.west) * t
  };
}

// Easing function for smooth animation
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Convert bounds to GeoJSON Polygon feature
function boundsToGeoJSON(
  bounds: AwarenessBounds,
  userName: string,
  userColor: string
): GeoJSON.Feature<GeoJSON.Polygon> {
  const { north, south, east, west } = bounds;

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north]  // close the ring
      ]]
    },
    properties: {
      userName,
      userColor
    }
  };
}

// Get source and layer IDs for a user
function getLayerIds(userId: string) {
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
  bounds: AwarenessBounds,
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
  const feature = boundsToGeoJSON(bounds, userName, color);

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

  // Track initial bounds for animation
  currentBoundsPerUser.set(userId, bounds);

  console.log('[MapAwarenessLayers] Added awareness layer for user:', userId, userName);
}

// Animate bounds update
function animateBoundsUpdate(
  map: mapboxgl.Map,
  userId: string,
  targetBounds: AwarenessBounds,
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

  const startBounds = currentBoundsPerUser.get(userId) || targetBounds;
  const startTime = performance.now();

  function animate() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easeOutCubic(progress);

    const interpolatedBounds = lerpBounds(startBounds, targetBounds, easedProgress);
    const feature = boundsToGeoJSON(interpolatedBounds, userName, color);
    source.setData(feature);

    if (progress < 1) {
      const frameId = requestAnimationFrame(animate);
      animationFramesPerUser.set(userId, frameId);
    } else {
      currentBoundsPerUser.set(userId, targetBounds);
      animationFramesPerUser.delete(userId);
    }
  }

  animate();
}

// Update existing awareness layer bounds
export function updateAwarenessLayer(
  map: mapboxgl.Map,
  userId: string,
  bounds: AwarenessBounds,
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
    // Animate to new bounds
    animateBoundsUpdate(map, userId, bounds, color, userName);
    console.log('[MapAwarenessLayers] Animating awareness layer for user:', userId);
  } else {
    // Source doesn't exist, create it (no animation for initial appearance)
    currentBoundsPerUser.set(userId, bounds);
    addAwarenessLayer(map, userId, bounds, color, userName);
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
  currentBoundsPerUser.delete(userId);

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
