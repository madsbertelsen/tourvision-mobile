import type { RouteWithMetadata } from '@/contexts/MockContext';
import { useMockContext } from '@/contexts/MockContext';
import React from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';

// Import both native and DOM components
const MapViewSimpleDOM = React.lazy(() => import('./dom/map-view-simple'));
const MapViewNative = React.lazy(() => import('./MapViewNative'));

interface MapViewSimpleWrapperProps {
  locations?: Location[];
  routes?: RouteWithMetadata[];
  height?: number | string;
  center?: { lat: number; lng: number };
  zoom?: number;
  focusedLocation?: { id: string; name: string; lat: number; lng: number } | null;
  isEditMode?: boolean;
  onRouteWaypointUpdate?: (routeId: string, waypoint: { lat: number; lng: number }, segmentIndex: number) => void;
  onRouteWaypointRemove?: (routeId: string, waypointIndex: number) => void;
  bottomPadding?: number;
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
  focusedLocation: propFocusedLocation,
  isEditMode = false,
  onRouteWaypointUpdate,
  onRouteWaypointRemove,
  bottomPadding = 0,
}: MapViewSimpleWrapperProps) {

  // Get followMode, routes, showItinerary, mapCenter, mapZoom, and modal state from context
  // Use propFocusedLocation if provided, otherwise try to get from context
  let focusedLocation = propFocusedLocation !== undefined ? propFocusedLocation : null;
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
    // Only use context focusedLocation if no prop was provided
    if (propFocusedLocation === undefined) {
      focusedLocation = context.focusedLocation;
    }
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

  // Use native map on iOS/Android, DOM component on web
  const isNativePlatform = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    <View style={containerStyle}>
      <React.Suspense fallback={
        <View style={styles.loading}>
          {/* Map loading silently */}
        </View>
      }>
        {isNativePlatform ? (
          <MapViewNative
            locations={locations}
            routes={visibleRoutes}
            height={height}
            center={mapCenter}
            zoom={mapZoom}
            focusedLocation={focusedLocation}
            isEditMode={isEditMode}
            onRouteWaypointUpdate={onRouteWaypointUpdate}
            onRouteWaypointRemove={onRouteWaypointRemove}
            bottomPadding={bottomPadding}
            style={containerStyle}
          />
        ) : (
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
            bottomPadding={bottomPadding}
            style={domStyle}
          />
        )}
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