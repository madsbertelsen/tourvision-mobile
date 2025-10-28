import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
// @ts-ignore - react-map-gl has module resolution issues with Metro
import Map from 'react-map-gl/mapbox';
// @ts-ignore
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { GeolocateControl, Layer, Marker, NavigationControl, Source, useControl } from 'react-map-gl/mapbox';

interface LocationMapWebProps {
  latitude: number;
  longitude: number;
  name: string;
  colorIndex?: number;
  transportFrom?: {
    lat: number;
    lng: number;
    name: string;
  } | null;
  routeGeometry?: any;
  routeDistance?: number | null;
  routeDuration?: number | null;
}

const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

// DeckGL overlay component
function DeckGLOverlay(props: { layers: any[] }) {
  const overlay = useControl<any>(() => new MapboxOverlay({}));
  overlay.setProps({ layers: props.layers });
  return null;
}

export default function LocationMapWeb({
  latitude,
  longitude,
  name,
  colorIndex = 0,
  transportFrom,
  routeGeometry,
  routeDistance,
  routeDuration
}: LocationMapWebProps) {
  const mapRef = useRef<any>(null);
  const [viewState, setViewState] = useState({
    latitude,
    longitude,
    zoom: 14,
    pitch: 0,
    bearing: 0
  });

  useEffect(() => {
    // Update view when location changes
    setViewState(prev => ({
      ...prev,
      latitude,
      longitude
    }));

    // Fit bounds if we have a route
    if (routeGeometry && transportFrom && mapRef.current) {
      const bounds: [[number, number], [number, number]] = [
        [Math.min(longitude, transportFrom.lng), Math.min(latitude, transportFrom.lat)],
        [Math.max(longitude, transportFrom.lng), Math.max(latitude, transportFrom.lat)]
      ];

      mapRef.current.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        duration: 1000
      });
    }
  }, [latitude, longitude, transportFrom, routeGeometry]);

  // Create deck.gl layers
  const layers = [
    // Route path layer
    routeGeometry && new PathLayer({
      id: 'route-layer',
      data: [{
        path: routeGeometry.coordinates || []
      }],
      pickable: false,
      widthScale: 4,
      widthMinPixels: 3,
      getPath: (d: any) => d.path,
      getColor: [245, 158, 11, 200], // Amber color
      getWidth: 1,
      jointRounded: true,
      capRounded: true
    }),

    // Origin marker
    transportFrom && new ScatterplotLayer({
      id: 'origin-marker',
      data: [transportFrom],
      pickable: true,
      opacity: 1,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 15,
      radiusMaxPixels: 30,
      lineWidthMinPixels: 3,
      getPosition: (d: any) => [d.lng, d.lat],
      getFillColor: [16, 185, 129, 200], // Green
      getLineColor: [255, 255, 255],
      getRadius: 20
    }),

    // Destination marker
    new ScatterplotLayer({
      id: 'destination-marker',
      data: [{
        lat: latitude,
        lng: longitude,
        name: name
      }],
      pickable: true,
      opacity: 1,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 20,
      radiusMaxPixels: 35,
      lineWidthMinPixels: 3,
      getPosition: (d: any) => [d.lng, d.lat],
      getFillColor: hexToRgb(COLORS[colorIndex % COLORS.length]),
      getLineColor: [255, 255, 255],
      getRadius: 25
    })
  ].filter(Boolean);

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
        {...viewState}
        onMove={(evt: any) => setViewState(evt.viewState)}
      >
        {/* DeckGL overlay */}
        <DeckGLOverlay layers={layers} />

        {/* Navigation controls */}
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />

        {/* Origin marker (as fallback if deck.gl doesn't render) */}
        {transportFrom && (
          <Marker
            latitude={transportFrom.lat}
            longitude={transportFrom.lng}
            anchor="center"
          >
            <View style={styles.originMarker}>
              <Text style={styles.markerText}>A</Text>
            </View>
          </Marker>
        )}

        {/* Destination marker */}
        <Marker
          latitude={latitude}
          longitude={longitude}
          anchor="center"
        >
          <View style={[styles.destinationMarker, { backgroundColor: COLORS[colorIndex % COLORS.length] }]}>
            <Text style={styles.markerText}>B</Text>
          </View>
        </Marker>

        {/* Route line (if deck.gl layer doesn't render) */}
        {routeGeometry && (
          <Source
            id="route"
            type="geojson"
            data={routeGeometry}
          >
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color': '#F59E0B',
                'line-width': 4,
                'line-opacity': 0.8
              }}
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
            />
          </Source>
        )}
      </Map>

      {/* Route info overlay */}
      {routeDistance && routeDuration && (
        <View style={styles.routeInfo}>
          <Text style={styles.routeTitle}>Route Details</Text>
          <Text style={styles.routeText}>
            Distance: {(routeDistance / 1000).toFixed(1)} km
          </Text>
          <Text style={styles.routeText}>
            Duration: {Math.round(routeDuration / 60)} min
          </Text>
        </View>
      )}

      {/* Location name overlay */}
      <View style={styles.locationOverlay}>
        <Text style={styles.locationText}>📍 {name}</Text>
      </View>
    </View>
  );
}

// Helper function to convert hex to RGB
function hexToRgb(hex: string): [number, number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        200
      ]
    : [0, 0, 0, 200];
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 400,
    position: 'relative',
  },
  originMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10B981',
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  destinationMarker: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  markerText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  routeInfo: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  routeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  routeText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  locationOverlay: {
    position: 'absolute',
    bottom: 16,
    left: '50%',
    transform: [{ translateX: -100 }],
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    maxWidth: 300,
  },
  locationText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});