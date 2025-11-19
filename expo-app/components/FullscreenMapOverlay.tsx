import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Modal, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Marker, Source, Layer } from 'react-map-gl/mapbox';

interface GeoMarkLocation {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex?: number;
  displayText?: string;
  transportFrom?: string | null;
  transportProfile?: string | null;
  waypoints?: Array<{lat: number, lng: number}> | null;
}

interface FullscreenMapOverlayProps {
  visible: boolean;
  onClose: () => void;
  locations: GeoMarkLocation[];
  initialBounds?: { ne: [number, number]; sw: [number, number] };
}

// Color array - Must match MapBlock and other components
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export default function FullscreenMapOverlay({
  visible,
  onClose,
  locations,
  initialBounds,
}: FullscreenMapOverlayProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [hasExpanded, setHasExpanded] = useState(false);

  // Calculate view state based on initial bounds or all locations
  const getViewState = () => {
    // If we have initial bounds from block map, use them
    if (initialBounds && initialBounds.ne[0] !== 0 && initialBounds.sw[0] !== 0) {
      const centerLat = (initialBounds.ne[1] + initialBounds.sw[1]) / 2;
      const centerLng = (initialBounds.ne[0] + initialBounds.sw[0]) / 2;

      // Calculate zoom to match the bounds
      const latDiff = Math.abs(initialBounds.ne[1] - initialBounds.sw[1]);
      const lngDiff = Math.abs(initialBounds.ne[0] - initialBounds.sw[0]);
      const maxDiff = Math.max(latDiff, lngDiff);

      let zoom = 10;
      if (maxDiff > 10) zoom = 3;
      else if (maxDiff > 5) zoom = 5;
      else if (maxDiff > 2) zoom = 7;
      else if (maxDiff > 1) zoom = 9;
      else if (maxDiff > 0.5) zoom = 10;
      else if (maxDiff > 0.1) zoom = 12;

      return {
        latitude: centerLat,
        longitude: centerLng,
        zoom
      };
    }

    // Fallback: calculate from all locations
    if (locations.length === 0) {
      return { latitude: 0, longitude: 0, zoom: 2 };
    }

    if (locations.length === 1) {
      return {
        latitude: locations[0].lat,
        longitude: locations[0].lng,
        zoom: 12
      };
    }

    // Calculate bounds for multiple locations
    const lats = locations.map(l => l.lat);
    const lngs = locations.map(l => l.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    const latDiff = Math.max(...lats) - Math.min(...lats);
    const lngDiff = Math.max(...lngs) - Math.min(...lngs);
    const maxDiff = Math.max(latDiff, lngDiff);

    let zoom = 10;
    if (maxDiff > 10) zoom = 3;
    else if (maxDiff > 5) zoom = 5;
    else if (maxDiff > 2) zoom = 7;
    else if (maxDiff > 1) zoom = 9;

    return {
      latitude: centerLat,
      longitude: centerLng,
      zoom
    };
  };

  const [viewState, setViewState] = useState(getViewState);

  // Expand to show all locations after initial render
  useEffect(() => {
    if (!visible || hasExpanded || !mapRef.current || locations.length === 0) return;

    const expandTimer = setTimeout(() => {
      try {
        const mapInstance = mapRef.current.getMap();

        // Calculate bounds for all locations
        const lngs = locations.map(l => l.lng);
        const lats = locations.map(l => l.lat);

        const bounds = [
          [Math.min(...lngs), Math.min(...lats)], // SW
          [Math.max(...lngs), Math.max(...lats)]  // NE
        ];

        mapInstance.fitBounds(bounds, {
          padding: 80,
          duration: 800,
        });

        setHasExpanded(true);
      } catch (error) {
        console.error('[FullscreenMapOverlay] Error expanding bounds:', error);
      }
    }, 300);

    return () => clearTimeout(expandTimer);
  }, [visible, hasExpanded, locations]);

  // Reset expansion state when modal closes
  useEffect(() => {
    if (!visible) {
      setHasExpanded(false);
    }
  }, [visible]);

  // Fetch routes for locations with transport configured
  useEffect(() => {
    if (!visible || locations.length < 2) {
      setRoutes([]);
      return;
    }

    const fetchRoutes = async () => {
      const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
      if (!mapboxToken) {
        console.error('[FullscreenMapOverlay] No Mapbox token found');
        return;
      }

      const routePromises = [];

      // Create routes between ALL consecutive locations
      for (let i = 1; i < locations.length; i++) {
        const from = locations[i - 1];
        const to = locations[i];

        // Use waypoints if defined, otherwise direct route
        let coordinates;
        if (to.waypoints && to.waypoints.length > 0) {
          const waypointCoords = to.waypoints.map((wp: {lng: number, lat: number}) => `${wp.lng},${wp.lat}`).join(';');
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
            .catch(err => {
              console.error('[FullscreenMapOverlay] Error fetching route:', err);
              return null;
            })
        );
      }

      const fetchedRoutes = await Promise.all(routePromises);
      const validRoutes = fetchedRoutes.filter(r => r !== null);
      setRoutes(validRoutes);
    };

    fetchRoutes();
  }, [visible, locations]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Semi-transparent backdrop */}
        <View style={styles.backdrop} />

        {/* Fullscreen Map */}
        <View style={styles.mapContainer}>
          <Map
            ref={mapRef}
            mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
            mapStyle="mapbox://styles/mapbox/light-v11"
            style={{ width: '100%', height: '100%' }}
            {...viewState}
            onMove={(evt: any) => setViewState(evt.viewState)}
          >
            {/* Route rendering */}
            {routes.map((route) => {
              const routeColor = COLORS[(route.colorIndex || 0) % COLORS.length];
              return (
                <Source
                  key={`route-${route.id}`}
                  id={`route-${route.id}`}
                  type="geojson"
                  data={route.geometry}
                >
                  <Layer
                    id={`route-line-${route.id}`}
                    type="line"
                    paint={{
                      'line-color': routeColor,
                      'line-width': 3,
                      'line-opacity': 0.75
                    }}
                  />
                </Source>
              );
            })}

            {/* Location markers */}
            {locations
              .filter(location => {
                const validLat = location.lat && !isNaN(location.lat) && location.lat >= -90 && location.lat <= 90;
                const validLng = location.lng && !isNaN(location.lng) && location.lng >= -180 && location.lng <= 180;
                if (!validLat || !validLng) {
                  console.warn('[FullscreenMapOverlay] Invalid coordinates:', location);
                  return false;
                }
                return true;
              })
              .map((location, index) => {
                const colorIndex = (location.colorIndex || 0) % COLORS.length;
                const bgColor = COLORS[colorIndex];
                return (
                  <Marker
                    key={location.geoId || `marker-${index}-${location.lat}-${location.lng}`}
                    latitude={location.lat}
                    longitude={location.lng}
                    anchor="center"
                  >
                    <View style={[
                      styles.marker,
                      { backgroundColor: bgColor }
                    ]}>
                      <View style={styles.markerInner} />
                    </View>
                  </Marker>
                );
              })}
          </Map>
        </View>

        {/* Close button with safe area offset */}
        <TouchableOpacity
          style={[
            styles.closeButton,
            {
              top: insets.top + 16,
              right: insets.right + 16
            }
          ]}
          onPress={onClose}
        >
          <View style={styles.closeButtonBackground}>
            <Ionicons name="close" size={24} color="#000" />
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    position: 'relative',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)', // Medium transparency (55%)
    zIndex: 999,
  },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  closeButton: {
    position: 'absolute',
    zIndex: 1001,
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
});
