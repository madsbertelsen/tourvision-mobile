import React, { useRef, useState, useEffect, memo } from 'react';
import { StyleSheet, View } from 'react-native';
// @ts-ignore
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Marker, NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl/mapbox';

interface Location {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex?: number;
  transportFrom?: string | null;
  transportProfile?: string | null;
  waypoints?: Array<{lat: number, lng: number}> | null;
}

interface DocumentSplitMapProps {
  locations: Location[];
}

// Color array starting with Purple (to match expected first location color)
const COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'
  // Purple,   Blue,     Green,    Orange,   Red
];

const DocumentSplitMap = memo(function DocumentSplitMap({ locations }: DocumentSplitMapProps) {
  const mapRef = useRef<any>(null);
  const [routes, setRoutes] = useState<any[]>([]);

  // Fetch routes between consecutive locations (only when transportation is defined)
  useEffect(() => {
    const fetchRoutes = async () => {
      if (locations.length < 2) {
        setRoutes([]);
        return;
      }

      const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
      const routePromises = [];

      // Only fetch routes for locations that have transportFrom defined
      for (let i = 0; i < locations.length; i++) {
        const to = locations[i];

        // Skip if no transport connection is defined
        if (!to.transportFrom) {
          continue;
        }

        // Find the "from" location by geoId
        const from = locations.find(loc => loc.geoId === to.transportFrom);
        if (!from) {
          console.warn(`Transport from location ${to.transportFrom} not found for ${to.placeName}`);
          continue;
        }

        // Use waypoints if defined, otherwise direct route
        let coordinates;
        if (to.waypoints && to.waypoints.length > 0) {
          // Include waypoints in the route
          const waypointCoords = to.waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
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
                  geometry: data.routes[0].geometry,
                  from: from.geoId,
                  to: to.geoId,
                  colorIndex: from.colorIndex || 0
                };
              }
              return null;
            })
            .catch(err => {
              console.error('Error fetching route:', err);
              return null;
            })
        );
      }

      const fetchedRoutes = await Promise.all(routePromises);
      setRoutes(fetchedRoutes.filter(r => r !== null));
    };

    fetchRoutes();
  }, [locations]);

  // Calculate initial view state to fit all locations
  const getInitialViewState = () => {
    if (locations.length === 0) {
      return {
        latitude: 0,
        longitude: 0,
        zoom: 1
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

  const [viewState, setViewState] = useState(getInitialViewState());

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
        {/* Navigation controls */}
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />

        {/* Route lines */}
        {routes.map((route, index) => {
          const routeColor = COLORS[(route.colorIndex || 0) % 5];
          return (
            <Source
              key={`route-${index}`}
              id={`route-${index}`}
              type="geojson"
              data={route.geometry}
            >
              <Layer
                id={`route-line-${index}`}
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
        {locations.map((location, index) => (
          <Marker
            key={location.geoId || `marker-${index}-${location.lat}-${location.lng}`}
            latitude={location.lat}
            longitude={location.lng}
            anchor="center"
          >
            <View style={[
              styles.marker,
              { backgroundColor: COLORS[(location.colorIndex || 0) % 5] }
            ]}>
              <View style={styles.markerInner} />
            </View>
          </Marker>
        ))}
      </Map>
    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if locations actually changed
  if (prevProps.locations.length !== nextProps.locations.length) {
    return false; // Re-render
  }

  // Check if any location changed
  for (let i = 0; i < prevProps.locations.length; i++) {
    const prev = prevProps.locations[i];
    const next = nextProps.locations[i];

    if (prev.geoId !== next.geoId ||
        prev.lat !== next.lat ||
        prev.lng !== next.lng ||
        prev.colorIndex !== next.colorIndex) {
      return false; // Re-render
    }
  }

  return true; // Skip re-render
});

export default DocumentSplitMap;

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
