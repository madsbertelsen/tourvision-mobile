import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { useDocumentNextContext } from '../_layout';
import * as turf from '@turf/helpers';
import * as turfBbox from '@turf/bbox';

// Transport mode type
type TransportMode = 'walking' | 'driving' | 'cycling';

// Route data interface
interface RouteData {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  transportMode: TransportMode;
  geometry: any; // GeoJSON LineString
  distance: number; // meters
  duration: number; // seconds
  waypoints: Array<{ lat: number; lng: number }>;
  color: string;
}

// Map location interface (from document context)
interface MapLocation {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  displayText?: string;
  colorIndex?: number;
  color?: string;
  description?: string;
  transportProfile?: TransportMode;
  transportFrom?: string;
  waypoints?: Array<{ lat: number; lng: number }>;
}

// Context for sharing map state with routes
interface MapContextType {
  locations: MapLocation[];
  routes: RouteData[];
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  selectedRoute: RouteData | null;
  setSelectedRoute: (route: RouteData | null) => void;
  cameraRef: React.RefObject<Mapbox.Camera>;
  bottomSheetRef: React.RefObject<BottomSheet>;
  focusOnRoute: (route: RouteData) => void;
  focusOnLocation: (location: MapLocation) => void;
  updateRoute: (routeId: string, updates: Partial<RouteData>) => Promise<void>;
  isAddingWaypoint: boolean;
  setIsAddingWaypoint: (adding: boolean) => void;
}

const MapContext = createContext<MapContextType | null>(null);

export function useMapContext() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error('useMapContext must be used within MapLayout');
  }
  return context;
}

// Define color array
const COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

