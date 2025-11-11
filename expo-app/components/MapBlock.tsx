import React, { useRef, useState, useEffect, memo } from 'react';
import { StyleSheet, View } from 'react-native';
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
  transportFrom?: string | null;
  transportProfile?: string | null;
  waypoints?: Array<{lat: number, lng: number}> | null;
}

interface MapBlockProps {
  locations: GeoMarkLocation[];
  height?: number;
}

// Color array - Blue first to match location marker colors (same as DocumentSplitMap)
const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const MapBlock = memo(function MapBlock({
  locations,
  height = 400,
}: MapBlockProps) {
  const mapRef = useRef<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);

  // Calculate initial view state to fit all locations
  const getInitialViewState = () => {
    if (locations.length === 0) {
      return {
        latitude: 0,
        longitude: 0,
        zoom: 2
      };
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

    // Calculate zoom based on bounds
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

  const [viewState, setViewState] = useState(() => getInitialViewState());

  // Fetch routes for locations with transport configured
  useEffect(() => {
    const fetchRoutes = async () => {
      console.log('[MapBlock] Starting route fetch for locations:', locations);

      if (locations.length < 2) {
        console.log('[MapBlock] Not enough locations for routes (need at least 2)');
        setRoutes([]);
        return;
      }

      const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
      if (!mapboxToken) {
        console.error('[MapBlock] No Mapbox token found');
        setRoutes([]);
        return;
      }

      const routePromises = [];

      // Create routes between ALL consecutive locations (matching DocumentSplitMap pattern)
      for (let i = 1; i < locations.length; i++) {
        const from = locations[i - 1];
        const to = locations[i];
        console.log(`[MapBlock] Creating route from ${from.placeName} to ${to.placeName}`);

        // Use waypoints if defined, otherwise direct route
        let coordinates;
        if (to.waypoints && to.waypoints.length > 0) {
          // Include waypoints in the route
          const waypointCoords = to.waypoints.map((wp: {lng: number, lat: number}) => `${wp.lng},${wp.lat}`).join(';');
          coordinates = `${from.lng},${from.lat};${waypointCoords};${to.lng},${to.lat}`;
        } else {
          coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
        }

        // Determine transport profile (default to walking)
        const profile = to.transportProfile || 'walking';
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

        routePromises.push(
          fetch(url)
            .then(res => res.json())
            .then(data => {
              if (data.routes && data.routes[0]) {
                return {
                  id: `route-${from.geoId}-${to.geoId}`,
                  fromLocationId: from.geoId,
                  toLocationId: to.geoId,
                  geometry: data.routes[0].geometry,
                  from: from.geoId,
                  to: to.geoId,
                  colorIndex: to.colorIndex || 0,
                  waypoints: to.waypoints,
                  transportProfile: profile,
                };
              }
              return null;
            })
            .catch(err => {
              console.error('[MapBlock] Error fetching route:', err);
              return null;
            })
        );
      }

      const fetchedRoutes = await Promise.all(routePromises);
      const validRoutes = fetchedRoutes.filter(r => r !== null);
      console.log('[MapBlock] Fetched routes:', validRoutes);
      setRoutes(validRoutes);
    };

    fetchRoutes();
  }, [locations]);

  return (
    <View style={[styles.container, { height }]}>
      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
        {...viewState}
        onMove={(evt: any) => setViewState(evt.viewState)}
      >
        {/* Route rendering using Mapbox layers */}
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
            // Filter out invalid coordinates
            const validLat = location.lat && !isNaN(location.lat) && location.lat >= -90 && location.lat <= 90;
            const validLng = location.lng && !isNaN(location.lng) && location.lng >= -180 && location.lng <= 180;
            if (!validLat || !validLng) {
              console.warn('[MapBlock] Invalid location coordinates:', location);
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
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 32,
    marginBottom: 16,
    backgroundColor: '#f3f4f6',
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

export default MapBlock;
