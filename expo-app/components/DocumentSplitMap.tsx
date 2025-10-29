import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
// @ts-ignore
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Marker, NavigationControl, GeolocateControl } from 'react-map-gl/mapbox';

interface Location {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex?: number;
}

interface DocumentSplitMapProps {
  locations: Location[];
}

const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

export default function DocumentSplitMap({ locations }: DocumentSplitMapProps) {
  const mapRef = useRef<any>(null);

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

        {/* Location markers */}
        {locations.map((location) => (
          <Marker
            key={location.geoId}
            latitude={location.lat}
            longitude={location.lng}
            anchor="center"
          >
            <View style={[
              styles.marker,
              { backgroundColor: COLORS[(location.colorIndex || 0) % COLORS.length] }
            ]}>
              <View style={styles.markerInner} />
            </View>
          </Marker>
        ))}
      </Map>
    </View>
  );
}

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
