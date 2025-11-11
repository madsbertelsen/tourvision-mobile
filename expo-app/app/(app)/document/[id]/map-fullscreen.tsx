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

  // Bottom sheet state - can show either location or route
  const [selectedLocation, setSelectedLocation] = useState<any | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
  const [sheetView, setSheetView] = useState<'location' | 'route'>('location');

  // Bottom sheet ref and snap points
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['25%', '50%', '75%'], []);

  // Camera ref for programmatic control
  const cameraRef = useRef<Mapbox.Camera>(null);

  // Handle marker press
  const handleMarkerPress = useCallback((location: any, index: number) => {
    console.log('[MapFullscreen] Marker pressed:', location.displayText || location.placeName);
    setSelectedLocation(location);
    setSheetView('location');

    // Find the route that ends at this location
    const routeIndex = index - 1; // Route TO this location
    if (routeIndex >= 0 && routes[routeIndex]) {
      setSelectedRoute({
        ...routes[routeIndex],
        fromLocation: locations[routeIndex],
        toLocation: location,
        routeIndex: routeIndex
      });
    } else {
      setSelectedRoute(null);
    }

    bottomSheetRef.current?.expand();
  }, [routes, locations]);

  // Handle route line press
  const handleRoutePress = useCallback((route: any, routeIndex: number) => {
    console.log('[MapFullscreen] Route pressed:', route.id);
    const fromLocation = locations[routeIndex];
    const toLocation = locations[routeIndex + 1];

    const enrichedRoute = {
      ...route,
      fromLocation,
      toLocation,
      routeIndex
    };

    setSelectedRoute(enrichedRoute);
    setSelectedLocation(toLocation); // Keep location for context
    setSheetView('route');
    bottomSheetRef.current?.expand();

    // Focus camera on the route
    setTimeout(() => focusOnRoute(enrichedRoute), 100);
  }, [locations, focusOnRoute]);

  // Focus camera on a specific route
  const focusOnRoute = useCallback((route: any) => {
    if (!cameraRef.current || !route.geometry?.coordinates) return;

    const coordinates = route.geometry.coordinates;
    if (coordinates.length === 0) return;

    // Calculate bounds for the route
    let minLng = coordinates[0][0];
    let maxLng = coordinates[0][0];
    let minLat = coordinates[0][1];
    let maxLat = coordinates[0][1];

    coordinates.forEach(([lng, lat]: [number, number]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    // Add padding to bounds (10%)
    const lngPadding = (maxLng - minLng) * 0.1;
    const latPadding = (maxLat - minLat) * 0.1;

    cameraRef.current.fitBounds(
      [minLng - lngPadding, minLat - latPadding],
      [maxLng + lngPadding, maxLat + latPadding],
      [50, 50, 50, 300], // padding: top, right, bottom, left
      1000 // animation duration
    );
  }, []);

  // Navigate to route view from location view
  const handleViewRoute = useCallback(() => {
    if (selectedRoute) {
      setSheetView('route');
      // Focus camera on the route
      setTimeout(() => focusOnRoute(selectedRoute), 100);
    }
  }, [selectedRoute, focusOnRoute]);

  // Navigate back to location view
  const handleBackToLocation = useCallback(() => {
    setSheetView('location');
  }, []);

  // Handle bottom sheet close
  const handleSheetClose = useCallback(() => {
    setSelectedLocation(null);
    setSelectedRoute(null);
    setSheetView('location');
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
          ref={cameraRef}
          zoomLevel={locations.length === 1 ? 11 : 8}
          centerCoordinate={
            locations.length > 0
              ? [locations[0].lng, locations[0].lat]
              : [0, 0]
          }
        />

        {/* Route lines */}
        {routes.map((route, routeIndex) => {
          const routeColor = COLORS[(route.colorIndex || 0) % COLORS.length];
          return (
            <Mapbox.ShapeSource
              key={route.id}
              id={route.id}
              shape={route.geometry}
              onPress={() => handleRoutePress(route, routeIndex)}
            >
              <Mapbox.LineLayer
                id={`${route.id}-line`}
                style={{
                  lineColor: routeColor,
                  lineWidth: 5,
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
                onPress={() => handleMarkerPress(location, index)}
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
            {sheetView === 'location' ? (
              // LOCATION VIEW
              <>
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

                {/* Action buttons */}
                <View style={styles.sheetActions}>
                  <TouchableOpacity
                    style={styles.sheetButton}
                    onPress={() => {
                      console.log('Edit location:', selectedLocation.geoId);
                    }}
                  >
                    <Ionicons name="pencil" size={20} color="#007AFF" />
                    <Text style={styles.sheetButtonText}>Edit</Text>
                  </TouchableOpacity>

                  {selectedRoute && (
                    <TouchableOpacity
                      style={styles.sheetButton}
                      onPress={handleViewRoute}
                    >
                      <Ionicons name="arrow-forward" size={20} color="#007AFF" />
                      <Text style={styles.sheetButtonText}>View Route</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              // ROUTE VIEW
              <>
                {/* Header with back button */}
                <View style={styles.sheetHeader}>
                  <TouchableOpacity onPress={handleBackToLocation} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#007AFF" />
                  </TouchableOpacity>
                  <View style={[
                    styles.sheetColorDot,
                    { backgroundColor: COLORS[(selectedRoute.colorIndex || 0) % COLORS.length] }
                  ]} />
                  <Text style={styles.sheetTitle}>Route Details</Text>
                </View>

                {/* Route info */}
                <View style={styles.sheetSection}>
                  <View style={styles.sheetRow}>
                    <Ionicons name="navigate-outline" size={20} color="#666" />
                    <Text style={styles.sheetLabel}>From → To</Text>
                  </View>
                  <Text style={styles.sheetValue}>
                    {selectedRoute.fromLocation?.displayText || selectedRoute.fromLocation?.placeName} → {selectedRoute.toLocation?.displayText || selectedRoute.toLocation?.placeName}
                  </Text>
                </View>

                {/* Transportation Method Selector */}
                <View style={styles.sheetSection}>
                  <View style={styles.sheetRow}>
                    <Ionicons name="car-outline" size={20} color="#666" />
                    <Text style={styles.sheetLabel}>Transportation Method</Text>
                  </View>
                  <View style={styles.transportOptions}>
                    {['walking', 'driving', 'cycling'].map((mode) => (
                      <TouchableOpacity
                        key={mode}
                        style={[
                          styles.transportOption,
                          selectedRoute.toLocation?.transportProfile === mode && styles.transportOptionActive
                        ]}
                        onPress={() => {
                          console.log('Change transport to:', mode);
                          // TODO: Update transport mode in document
                        }}
                      >
                        <Ionicons
                          name={mode === 'walking' ? 'walk' : mode === 'driving' ? 'car' : 'bicycle'}
                          size={24}
                          color={selectedRoute.toLocation?.transportProfile === mode ? '#007AFF' : '#666'}
                        />
                        <Text style={[
                          styles.transportOptionText,
                          selectedRoute.toLocation?.transportProfile === mode && styles.transportOptionTextActive
                        ]}>
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Save button */}
                <TouchableOpacity
                  style={[styles.sheetButton, styles.saveButton]}
                  onPress={() => {
                    console.log('Save route changes');
                    handleBackToLocation();
                  }}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={[styles.sheetButtonText, styles.saveButtonText]}>Save Changes</Text>
                </TouchableOpacity>
              </>
            )}
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
  backButton: {
    marginRight: 8,
    padding: 4,
  },
  transportOptions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginLeft: 28,
  },
  transportOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  transportOptionActive: {
    backgroundColor: '#f0f8ff',
    borderColor: '#007AFF',
  },
  transportOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 4,
  },
  transportOptionTextActive: {
    color: '#007AFF',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
  },
});
