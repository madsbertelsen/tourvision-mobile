import React from 'react';
import { View, StyleSheet } from 'react-native';

// Import DOM component - works on all platforms with expo-dom
const MapViewSimpleDOM = React.lazy(() => import('./dom/map-view-simple'));

interface MapViewSimpleWrapperProps {
  locations?: Location[];
  height?: number | string;
  center?: { lat: number; lng: number };
  zoom?: number;
}

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

export function MapViewSimpleWrapper({
  locations = [],
  height = 400,
  center = { lat: 0, lng: 0 },
  zoom = 2,
}: MapViewSimpleWrapperProps) {

  // If height is a string percentage, use flex: 1 to fill parent
  const containerStyle = height === '100%'
    ? [styles.container, styles.fullHeight]
    : [styles.container, { height }];

  return (
    <View style={containerStyle}>
      <React.Suspense fallback={<View style={styles.loading} />}>
        <MapViewSimpleDOM
          locations={locations}
          center={center}
          zoom={zoom}
          style={{ width: '100%', height: '100%' }}
        />
      </React.Suspense>
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
    height: '100%',
  },
  loading: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
});