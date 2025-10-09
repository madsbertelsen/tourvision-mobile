import type { RouteWithMetadata } from '@/contexts/MockContext';
import { useMockContext } from '@/contexts/MockContext';
import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

// Import DOM component - works on all platforms with expo-dom
const MapViewSimpleDOM = React.lazy(() => import('./dom/map-view-simple'));

interface MapViewSimpleWrapperProps {
  locations?: Location[];
  routes?: RouteWithMetadata[];
  height?: number | string;
  center?: { lat: number; lng: number };
  zoom?: number;
  isEditMode?: boolean;
  onRouteWaypointUpdate?: (routeId: string, waypoint: { lat: number; lng: number }, segmentIndex: number) => void;
  onRouteWaypointRemove?: (routeId: string, waypointIndex: number) => void;
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
  routes: propRoutes,
  height = 400,
  center = { lat: 0, lng: 0 },
  zoom = 2,
  isEditMode = false,
  onRouteWaypointUpdate,
  onRouteWaypointRemove,
}: MapViewSimpleWrapperProps) {

  // Get focusedLocation, followMode, routes, showItinerary, mapCenter, mapZoom, and modal state from context
  let focusedLocation = null;
  let followMode = false;
  let allRoutes: RouteWithMetadata[] = propRoutes || [];
  let selectedRoute = null;
  let showItinerary = false;
  let mapCenter = center;
  let mapZoom = zoom;
  let selectedLocationModal = null;
  let setSelectedLocationModal: ((location: Location | null) => void) | null = null;
  try {
    const context = useMockContext();
    focusedLocation = context.focusedLocation;
    followMode = context.followMode;
    // Use prop routes if provided, otherwise use context routes
    allRoutes = propRoutes || context.routes;
    selectedRoute = context.selectedRoute;
    showItinerary = context.showItinerary;
    mapCenter = context.mapCenter;
    mapZoom = context.mapZoom;
    selectedLocationModal = context.selectedLocationModal;
    setSelectedLocationModal = context.setSelectedLocationModal;
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
    : [styles.container, { height: typeof height === 'number' ? height : undefined }];

  // For DOM component, use explicit pixel height if provided
  const domStyle = height === '100%'
    ? { width: '100%', height: '100%' }
    : { width: '100%', height: typeof height === 'number' ? `${height}px` : '400px' };

  return (
    <View style={containerStyle}>
      <React.Suspense fallback={
        <View style={styles.loading}>
          {/* Map loading silently */}
        </View>
      }>
        <MapViewSimpleDOM
          locations={locations}
          center={mapCenter}
          zoom={mapZoom}
          focusedLocation={focusedLocation}
          followMode={followMode}
          routes={visibleRoutes}
          selectedRoute={selectedRoute}
          showItinerary={showItinerary}
          selectedLocationModal={selectedLocationModal}
          onCloseModal={() => setSelectedLocationModal && setSelectedLocationModal(null)}
          isEditMode={isEditMode}
          onRouteWaypointUpdate={onRouteWaypointUpdate}
          onRouteWaypointRemove={onRouteWaypointRemove}
          style={domStyle}
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
  },
  loading: {
    flex: 1,
  },
});