export default function MapLayout() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { documentId, locations: docLocations, setGeoMarkUpdate } = useDocumentNextContext();

  // Process locations to add colors
  const locations: MapLocation[] = useMemo(() => {
    return docLocations.map((loc, index) => ({
      ...loc,
      geoId: loc.geoId || `loc-${index}`,
      colorIndex: loc.colorIndex ?? index,
      color: COLORS[(loc.colorIndex ?? index) % COLORS.length],
    }));
  }, [docLocations]);

  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteData | null>(null);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);

  const cameraRef = useRef<Mapbox.Camera>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);

  // Calculate initial camera bounds based on all locations
  const initialBounds = useMemo(() => {
    if (locations.length === 0) {
      return {
        ne: [-122.4, 37.8], // Default to SF
        sw: [-122.5, 37.7],
      };
    }

    if (locations.length === 1) {
      const loc = locations[0];
      return {
        ne: [loc.lng + 0.01, loc.lat + 0.01],
        sw: [loc.lng - 0.01, loc.lat - 0.01],
      };
    }

    // Calculate bounding box for all locations
    const lngs = locations.map(loc => loc.lng);
    const lats = locations.map(loc => loc.lat);

    return {
      ne: [Math.max(...lngs), Math.max(...lats)],
      sw: [Math.min(...lngs), Math.min(...lats)],
    };
  }, [locations]);

  // Fetch routes between consecutive locations
  useEffect(() => {
    const fetchRoutes = async () => {
      if (locations.length < 2) {
        setRoutes([]);
        return;
      }

      const newRoutes: RouteData[] = [];

      for (let i = 0; i < locations.length - 1; i++) {
        const fromLoc = locations[i];
        const toLoc = locations[i + 1];

        // Only create route if transportation is explicitly configured
        if (!toLoc.transportProfile) {
          continue;
        }

        try {
          const transportMode = toLoc.transportProfile;
          const profile = transportMode === 'walking' ? 'walking' :
                         transportMode === 'cycling' ? 'cycling' :
                         'driving-traffic';

          // Construct waypoints query if they exist
          let waypointsQuery = '';
          if (toLoc.waypoints && toLoc.waypoints.length > 0) {
            const waypointCoords = toLoc.waypoints
              .map(wp => `${wp.lng},${wp.lat}`)
              .join(';');
            waypointsQuery = `;${waypointCoords}`;
          }

          const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${fromLoc.lng},${fromLoc.lat}${waypointsQuery};${toLoc.lng},${toLoc.lat}?geometries=geojson&overview=full&access_token=${process.env.EXPO_PUBLIC_MAPBOX_TOKEN}`;

          const response = await fetch(url);
          const data = await response.json();

          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            newRoutes.push({
              id: `route-${fromLoc.geoId}-${toLoc.geoId}`,
              fromLocationId: fromLoc.geoId,
              toLocationId: toLoc.geoId,
              transportMode,
              geometry: route.geometry,
              distance: route.distance,
              duration: route.duration,
              waypoints: toLoc.waypoints || [],
              color: toLoc.color || COLORS[1],
            });
          }
        } catch (error) {
          console.error(`Error fetching route from ${fromLoc.placeName} to ${toLoc.placeName}:`, error);
        }
      }

      setRoutes(newRoutes);
    };

    fetchRoutes();
  }, [locations]);

  // Camera control functions
  const focusOnRoute = useCallback((route: RouteData) => {
    if (route.geometry && route.geometry.coordinates) {
      const bbox = turfBbox.default(route.geometry);
      cameraRef.current?.fitBounds(
        [bbox[0], bbox[1]], // SW
        [bbox[2], bbox[3]], // NE
        100, // padding
        1000 // animation duration
      );
    }
  }, []);

  const focusOnLocation = useCallback((location: MapLocation) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [location.lng, location.lat],
      zoomLevel: 14,
      animationDuration: 1000,
    });
  }, []);

  // Update or create route function
  const updateRoute = useCallback(async (routeId: string, updates: Partial<RouteData>) => {
    // Check if route exists
    const existingRoute = routes.find(r => r.id === routeId);

    if (existingRoute) {
      // Update existing route
      setRoutes(prev => prev.map(r =>
        r.id === routeId ? { ...r, ...updates } : r
      ));
    } else {
      // Create new route - extract location IDs from routeId
      const match = routeId.match(/route-(.+)-(.+)/);
      if (match) {
        const [_, fromId, toId] = match;
        const newRoute: RouteData = {
          id: routeId,
          fromLocationId: fromId,
          toLocationId: toId,
          transportMode: updates.transportMode || 'walking',
          geometry: updates.geometry!,
          distance: updates.distance || 0,
          duration: updates.duration || 0,
          waypoints: updates.waypoints || [],
          color: locations.find(loc => loc.geoId === toId)?.color || '#3B82F6',
        };
        setRoutes(prev => [...prev, newRoute]);
      }
    }

    // Find the location that this route leads to
    const match = routeId.match(/route-(.+)-(.+)/);
    if (match && updates.transportMode) {
      const [_, fromId, toId] = match;
      const location = locations.find(loc => loc.geoId === toId);
      if (location) {
        // Update document via context
        setGeoMarkUpdate({
          geoId: location.geoId,
          updatedAttrs: {
            transportProfile: updates.transportMode,
            waypoints: updates.waypoints || null,
          }
        });
      }
    }
  }, [routes, locations, setGeoMarkUpdate]);

  // Handle bottom sheet based on current route
  useEffect(() => {
    const currentSegments = segments.slice(segments.indexOf('map') + 1);

    if (currentSegments.length === 0 || currentSegments[0] === 'index') {
      // On index route - close bottom sheet
      bottomSheetRef.current?.close();
    } else if (currentSegments[0] === 'location' || currentSegments[0] === 'transport') {
      // On location or transport route - expand bottom sheet
      bottomSheetRef.current?.expand();
    }
  }, [segments]);

  // Handle marker press
  const handleMarkerPress = useCallback((location: MapLocation) => {
    const currentSegments = segments.slice(segments.indexOf('map') + 1);

    // If already viewing this location, do nothing
    if (currentSegments[0] === 'location' && currentSegments[1] === location.geoId) {
      return;
    }

    // Navigate to location view
    router.push(`/document-next/${documentId}/map/location/${location.geoId}`);
  }, [segments, documentId, router]);

  // Handle route line press
  const handleRoutePress = useCallback((route: RouteData) => {
    if (isAddingWaypoint) {
      // In waypoint adding mode - handled elsewhere
      return;
    }

    // Navigate to transport config for the destination location
    router.push(`/document-next/${documentId}/map/transport/${route.toLocationId}`);
  }, [isAddingWaypoint, documentId, router]);

  // Handle close button
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // Snap points for bottom sheet
  const snapPoints = useMemo(() => ['25%', '50%', '75%'], []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <MapContext.Provider value={{
        locations,
        routes,
        selectedLocationId,
        setSelectedLocationId,
        selectedRoute,
        setSelectedRoute,
        cameraRef,
        bottomSheetRef,
        focusOnRoute,
        focusOnLocation,
        updateRoute,
        isAddingWaypoint,
        setIsAddingWaypoint,
      }}>
        {/* Mapbox map - always visible as background */}
        <View style={styles.container}>
          <Mapbox.MapView
            style={styles.map}
            styleURL="mapbox://styles/mapbox/light-v11"
          >
            <Mapbox.Camera
              ref={cameraRef}
              defaultSettings={{
                bounds: initialBounds,
                padding: { paddingTop: 50, paddingBottom: 50, paddingLeft: 50, paddingRight: 50 },
              }}
              animationDuration={0}
            />

            {/* Route lines */}
            {routes.map(route => (
              <Mapbox.ShapeSource
                key={route.id}
                id={route.id}
                shape={route.geometry}
                onPress={() => handleRoutePress(route)}
              >
                <Mapbox.LineLayer
                  id={`${route.id}-line`}
                  style={{
                    lineColor: route.color,
                    lineWidth: 4,
                    lineOpacity: 0.7,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </Mapbox.ShapeSource>
            ))}

            {/* Location markers */}
            {locations.map((location) => (
              <Mapbox.MarkerView
                key={location.geoId}
                coordinate={[location.lng, location.lat]}
              >
                <TouchableOpacity
                  onPress={() => handleMarkerPress(location)}
                  style={styles.markerContainer}
                >
                  <View style={[
                    styles.marker,
                    { backgroundColor: location.color }
                  ]} />
                  <View style={styles.markerLabel}>
                    <Text style={styles.markerLabelText} numberOfLines={1}>
                      {location.displayText || location.placeName}
                    </Text>
                  </View>
                </TouchableOpacity>
              </Mapbox.MarkerView>
            ))}
          </Mapbox.MapView>

          {/* Close button overlay with safe area offset */}
          <TouchableOpacity
            style={[
              styles.closeButton,
              {
                top: insets.top + 16,
                right: insets.right + 16
              }
            ]}
            onPress={handleClose}
          >
            <View style={styles.closeButtonBackground}>
              <Ionicons name="close" size={24} color="#000" />
            </View>
          </TouchableOpacity>

          {/* Bottom sheet containing Stack navigator outlet */}
          <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose={true}
            onClose={() => {
              // When bottom sheet closes, navigate back to index
              router.replace(`/document-next/${documentId}/map`);
            }}
            backgroundStyle={styles.bottomSheetBackground}
            handleIndicatorStyle={styles.bottomSheetIndicator}
          >
            <BottomSheetView style={styles.bottomSheetContent}>
              {/* Slot renders the active Stack route */}
              <Slot />
            </BottomSheetView>
          </BottomSheet>
        </View>
      </MapContext.Provider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: 'center',
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  markerLabel: {
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 120,
  },
  markerLabelText: {
    fontSize: 11,
    color: '#333',
  },
  closeButton: {
    position: 'absolute',
  },
  closeButtonBackground: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bottomSheetBackground: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bottomSheetIndicator: {
    backgroundColor: '#D1D5DB',
    width: 36,
    height: 4,
  },
  bottomSheetContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
});