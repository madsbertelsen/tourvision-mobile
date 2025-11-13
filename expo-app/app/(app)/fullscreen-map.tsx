import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';

// Set Mapbox access token
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '');

// Color palette matching the editor
const COLORS = [
  '#3B82F6',  // Blue
  '#8B5CF6',  // Purple
  '#10B981',  // Green
  '#F59E0B',  // Amber
  '#EF4444',  // Red
  '#EC4899',  // Pink
  '#06B6D4',  // Cyan
  '#84CC16',  // Lime
  '#F97316',  // Orange
  '#6366F1'   // Indigo
];

interface MapLocation {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex: number;
  transportFrom?: string | null;
  transportProfile?: string | null;
  waypoints?: any[] | null;
}

export default function FullscreenMap() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const cameraRef = useRef<Mapbox.Camera>(null);

  // Parse locations from params
  const locations: MapLocation[] = params.locations
    ? JSON.parse(Array.isArray(params.locations) ? params.locations[0] : params.locations)
    : [];

  useEffect(() => {
    // Fit camera to show all markers
    if (cameraRef.current && locations.length > 0) {
      setTimeout(() => {
        if (locations.length === 1) {
          // Single location - zoom in
          cameraRef.current?.setCamera({
            centerCoordinate: [locations[0].lng, locations[0].lat],
            zoomLevel: 12,
            animationDuration: 1000,
          });
        } else {
          // Multiple locations - fit bounds
          const lngs = locations.map(l => l.lng);
          const lats = locations.map(l => l.lat);

          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);

          const centerLng = (minLng + maxLng) / 2;
          const centerLat = (minLat + maxLat) / 2;

          // Calculate appropriate zoom level based on bounds
          const lngDiff = maxLng - minLng;
          const latDiff = maxLat - minLat;
          const maxDiff = Math.max(lngDiff, latDiff);

          let zoomLevel = 10;
          if (maxDiff < 0.01) zoomLevel = 14;
          else if (maxDiff < 0.05) zoomLevel = 12;
          else if (maxDiff < 0.1) zoomLevel = 11;
          else if (maxDiff < 0.5) zoomLevel = 9;
          else if (maxDiff < 1) zoomLevel = 8;
          else zoomLevel = 7;

          cameraRef.current?.setCamera({
            centerCoordinate: [centerLng, centerLat],
            zoomLevel: zoomLevel,
            animationDuration: 1000,
          });
        }
      }, 100);
    }
  }, [locations]);

  // For web platform, render a simple message
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Map View</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.webContainer}>
          <Text style={styles.webTitle}>Map View (Web Platform)</Text>
          <Text style={styles.webSubtitle}>
            {locations.length} location{locations.length !== 1 ? 's' : ''} to display
          </Text>

          <View style={styles.locationsList}>
            {locations.map((location, index) => (
              <View key={location.geoId} style={styles.locationItem}>
                <View
                  style={[
                    styles.locationDot,
                    { backgroundColor: COLORS[location.colorIndex % COLORS.length] }
                  ]}
                />
                <Text style={styles.locationText}>
                  {index + 1}. {location.placeName}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.webNote}>
            Note: Native map view is not available on web platform.
            Switch to iOS or Android to see the interactive map.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Native platform - render actual map
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Map View</Text>
        <View style={{ width: 40 }} />
      </View>

      <Mapbox.MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/light-v11"
      >
        <Mapbox.Camera
          ref={cameraRef}
          zoomLevel={locations.length === 1 ? 11 : 8}
          centerCoordinate={
            locations.length > 0
              ? [locations[0].lng, locations[0].lat]
              : [0, 0]
          }
        />

        {/* Location markers */}
        {locations.map((location, index) => {
          const colorIndex = (location.colorIndex || 0) % COLORS.length;
          const bgColor = COLORS[colorIndex];

          return (
            <Mapbox.MarkerView
              key={location.geoId || `marker-${index}`}
              id={location.geoId || `marker-${index}`}
              coordinate={[location.lng, location.lat]}
            >
              <View
                style={[
                  styles.marker,
                  { backgroundColor: bgColor }
                ]}
              >
                <View style={styles.markerInner} />
              </View>
            </Mapbox.MarkerView>
          );
        })}

        {/* Draw route lines between consecutive locations if we have more than one */}
        {locations.length > 1 && (
          <Mapbox.ShapeSource
            id="route-line"
            shape={{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: locations.map(loc => [loc.lng, loc.lat])
              }
            }}
          >
            <Mapbox.LineLayer
              id="route-line-layer"
              style={{
                lineColor: '#000',
                lineWidth: 2,
                lineOpacity: 0.3,
                lineDasharray: [2, 1]
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {locations.length} location{locations.length !== 1 ? 's' : ''}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  markerInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'white',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
  },
  // Web-specific styles
  webContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  webSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  locationsList: {
    width: '100%',
    maxWidth: 400,
    marginVertical: 24,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    marginBottom: 8,
    borderRadius: 8,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  webNote: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 32,
  },
});