import { useEffect, useRef, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Map } from 'mapbox-gl';

interface RouteData {
  id: string;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  colorIndex: number;
  waypoints?: Array<{ lat: number; lng: number }>;
  fromLocationId?: string;
  toLocationId?: string;
}

interface MapboxRouteLayerProps {
  map: Map | null;
  routes: RouteData[];
  onWaypointUpdate?: (routeId: string, waypoints: Array<{ lat: number; lng: number }>) => void;
  editingEnabled?: boolean;
}

// Color array matching the main map
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

// Proximity threshold in pixels
const PROXIMITY_THRESHOLD_PX = 30;

export function MapboxRouteLayer({
  map,
  routes,
  onWaypointUpdate,
  editingEnabled = true
}: MapboxRouteLayerProps) {
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [nearestPoint, setNearestPoint] = useState<{ lng: number; lat: number } | null>(null);
  const [draggingWaypoint, setDraggingWaypoint] = useState<{
    routeId: string;
    waypointIndex: number;
    originalPosition: { lat: number; lng: number };
  } | null>(null);

  // Track mouse position for proximity detection
  const handleMouseMove = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (!map || !editingEnabled || draggingWaypoint) return;

    const point = e.point;
    const features = map.queryRenderedFeatures(point, {
      layers: routes.map(r => `route-${r.id}`)
    });

    if (features.length > 0) {
      // Find nearest point on the route
      const routeFeature = features[0];
      const routeId = routeFeature.properties?.routeId;

      if (routeId) {
        setHoveredRouteId(routeId);

        // Calculate nearest point on line
        const coordinates = routeFeature.geometry.type === 'LineString'
          ? routeFeature.geometry.coordinates
          : [];

        const nearest = findNearestPointOnRoute(
          [e.lngLat.lng, e.lngLat.lat],
          coordinates as [number, number][]
        );

        if (nearest && nearest.distance < getPixelThreshold(map)) {
          setNearestPoint({ lng: nearest.point[0], lat: nearest.point[1] });
          map.getCanvas().style.cursor = 'pointer';
        } else {
          setNearestPoint(null);
          map.getCanvas().style.cursor = '';
        }
      }
    } else {
      setHoveredRouteId(null);
      setNearestPoint(null);
      map.getCanvas().style.cursor = '';
    }
  }, [map, editingEnabled, routes, draggingWaypoint]);

  // Handle click to add waypoint
  const handleClick = useCallback((e: mapboxgl.MapMouseEvent) => {
    if (!map || !editingEnabled || !nearestPoint || !hoveredRouteId) return;

    const route = routes.find(r => r.id === hoveredRouteId);
    if (!route || !onWaypointUpdate) return;

    // Add new waypoint
    const newWaypoint = { lat: nearestPoint.lat, lng: nearestPoint.lng };
    const existingWaypoints = route.waypoints || [];

    // Find the correct position to insert the waypoint
    const insertIndex = findWaypointInsertIndex(
      newWaypoint,
      route.geometry.coordinates as [number, number][],
      existingWaypoints
    );

    const updatedWaypoints = [...existingWaypoints];
    updatedWaypoints.splice(insertIndex, 0, newWaypoint);

    onWaypointUpdate(route.id, updatedWaypoints);
  }, [map, editingEnabled, nearestPoint, hoveredRouteId, routes, onWaypointUpdate]);

  // Setup map layers and event handlers
  useEffect(() => {
    if (!map) return;

    // Wait for map to be loaded
    const setupLayers = () => {
      // Remove existing layers and sources
      routes.forEach(route => {
        const routeLayerId = `route-${route.id}`;
        const waypointLayerId = `waypoints-${route.id}`;
        const proximityLayerId = `proximity-${route.id}`;

        if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
        if (map.getLayer(waypointLayerId)) map.removeLayer(waypointLayerId);
        if (map.getLayer(proximityLayerId)) map.removeLayer(proximityLayerId);
        if (map.getSource(routeLayerId)) map.removeSource(routeLayerId);
        if (map.getSource(waypointLayerId)) map.removeSource(waypointLayerId);
        if (map.getSource(proximityLayerId)) map.removeSource(proximityLayerId);
      });

      // Add route layers
      routes.forEach(route => {
        const color = COLORS[route.colorIndex % COLORS.length];
        const routeLayerId = `route-${route.id}`;
        const waypointLayerId = `waypoints-${route.id}`;

        // Add route line source and layer
        map.addSource(routeLayerId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: { routeId: route.id },
            geometry: route.geometry
          }
        });

        map.addLayer({
          id: routeLayerId,
          type: 'line',
          source: routeLayerId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': color,
            'line-width': [
              'case',
              ['==', route.id, hoveredRouteId],
              6,
              4
            ],
            'line-opacity': 0.8
          }
        });

        // Add waypoint markers if they exist
        if (route.waypoints && route.waypoints.length > 0) {
          const waypointFeatures = route.waypoints.map((wp, index) => ({
            type: 'Feature' as const,
            properties: {
              routeId: route.id,
              waypointIndex: index
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [wp.lng, wp.lat]
            }
          }));

          map.addSource(waypointLayerId, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: waypointFeatures
            }
          });

          map.addLayer({
            id: waypointLayerId,
            type: 'circle',
            source: waypointLayerId,
            paint: {
              'circle-radius': 8,
              'circle-color': '#FFC800', // Orange for waypoints
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2
            }
          });
        }
      });

      // Add proximity indicator layer
      if (nearestPoint && hoveredRouteId) {
        const proximityLayerId = `proximity-indicator`;

        if (map.getSource(proximityLayerId)) {
          (map.getSource(proximityLayerId) as mapboxgl.GeoJSONSource).setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: [nearestPoint.lng, nearestPoint.lat]
            }
          });
        } else {
          map.addSource(proximityLayerId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: [nearestPoint.lng, nearestPoint.lat]
              }
            }
          });

          map.addLayer({
            id: proximityLayerId,
            type: 'circle',
            source: proximityLayerId,
            paint: {
              'circle-radius': 10,
              'circle-color': '#2ECC71', // Green for proximity
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
              'circle-opacity': 0.9
            }
          });
        }
      } else {
        // Remove proximity indicator if not hovering
        if (map.getLayer('proximity-indicator')) {
          map.removeLayer('proximity-indicator');
        }
        if (map.getSource('proximity-indicator')) {
          map.removeSource('proximity-indicator');
        }
      }
    };

    if (map.loaded()) {
      setupLayers();
    } else {
      map.once('load', setupLayers);
    }

    // Add event listeners
    map.on('mousemove', handleMouseMove);
    map.on('click', handleClick);

    // Cleanup
    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('click', handleClick);

      // Remove all layers and sources
      routes.forEach(route => {
        const routeLayerId = `route-${route.id}`;
        const waypointLayerId = `waypoints-${route.id}`;

        if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
        if (map.getLayer(waypointLayerId)) map.removeLayer(waypointLayerId);
        if (map.getSource(routeLayerId)) map.removeSource(routeLayerId);
        if (map.getSource(waypointLayerId)) map.removeSource(waypointLayerId);
      });

      if (map.getLayer('proximity-indicator')) map.removeLayer('proximity-indicator');
      if (map.getSource('proximity-indicator')) map.removeSource('proximity-indicator');
    };
  }, [map, routes, handleMouseMove, handleClick, hoveredRouteId, nearestPoint]);

  return null; // This component doesn't render anything directly
}

