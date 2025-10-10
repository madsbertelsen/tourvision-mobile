import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import type { RouteWithMetadata } from '@/contexts/MockContext';

// Set Mapbox access token
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_TOKEN);
}

interface MapViewNativeProps {
  locations?: Location[];
  routes?: RouteWithMetadata[];
  height?: number | string;
  center?: { lat: number; lng: number };
  zoom?: number;
  focusedLocation?: { id: string; name: string; lat: number; lng: number } | null;
  isEditMode?: boolean;
  onRouteWaypointUpdate?: (routeId: string, waypoint: { lat: number; lng: number }, segmentIndex: number) => void;
  onRouteWaypointRemove?: (routeId: string, waypointIndex: number) => void;
  bottomPadding?: number;
  style?: any;
}

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
  photoName?: string;
}

// Color palette for markers (same as web version)
const MARKER_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#A855F7', // Purple
  '#FDE047', // Yellow-300
  '#E879F9', // Fuchsia-400
  '#FB923C', // Orange-400
  '#C084FC', // Purple-400
];

function MapViewNative({
  locations = [],
  routes = [],
  height = 400,
  center = { lat: 0, lng: 0 },
  zoom = 2,
  focusedLocation,
  isEditMode = false,
  onRouteWaypointUpdate,
  onRouteWaypointRemove,
  bottomPadding = 0,
  style,
}: MapViewNativeProps) {
  const cameraRef = useRef<Mapbox.Camera>(null);
  const mapRef = useRef<Mapbox.MapView>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Convert lat/lng to [lng, lat] for Mapbox
  const centerCoordinate = [center.lng, center.lat];

  // Handle focused location changes with animation
  useEffect(() => {
    if (focusedLocation && mapLoaded && cameraRef.current) {
      const targetCoordinate = [focusedLocation.lng, focusedLocation.lat];

      // Animate to the focused location
      cameraRef.current.setCamera({
        centerCoordinate: targetCoordinate,
        zoomLevel: 12,
        animationDuration: 2000,
        animationMode: 'easeTo',
      });
    }
  }, [focusedLocation, mapLoaded]);

  // Convert locations to GeoJSON for markers
  const locationFeatures = locations.map((location) => ({
    type: 'Feature' as const,
    id: location.id,
    geometry: {
      type: 'Point' as const,
      coordinates: [location.lng, location.lat],
    },
    properties: {
      id: location.id,
      name: location.name,
      description: location.description,
      colorIndex: location.colorIndex || 0,
    },
  }));

  const locationsGeoJSON = {
    type: 'FeatureCollection' as const,
    features: locationFeatures,
  };

  // Convert routes to GeoJSON LineStrings
  const routeFeatures = routes
    .filter(route => {
      // Check if route has geometry in GeoJSON format or as array
      if (route.geometry) {
        if (route.geometry.type === 'LineString' && route.geometry.coordinates) {
          return route.geometry.coordinates.length > 0;
        }
        if (Array.isArray(route.geometry)) {
          return route.geometry.length > 0;
        }
      }
      return false;
    })
    .map((route) => {
      let coordinates: number[][];

      // Handle both GeoJSON format and plain array format
      if (route.geometry.type === 'LineString' && route.geometry.coordinates) {
        // GeoJSON format from API
        coordinates = route.geometry.coordinates;
      } else if (Array.isArray(route.geometry)) {
        // Plain array format (legacy)
        coordinates = route.geometry.map(point => [point[0], point[1]]);
      } else {
        coordinates = [];
      }

      return {
        type: 'Feature' as const,
        id: route.id,
        geometry: {
          type: 'LineString' as const,
          coordinates,
        },
        properties: {
          id: route.id,
          fromId: route.fromId,
          toId: route.toId,
          color: route.color || '#94a3b8',
        },
      };
    });

  const routesGeoJSON = {
    type: 'FeatureCollection' as const,
    features: routeFeatures,
  };

  const containerStyle = [
    styles.container,
    style,
    height === '100%'
      ? styles.fullHeight
      : { height: typeof height === 'number' ? height : undefined }
  ];

  return (
    <View style={[containerStyle, { backgroundColor: '#ffffff' }]}>
      <Mapbox.MapView
        ref={mapRef}
        style={[styles.map, { backgroundColor: '#ffffff' }]}
        onDidFinishLoadingMap={() => setMapLoaded(true)}
        styleURL="https://demotiles.maplibre.org/style.json"
        logoEnabled={false}
        compassEnabled={true}
        rotateEnabled={true}
        pitchEnabled={true}
        attributionEnabled={false}
        projection="globe"
      >
        <Mapbox.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate,
            zoomLevel: zoom,
          }}
          animationDuration={0}
        />

        {/* Atmosphere to set white/light background for space */}
        <Mapbox.Atmosphere
          style={{
            color: 'rgba(255, 255, 255, 1)',
            highColor: 'rgba(255, 255, 255, 1)',
            horizonBlend: 0.1,
            spaceColor: 'rgba(255, 255, 255, 1)', // White space instead of black
            starIntensity: 0, // No stars in white background
          }}
        />

        {/* Routes Layer - rendered first so it appears below markers */}
        {routeFeatures.length > 0 && (
          <Mapbox.ShapeSource
            id="routes"
            shape={routesGeoJSON}
          >
            {/* Route outline for better visibility */}
            <Mapbox.LineLayer
              id="route-outline"
              style={{
                lineColor: '#000000',
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
                lineOpacity: 0.3,
              }}
            />
            {/* Main route line */}
            <Mapbox.LineLayer
              id="route-lines"
              style={{
                lineColor: '#3B82F6', // Bright blue color
                lineWidth: 3,
                lineCap: 'round',
                lineJoin: 'round',
                lineDasharray: [2, 1], // Dashed line for better visibility
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {/* Location Markers - rendered after routes so they appear on top */}
        {locations.length > 0 && (
          <Mapbox.ShapeSource
            id="locations"
            shape={locationsGeoJSON}
          >
            <Mapbox.CircleLayer
              id="location-circles"
              style={{
                circleRadius: 8,
                circleColor: [
                  'match',
                  ['get', 'colorIndex'],
                  0, MARKER_COLORS[0],
                  1, MARKER_COLORS[1],
                  2, MARKER_COLORS[2],
                  3, MARKER_COLORS[3],
                  4, MARKER_COLORS[4],
                  5, MARKER_COLORS[5],
                  6, MARKER_COLORS[6],
                  7, MARKER_COLORS[7],
                  8, MARKER_COLORS[8],
                  9, MARKER_COLORS[9],
                  10, MARKER_COLORS[10],
                  11, MARKER_COLORS[11],
                  12, MARKER_COLORS[12],
                  13, MARKER_COLORS[13],
                  14, MARKER_COLORS[14],
                  15, MARKER_COLORS[15],
                  MARKER_COLORS[0], // default
                ],
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 2,
              }}
            />
            <Mapbox.SymbolLayer
              id="location-labels"
              style={{
                textField: ['get', 'name'],
                textSize: 12,
                textAnchor: 'top',
                textOffset: [0, 1],
                textColor: '#000000',
                textHaloColor: '#ffffff',
                textHaloWidth: 1,
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {/* Focused location marker (red flying marker) */}
        {focusedLocation && (
          <Mapbox.ShapeSource
            id="focused-location"
            shape={{
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [focusedLocation.lng, focusedLocation.lat],
              },
              properties: {},
            }}
          >
            <Mapbox.CircleLayer
              id="focused-circle"
              style={{
                circleRadius: 12,
                circleColor: '#EF4444',
                circleStrokeColor: '#ffffff',
                circleStrokeWidth: 3,
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  fullHeight: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});

export default MapViewNative;