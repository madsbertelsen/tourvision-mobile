import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Source, Layer } from 'react-map-gl/mapbox';
import type { LayerProps } from 'react-map-gl/mapbox';

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

interface MapboxRouteLayersProps {
  routes: RouteData[];
  onWaypointUpdate?: (routeId: string, waypoints: Array<{ lat: number; lng: number }>) => void;
  editingEnabled?: boolean;
  cursorPosition?: [number, number] | null;
  onProximityPoint?: (point: [number, number] | null, routeIndex: number | null) => void;
}

// Color array matching the main map
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

// Proximity threshold in pixels
const PROXIMITY_THRESHOLD_PX = 30;

export function MapboxRouteLayers({
  routes,
  onWaypointUpdate,
  editingEnabled = true,
  cursorPosition,
  onProximityPoint
}: MapboxRouteLayersProps) {
  const [nearestPoint, setNearestPoint] = useState<{ lng: number; lat: number; routeIndex: number } | null>(null);

  console.log('[MapboxRouteLayers] Rendering with routes:', routes);

  // Calculate proximity when cursor moves
  useEffect(() => {
    if (!cursorPosition || !editingEnabled || routes.length === 0) {
      setNearestPoint(null);
      if (onProximityPoint) {
        onProximityPoint(null, null);
      }
      return;
    }

    let closestPoint: { lng: number; lat: number; routeIndex: number; distance: number } | null = null;

    routes.forEach((route, index) => {
      if (!route.geometry || !route.geometry.coordinates) return;

      const nearest = findNearestPointOnRoute(
        cursorPosition,
        route.geometry.coordinates as [number, number][]
      );

      if (nearest) {
        if (!closestPoint || nearest.distance < closestPoint.distance) {
          closestPoint = {
            lng: nearest.point[0],
            lat: nearest.point[1],
            routeIndex: index,
            distance: nearest.distance
          };
        }
      }
    });

    // Much more generous threshold since we have a wide hit area
    // This should match the visual hit area width (50px ≈ 0.05 in geographic units at typical zoom)
    const threshold = 0.05; // Very generous to match the 50px hit area
    if (closestPoint && closestPoint.distance < threshold) {
      setNearestPoint({
        lng: closestPoint.lng,
        lat: closestPoint.lat,
        routeIndex: closestPoint.routeIndex
      });
      if (onProximityPoint) {
        onProximityPoint([closestPoint.lng, closestPoint.lat], closestPoint.routeIndex);
      }
    } else {
      setNearestPoint(null);
      if (onProximityPoint) {
        onProximityPoint(null, null);
      }
    }
  }, [cursorPosition, routes, editingEnabled, onProximityPoint]);

  // Create GeoJSON features for routes
  const routeFeatures = useMemo(() => {
    return routes.map(route => ({
      type: 'Feature' as const,
      id: route.id,
      properties: {
        routeId: route.id,
        colorIndex: route.colorIndex
      },
      geometry: route.geometry
    }));
  }, [routes]);

  // Create GeoJSON features for waypoints
  const waypointFeatures = useMemo(() => {
    const features: any[] = [];
    routes.forEach(route => {
      if (route.waypoints && route.waypoints.length > 0) {
        route.waypoints.forEach((wp, index) => {
          features.push({
            type: 'Feature',
            properties: {
              routeId: route.id,
              waypointIndex: index
            },
            geometry: {
              type: 'Point',
              coordinates: [wp.lng, wp.lat]
            }
          });
        });
      }
    });
    return features;
  }, [routes]);

  // Create proximity indicator feature
  const proximityFeature = useMemo(() => {
    if (!nearestPoint) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Point' as const,
        coordinates: [nearestPoint.lng, nearestPoint.lat]
      }
    };
  }, [nearestPoint]);

  return (
    <>
      {/* Route lines */}
      {routes.map((route, index) => {
        const color = COLORS[route.colorIndex % COLORS.length];
        const isHovered = nearestPoint?.routeIndex === index;

        // Debug log the route structure
        console.log(`[MapboxRouteLayers] Route ${index}:`, route);

        // Ensure we have valid geometry
        if (!route.geometry || !route.geometry.coordinates) {
          console.warn(`[MapboxRouteLayers] Skipping route ${index} - no valid geometry`);
          return null;
        }

        const geoJsonData = {
          type: 'Feature' as const,
          properties: { routeId: route.id },
          geometry: route.geometry
        };

        return (
          <Source
            key={`route-${route.id}`}
            id={`route-${route.id}`}
            type="geojson"
            data={geoJsonData}
          >
            {/* Hit area layer - wider for easier hovering */}
            <Layer
              id={`route-hit-area-${route.id}`}
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': color,
                'line-width': isHovered ? 40 : 50, // Very wide hit area, slightly smaller when hovered
                'line-opacity': isHovered ? 0.1 : 0.05 // Slightly visible, more visible on hover
              }}
            />

            {/* Visible route line - rendered on top */}
            <Layer
              id={`route-line-${route.id}`}
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': color,
                'line-width': isHovered ? 6 : 4,
                'line-opacity': 0.8
              }}
            />
          </Source>
        );
      })}

      {/* Waypoint markers */}
      {waypointFeatures.length > 0 && (
        <Source
          id="waypoints"
          type="geojson"
          data={{
            type: 'FeatureCollection',
            features: waypointFeatures
          }}
        >
          <Layer
            id="waypoint-circles"
            type="circle"
            paint={{
              'circle-radius': 8,
              'circle-color': '#FFC800', // Orange for waypoints
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2
            }}
          />
        </Source>
      )}

      {/* Proximity indicator */}
      {proximityFeature && editingEnabled && (
        <Source
          id="proximity-indicator"
          type="geojson"
          data={proximityFeature}
        >
          <Layer
            id="proximity-circle"
            type="circle"
            paint={{
              'circle-radius': 12, // Larger for better visibility
              'circle-color': '#2ECC71', // Green for proximity
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 3,
              'circle-opacity': 1 // Fully opaque for better visibility
            }}
          />
        </Source>
      )}
    </>
  );
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