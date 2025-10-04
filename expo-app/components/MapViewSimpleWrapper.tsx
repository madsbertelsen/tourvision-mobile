import type { RouteWithMetadata } from '@/contexts/MockContext';
import { useMockContext } from '@/contexts/MockContext';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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
  photoName?: string;
}

export function MapViewSimpleWrapper({
  locations = [],
  height = 400,
  center = { lat: 0, lng: 0 },
  zoom = 2,
}: MapViewSimpleWrapperProps) {
  // console.log('[MapViewSimpleWrapper] Received locations:', locations);

  // Get focusedLocation, followMode, routes, showItinerary, mapCenter, and mapZoom from context
  let focusedLocation = null;
  let followMode = false;
  let allRoutes: RouteWithMetadata[] = [];
  let selectedRoute = null;
  let showItinerary = false;
  let mapCenter = center;
  let mapZoom = zoom;
  try {
    const context = useMockContext();
    focusedLocation = context.focusedLocation;
    followMode = context.followMode;
    allRoutes = context.routes;
    selectedRoute = context.selectedRoute;
    showItinerary = context.showItinerary;
    mapCenter = context.mapCenter;
    mapZoom = context.mapZoom;
  } catch (error) {
    // Context not available, use prop defaults
  }

  // Filter routes to only show those connecting currently visible locations
  const visibleLocationIds = new Set(locations.map(loc => loc.id));

  // Only show routes where both endpoints are visible
  const visibleRoutes = allRoutes.filter(route => {
    // Check if both the from and to locations are in the visible set
    const fromVisible = visibleLocationIds.has(route.fromId);
    const toVisible = visibleLocationIds.has(route.toId);

    return fromVisible && toVisible;
  });

  // console.log('[MapViewSimpleWrapper] Filtering routes:', {
  //   totalRoutes: allRoutes.length,
  //   visibleRoutes: visibleRoutes.length,
  //   visibleLocationIds: Array.from(visibleLocationIds)
  // });

  // If height is a string percentage, use flex: 1 to fill parent
  const containerStyle = height === '100%'
    ? [styles.container, styles.fullHeight]
    : [styles.container, { height }];

  return (
    <View style={{ width: '100%', overflow: 'hidden' ,height: "100%"}}>
      <React.Suspense fallback={<View style={styles.loading} />}>
        <MapViewSimpleDOM
          locations={locations}
          center={mapCenter}
          zoom={mapZoom}
          focusedLocation={focusedLocation}
          followMode={followMode}
          routes={visibleRoutes}
          selectedRoute={selectedRoute}
          showItinerary={showItinerary}
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