// Helper function to find the nearest point on a route
function findNearestPointOnRoute(
  point: [number, number],
  routeCoordinates: [number, number][]
): { point: [number, number]; distance: number; segmentIndex: number } | null {
  if (!routeCoordinates || routeCoordinates.length < 2) return null;

  let minDistance = Infinity;
  let nearestPoint: [number, number] = routeCoordinates[0];
  let nearestSegmentIndex = 0;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const nearPoint = nearestPointOnSegment(
      point,
      routeCoordinates[i],
      routeCoordinates[i + 1]
    );
    const dist = geoDistance(point, nearPoint);

    if (dist < minDistance) {
      minDistance = dist;
      nearestPoint = nearPoint;
      nearestSegmentIndex = i;
    }
  }

  return {
    point: nearestPoint,
    distance: minDistance,
    segmentIndex: nearestSegmentIndex
  };
}

// Find the nearest point on a line segment
function nearestPointOnSegment(
  point: [number, number],
  segStart: [number, number],
  segEnd: [number, number]
): [number, number] {
  const dx = segEnd[0] - segStart[0];
  const dy = segEnd[1] - segStart[1];
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return segStart;

  const t = Math.max(0, Math.min(1,
    ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / lengthSquared
  ));

  return [
    segStart[0] + t * dx,
    segStart[1] + t * dy
  ];
}

// Calculate distance between two geographic points
function geoDistance(p1: [number, number], p2: [number, number]): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Get pixel threshold based on current zoom level
function getPixelThreshold(map: Map): number {
  const zoom = map.getZoom();
  // Convert pixel threshold to geographic units based on zoom
  return PROXIMITY_THRESHOLD_PX / Math.pow(2, zoom + 8);
}

// Find the correct index to insert a waypoint
function findWaypointInsertIndex(
  newWaypoint: { lat: number; lng: number },
  routeCoordinates: [number, number][],
  existingWaypoints: Array<{ lat: number; lng: number }>
): number {
  // Find which segment the new waypoint is closest to
  const nearestInfo = findNearestPointOnRoute(
    [newWaypoint.lng, newWaypoint.lat],
    routeCoordinates
  );

  if (!nearestInfo) return existingWaypoints.length;

  // Calculate the progress along the route (0 to 1)
  let totalDistance = 0;
  let distanceToPoint = 0;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const segmentDistance = geoDistance(routeCoordinates[i], routeCoordinates[i + 1]);

    if (i < nearestInfo.segmentIndex) {
      distanceToPoint += segmentDistance;
    } else if (i === nearestInfo.segmentIndex) {
      const segmentProgress = geoDistance(routeCoordinates[i], nearestInfo.point) / segmentDistance;
      distanceToPoint += segmentDistance * segmentProgress;
    }

    totalDistance += segmentDistance;
  }

  const progress = distanceToPoint / totalDistance;

  // Find where to insert based on progress
  let insertIndex = 0;
  for (let i = 0; i < existingWaypoints.length; i++) {
    const wpProgress = getWaypointProgress(existingWaypoints[i], routeCoordinates);
    if (wpProgress > progress) {
      break;
    }
    insertIndex++;
  }

  return insertIndex;
}

// Calculate waypoint progress along route
function getWaypointProgress(
  waypoint: { lat: number; lng: number },
  routeCoordinates: [number, number][]
): number {
  const nearestInfo = findNearestPointOnRoute(
    [waypoint.lng, waypoint.lat],
    routeCoordinates
  );

  if (!nearestInfo) return 0;

  let totalDistance = 0;
  let distanceToPoint = 0;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const segmentDistance = geoDistance(routeCoordinates[i], routeCoordinates[i + 1]);

    if (i < nearestInfo.segmentIndex) {
      distanceToPoint += segmentDistance;
    } else if (i === nearestInfo.segmentIndex) {
      const segmentProgress = geoDistance(routeCoordinates[i], nearestInfo.point) / segmentDistance;
      distanceToPoint += segmentDistance * segmentProgress;
    }

    totalDistance += segmentDistance;
  }

  return distanceToPoint / totalDistance;
}