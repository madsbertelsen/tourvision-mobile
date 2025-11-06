import React, { useEffect, useMemo, useState } from 'react';
import { Layer, Source } from 'react-map-gl/mapbox';

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
  proximityPoint?: [number, number] | null;
  selectedRouteIndex?: number | null;
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
  proximityPoint,
  selectedRouteIndex
}: MapboxRouteLayersProps) {
  // console.log('[MapboxRouteLayers] Rendering with routes:', routes);

  // Create GeoJSON features for all waypoints (always render them)
  const waypointFeatures = useMemo(() => {
    const features: any[] = [];
    routes.forEach((route, routeIndex) => {
      if (route.waypoints && route.waypoints.length > 0) {
        route.waypoints.forEach((wp, index) => {
          features.push({
            type: 'Feature',
            properties: {
              routeId: route.id,
              routeIndex: routeIndex,
              waypointIndex: index,
              // Mark if this waypoint should be visible (belongs to selected route)
              isVisible: selectedRouteIndex === routeIndex
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
  }, [routes, selectedRouteIndex]);

  // Create proximity indicator feature
  const proximityFeature = useMemo(() => {
    if (!proximityPoint) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Point' as const,
        coordinates: proximityPoint
      }
    };
  }, [proximityPoint]);

  return (
    <>
      {/* Route lines */}
      {routes.map((route, index) => {
        const color = COLORS[route.colorIndex % COLORS.length];
        const isHovered = selectedRouteIndex === index;

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
                'line-width': 40, // Moderate hit area width
                'line-opacity': 0.01 // Nearly invisible
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
                'line-width-transition': { duration: 250 }, // Smooth hover animation
                'line-opacity': 0.8
              }}
            />
          </Source>
        );
      })}

      {/* Waypoint markers - always rendered with opacity/size transitions */}
      {routes.some(r => r.waypoints && r.waypoints.length > 0) && (
        <Source
          id="waypoints"
          type="geojson"
          data={{
            type: 'FeatureCollection',
            features: waypointFeatures // Include all waypoints, control visibility with opacity
          }}
        >
          <Layer
            id="waypoint-circles"
            type="circle"
            paint={{
              // Fixed size and appearance for all waypoints
              'circle-radius': 6,
              'circle-color': '#FFC800', // Orange for waypoints
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 1.5,
              // Simple opacity control
              'circle-opacity': [
                'case',
                ['get', 'isVisible'],
                1,    // Fully visible when route is hovered
                0.25  // Quarter opacity when not hovered
              ],
              'circle-stroke-opacity': [
                'case',
                ['get', 'isVisible'],
                1,    // Fully visible stroke when hovered
                0.25  // Quarter opacity stroke when not hovered
              ]
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
              'circle-radius-transition': { duration: 200 }, // Smooth size changes
              'circle-color': '#2ECC71', // Green for proximity
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 3,
              'circle-stroke-width-transition': { duration: 200 },
              'circle-opacity': 1, // Fully opaque for better visibility
              'circle-opacity-transition': { duration: 200 }, // Smooth fade in
              'circle-stroke-opacity': 1,
              'circle-stroke-opacity-transition': { duration: 200 }
            }}
          />
        </Source>
      )}
    </>
  );
}