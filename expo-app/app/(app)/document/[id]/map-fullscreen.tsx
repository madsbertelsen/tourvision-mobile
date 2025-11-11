import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { useTripContext } from './_layout';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Set Mapbox access token
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '');

// Color palette matching other components
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export default function MapFullscreenModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locations } = useTripContext();
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<any | null>(null);

  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['25%', '50%', '75%'], []);

  // Handle marker press
  const handleMarkerPress = useCallback((location: any) => {
    console.log('[MapFullscreen] Marker pressed:', location.displayText || location.placeName);
    setSelectedLocation(location);
    bottomSheetRef.current?.expand();
  }, []);

  // Handle bottom sheet close
  const handleSheetClose = useCallback(() => {
    setSelectedLocation(null);
  }, []);

  // Fetch routes between locations
  useEffect(() => {
    const fetchRoutes = async () => {
      if (locations.length < 2) {
        setRoutes([]);
        return;
      }

      const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
      if (!mapboxToken) {
        setRoutes([]);
        return;
      }

      const routePromises = [];

      // Create routes between consecutive locations
      for (let i = 1; i < locations.length; i++) {
        const from = locations[i - 1];
        const to = locations[i];

        let coordinates;
        if (to.waypoints && to.waypoints.length > 0) {
          const waypointCoords = to.waypoints.map((wp: any) => `${wp.lng},${wp.lat}`).join(';');
          coordinates = `${from.lng},${from.lat};${waypointCoords};${to.lng},${to.lat}`;
        } else {
          coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
        }

        const profile = to.transportProfile || 'walking';
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

        routePromises.push(
          fetch(url)
            .then(res => res.json())
            .then(data => {
              if (data.routes && data.routes[0]) {
                return {
                  id: `route-${from.geoId}-${to.geoId}`,
                  geometry: data.routes[0].geometry,
                  colorIndex: to.colorIndex || 0,
                };
              }
              return null;
            })
            .catch(() => null)
        );
      }

      const fetchedRoutes = await Promise.all(routePromises);
      setRoutes(fetchedRoutes.filter(r => r !== null));
    };

    fetchRoutes();
  }, [locations]);

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Mapbox map */}
      <Mapbox.MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/light-v11"
      >
        <Mapbox.Camera
          zoomLevel={locations.length === 1 ? 11 : 8}
          centerCoordinate={
            locations.length > 0
              ? [locations[0].lng, locations[0].lat]
              : [0, 0]
          }
        />

        {/* Route lines */}
        {routes.map((route) => {
          const routeColor = COLORS[(route.colorIndex || 0) % COLORS.length];
          return (
            <Mapbox.ShapeSource
              key={route.id}
              id={route.id}
              shape={route.geometry}
            >
              <Mapbox.LineLayer
                id={`${route.id}-line`}
                style={{
                  lineColor: routeColor,
                  lineWidth: 3,
                  lineOpacity: 0.75,
                }}
              />
            </Mapbox.ShapeSource>
          );
        })}

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
              <TouchableOpacity
                onPress={() => handleMarkerPress(location)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.marker,
                    { backgroundColor: bgColor }
                  ]}
                >
                  <View style={styles.markerInner} />
                </View>
              </TouchableOpacity>
            </Mapbox.MarkerView>
          );
        })}
      </Mapbox.MapView>

      {/* Close button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 8 }]}
        onPress={() => router.back()}
      >
        <Ionicons name="close" size={28} color="#000" />
      </TouchableOpacity>

      {/* Bottom Sheet for location details */}
      {selectedLocation && (
        <BottomSheet
          ref={bottomSheetRef}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose={true}
          onClose={handleSheetClose}
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.bottomSheetIndicator}
        >
          <BottomSheetView style={styles.bottomSheetContent}>
            {/* Header with location name */}
            <View style={styles.sheetHeader}>
              <View style={[
                styles.sheetColorDot,
                { backgroundColor: COLORS[(selectedLocation.colorIndex || 0) % COLORS.length] }
              ]} />
              <Text style={styles.sheetTitle}>
                {selectedLocation.displayText || selectedLocation.placeName}
              </Text>
            </View>

            {/* Location details */}
            <View style={styles.sheetSection}>
              <View style={styles.sheetRow}>
                <Ionicons name="location-outline" size={20} color="#666" />
                <Text style={styles.sheetLabel}>Full Address</Text>
              </View>
              <Text style={styles.sheetValue}>{selectedLocation.placeName}</Text>
            </View>

            {selectedLocation.description && (
              <View style={styles.sheetSection}>
                <View style={styles.sheetRow}>
                  <Ionicons name="document-text-outline" size={20} color="#666" />
                  <Text style={styles.sheetLabel}>Description</Text>
                </View>
                <Text style={styles.sheetValue}>{selectedLocation.description}</Text>
              </View>
            )}

            <View style={styles.sheetSection}>
              <View style={styles.sheetRow}>
                <Ionicons name="navigate-outline" size={20} color="#666" />
                <Text style={styles.sheetLabel}>Coordinates</Text>
              </View>
              <Text style={styles.sheetValue}>
                {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
              </Text>
            </View>

            {selectedLocation.transportProfile && (
              <View style={styles.sheetSection}>
                <View style={styles.sheetRow}>
                  <Ionicons
                    name={
                      selectedLocation.transportProfile === 'driving' ? 'car-outline' :
                      selectedLocation.transportProfile === 'walking' ? 'walk-outline' :
                      selectedLocation.transportProfile === 'cycling' ? 'bicycle-outline' :
                      'airplane-outline'
                    }
                    size={20}
                    color="#666"
                  />
                  <Text style={styles.sheetLabel}>Transport</Text>
                </View>
                <Text style={styles.sheetValue}>
                  {selectedLocation.transportProfile.charAt(0).toUpperCase() + selectedLocation.transportProfile.slice(1)}
                </Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.sheetButton}
                onPress={() => {
                  // TODO: Navigate to location edit screen
                  console.log('Edit location:', selectedLocation.geoId);
                }}
              >
                <Ionicons name="pencil" size={20} color="#007AFF" />
                <Text style={styles.sheetButtonText}>Edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetButton}
                onPress={() => {
                  // TODO: Show directions
                  console.log('Show directions to:', selectedLocation.geoId);
                }}
              >
                <Ionicons name="navigate" size={20} color="#007AFF" />
                <Text style={styles.sheetButtonText}>Directions</Text>
              </TouchableOpacity>
            </View>
          </BottomSheetView>
        </BottomSheet>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  bottomSheetBackground: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  bottomSheetIndicator: {
    backgroundColor: '#ccc',
    width: 40,
    height: 4,
  },
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sheetColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    flex: 1,
  },
  sheetSection: {
    marginBottom: 16,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  sheetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
  sheetValue: {
    fontSize: 15,
    color: '#333',
    marginLeft: 28,
    lineHeight: 20,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  sheetButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f0f8ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  sheetButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 6,
  },
});
