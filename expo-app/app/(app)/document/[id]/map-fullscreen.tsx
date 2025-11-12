import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { useTripContext } from './_layout';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import bbox from '@turf/bbox';

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
  const { locations, setGeoMarkUpdate } = useTripContext();
  const [routes, setRoutes] = useState<any[]>([]);

  // Bottom sheet state - can show either location or route
  const [selectedLocation, setSelectedLocation] = useState<any | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
  const [sheetView, setSheetView] = useState<'location' | 'route'>('location');

  // Pending transport mode change (before saving)
  const [pendingTransportMode, setPendingTransportMode] = useState<string | null>(null);

  // Waypoints for custom routing
  const [pendingWaypoints, setPendingWaypoints] = useState<Array<{lat: number; lng: number; name?: string}>>([]);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [draggingWaypointIndex, setDraggingWaypointIndex] = useState<number | null>(null);

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

  // Focus camera on a specific route
  const focusOnRoute = useCallback((route: any) => {
    if (!cameraRef.current || !route.geometry) return;

    // Use Turf.js to calculate bounds from the lineString geometry
    const [minLng, minLat, maxLng, maxLat] = bbox(route.geometry);

    // Calculate center point
    const centerLng = (minLng + maxLng) / 2;
    const centerLat = (minLat + maxLat) / 2;

    // Calculate appropriate zoom level based on bounds
    const lngDiff = maxLng - minLng;
    const latDiff = maxLat - minLat;
    const maxDiff = Math.max(lngDiff, latDiff);

    // Zoom levels: smaller diff = higher zoom (more zoomed in)
    // Adjust these values to control zoom sensitivity
    let zoomLevel = 10;
    if (maxDiff < 0.01) zoomLevel = 14;       // ~1km
    else if (maxDiff < 0.05) zoomLevel = 12;  // ~5km
    else if (maxDiff < 0.1) zoomLevel = 11;   // ~10km
    else if (maxDiff < 0.5) zoomLevel = 9;    // ~50km
    else if (maxDiff < 1) zoomLevel = 8;      // ~100km
    else zoomLevel = 7;                       // >100km

    cameraRef.current.setCamera({
      centerCoordinate: [centerLng, centerLat],
      zoomLevel: zoomLevel,
      animationDuration: 1000,
    });
  }, []);

  // Handle route line press
  const handleRoutePress = useCallback((route: any, routeIndex: number, event?: any) => {
    console.log('[MapFullscreen] Route pressed:', {
      routeId: route.id,
      routeIndex,
      isAddingWaypoint,
      hasEvent: !!event,
      hasCoordinates: !!event?.coordinates,
      coordinates: event?.coordinates,
      eventDetails: JSON.stringify(event, null, 2)
    });

    // If in waypoint adding mode, add a waypoint at the press location
    if (isAddingWaypoint && event?.coordinates) {
      const { longitude: lng, latitude: lat } = event.coordinates;
      console.log('[MapFullscreen] Adding waypoint at:', lat, lng);
      setPendingWaypoints(prev => [...prev, { lat, lng }]);
      setIsAddingWaypoint(false);

      // Recalculate route with new waypoint
      setTimeout(() => {
        if (selectedRoute) {
          const currentMode = pendingTransportMode || selectedRoute.toLocation?.transportProfile || 'walking';
          handleTransportModeChange(currentMode);
        }
      }, 100);

      return; // Don't show bottom sheet
    }

    if (isAddingWaypoint && !event?.coordinates) {
      console.log('[MapFullscreen] In adding waypoint mode but no coordinates in event!');
      return; // Don't show bottom sheet
    }

    // If we're currently viewing this route, don't reopen the sheet
    if (sheetView === 'route' && selectedRoute?.routeIndex === routeIndex) {
      console.log('[MapFullscreen] Route already selected, ignoring press');
      return;
    }

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

    // Initialize pendingWaypoints with existing waypoints
    setPendingWaypoints(toLocation.waypoints || []);

    bottomSheetRef.current?.expand();

    // Focus camera on the route
    setTimeout(() => focusOnRoute(enrichedRoute), 100);
  }, [locations, focusOnRoute, isAddingWaypoint, selectedRoute, pendingTransportMode, sheetView]);

  // Navigate to route view from location view
  const handleViewRoute = useCallback(() => {
    if (selectedRoute) {
      setSheetView('route');

      // Initialize pendingWaypoints with existing waypoints
      setPendingWaypoints(selectedRoute.toLocation?.waypoints || []);

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
    setPendingTransportMode(null);
    setPendingWaypoints([]);
    setIsAddingWaypoint(false);
  }, []);

  // Handle add waypoint mode
  const handleAddWaypointMode = useCallback(() => {
    setIsAddingWaypoint(true);
    bottomSheetRef.current?.snapToIndex(0); // Minimize sheet to see map better
  }, []);

  // Handle map press to move waypoint (during drag)
  const handleMapPress = useCallback((event: any) => {
    console.log('[MapFullscreen] Map pressed:', {
      draggingWaypointIndex,
      isAddingWaypoint,
      hasGeometry: !!event?.geometry,
      hasCoordinates: !!event?.geometry?.coordinates,
      geometryCoordinates: event?.geometry?.coordinates,
      event: JSON.stringify(event, null, 2)
    });

    // If we're dragging a waypoint, update its position
    if (draggingWaypointIndex !== null) {
      // Map press events have geometry.coordinates [lng, lat]
      if (!event?.geometry?.coordinates) {
        console.log('[MapFullscreen] No geometry.coordinates in event for dragging');
        return;
      }

      const [lng, lat] = event.geometry.coordinates;
      console.log('[MapFullscreen] Moving waypoint', draggingWaypointIndex, 'to:', lat, lng);

      setPendingWaypoints(prev => {
        const updated = [...prev];
        updated[draggingWaypointIndex] = { lat, lng };
        return updated;
      });

      // Recalculate route with moved waypoint
      setTimeout(() => {
        if (selectedRoute) {
          const currentMode = pendingTransportMode || selectedRoute.toLocation?.transportProfile || 'walking';
          handleTransportModeChange(currentMode);
        }
      }, 100);

      setDraggingWaypointIndex(null);
      return;
    }
  }, [draggingWaypointIndex, selectedRoute, pendingTransportMode, isAddingWaypoint]);

  // Handle start dragging waypoint
  const handleStartDragWaypoint = useCallback((index: number) => {
    console.log('[MapFullscreen] Starting drag for waypoint:', index);
    setDraggingWaypointIndex(index);
    bottomSheetRef.current?.snapToIndex(0); // Minimize sheet to see map better
  }, []);

  // Handle remove waypoint
  const handleRemoveWaypoint = useCallback((index: number) => {
    console.log('[MapFullscreen] Removing waypoint at index:', index);
    setPendingWaypoints(prev => prev.filter((_, i) => i !== index));

    // Recalculate route without this waypoint
    setTimeout(() => {
      if (selectedRoute) {
        const currentMode = pendingTransportMode || selectedRoute.toLocation?.transportProfile || 'walking';
        handleTransportModeChange(currentMode);
      }
    }, 100);
  }, [selectedRoute, pendingTransportMode]);

  // Handle transport mode change
  const handleTransportModeChange = useCallback(async (mode: string) => {
    if (!selectedRoute) return;

    console.log('[MapFullscreen] Changing transport mode to:', mode);
    setPendingTransportMode(mode);

    // Refetch the route with the new transport mode
    const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (!mapboxToken) return;

    const from = selectedRoute.fromLocation;
    const to = selectedRoute.toLocation;

    // Use pendingWaypoints if any, otherwise fall back to existing waypoints
    let coordinates;
    const waypoints = pendingWaypoints.length > 0 ? pendingWaypoints : (to.waypoints || []);

    if (waypoints.length > 0) {
      const waypointCoords = waypoints.map((wp: any) => `${wp.lng},${wp.lat}`).join(';');
      coordinates = `${from.lng},${from.lat};${waypointCoords};${to.lng},${to.lat}`;
    } else {
      coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    }

    const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.routes && data.routes[0]) {
        // Update the route in the routes array
        const newRoute = {
          id: selectedRoute.id,
          geometry: data.routes[0].geometry,
          colorIndex: to.colorIndex || 0,
        };

        setRoutes(prevRoutes => {
          const updatedRoutes = [...prevRoutes];
          updatedRoutes[selectedRoute.routeIndex] = newRoute;
          return updatedRoutes;
        });

        // Update selectedRoute with new geometry
        setSelectedRoute({
          ...selectedRoute,
          geometry: data.routes[0].geometry,
        });

        console.log('[MapFullscreen] Route updated with new transport mode and waypoints:', waypoints.length);
      }
    } catch (error) {
      console.error('[MapFullscreen] Error fetching route:', error);
    }
  }, [selectedRoute, pendingWaypoints]);

  // Handle save route changes
  const handleSaveRouteChanges = useCallback(() => {
    if (!selectedRoute || (!pendingTransportMode && pendingWaypoints.length === 0)) {
      console.log('[MapFullscreen] No changes to save');
      handleBackToLocation();
      return;
    }

    console.log('[MapFullscreen] Saving route changes:', {
      geoId: selectedRoute.toLocation.geoId,
      oldTransportProfile: selectedRoute.toLocation?.transportProfile,
      newTransportProfile: pendingTransportMode,
      waypoints: pendingWaypoints,
    });

    // Build updated attributes
    const updatedAttrs: any = {};
    if (pendingTransportMode) {
      updatedAttrs.transportProfile = pendingTransportMode;
    }
    if (pendingWaypoints.length > 0) {
      updatedAttrs.waypoints = pendingWaypoints;
    }

    // Use setGeoMarkUpdate to update the document
    setGeoMarkUpdate({
      geoId: selectedRoute.toLocation.geoId,
      updatedAttrs,
    });

    console.log('[MapFullscreen] geoMarkUpdate set, clearing pending changes');
    setPendingTransportMode(null);
    setPendingWaypoints([]);
    console.log('[MapFullscreen] Navigating back to location view');
    handleBackToLocation();
  }, [selectedRoute, pendingTransportMode, pendingWaypoints, setGeoMarkUpdate, handleBackToLocation]);

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
        onPress={handleMapPress}
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
          const isFocused = sheetView === 'route' && selectedRoute?.routeIndex === routeIndex;
          const isOtherRoute = sheetView === 'route' && selectedRoute?.routeIndex !== routeIndex;

          return (
            <Mapbox.ShapeSource
              key={route.id}
              id={route.id}
              shape={route.geometry}
              onPress={(event) => handleRoutePress(route, routeIndex, event)}
            >
              {/* Invisible wider hit area for easier tapping */}
              <Mapbox.LineLayer
                id={`${route.id}-hit-area`}
                style={{
                  lineColor: 'transparent',
                  lineWidth: isAddingWaypoint ? 30 : 15, // Much wider when adding waypoints
                  lineOpacity: 1,
                }}
              />
              {/* Visible route line */}
              <Mapbox.LineLayer
                id={`${route.id}-line`}
                style={{
                  lineColor: routeColor,
                  lineWidth: isFocused ? 6 : 5,
                  lineOpacity: isOtherRoute ? 0.2 : 0.75,
                }}
              />
            </Mapbox.ShapeSource>
          );
        })}

        {/* Waypoint markers */}
        {pendingWaypoints.map((waypoint, index) => (
          <React.Fragment key={`waypoint-${index}`}>
            {/* Invisible PointAnnotation for drag handling */}
            <Mapbox.PointAnnotation
              draggable={true}
              id={`waypoint-draggable-${index}`}
              coordinate={[waypoint.lng, waypoint.lat]}
              anchor={{ x: 0.5, y: 0.5 }}
              onDragStart={() => {
                console.log('[MapFullscreen] Drag started for waypoint:', index);
                setDraggingWaypointIndex(index);
              }}
              onDrag={(event) => {
                const [lng, lat] = event.geometry.coordinates;
                setPendingWaypoints(prev => {
                  const updated = [...prev];
                  updated[index] = { lat, lng };
                  return updated;
                });
              }}
              onDragEnd={(event) => {
                const [lng, lat] = event.geometry.coordinates;
                console.log('[MapFullscreen] Drag ended for waypoint:', index, 'at:', lat, lng);
                setPendingWaypoints(prev => {
                  const updated = [...prev];
                  updated[index] = { lat, lng };
                  return updated;
                });
                setDraggingWaypointIndex(null);

                // Recalculate route
                setTimeout(() => {
                  if (selectedRoute) {
                    const currentMode = pendingTransportMode || selectedRoute.toLocation?.transportProfile || 'walking';
                    handleTransportModeChange(currentMode);
                  }
                }, 100);
              }}
            >
              {/* Invisible content */}
              <View style={{ width: 28, height: 28, opacity: 0 }} />
            </Mapbox.PointAnnotation>

            {/* Visible MarkerView */}
            <Mapbox.MarkerView
              id={`waypoint-visual-${index}`}
              coordinate={[waypoint.lng, waypoint.lat]}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={[
                styles.waypointMarker,
                draggingWaypointIndex === index && styles.waypointMarkerDragging
              ]}>
                <Text style={styles.waypointNumber}>{index + 1}</Text>
              </View>
            </Mapbox.MarkerView>
          </React.Fragment>
        ))}

        {/* Location markers */}
        {locations.map((location, index) => {
          const colorIndex = (location.colorIndex || 0) % COLORS.length;
          const bgColor = COLORS[colorIndex];

          // Determine if this marker should be muted
          const isPartOfFocusedRoute = sheetView === 'route' && selectedRoute && (
            index === selectedRoute.routeIndex || // From location
            index === selectedRoute.routeIndex + 1 // To location
          );
          const shouldMute = sheetView === 'route' && !isPartOfFocusedRoute;

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
                    {
                      backgroundColor: bgColor,
                      opacity: shouldMute ? 0.3 : 1.0
                    }
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
                    {['walking', 'driving', 'cycling'].map((mode) => {
                      const currentMode = pendingTransportMode || selectedRoute.toLocation?.transportProfile;
                      const isActive = currentMode === mode;

                      return (
                        <TouchableOpacity
                          key={mode}
                          style={[
                            styles.transportOption,
                            isActive && styles.transportOptionActive
                          ]}
                          onPress={() => handleTransportModeChange(mode)}
                        >
                          <Ionicons
                            name={mode === 'walking' ? 'walk' : mode === 'driving' ? 'car' : 'bicycle'}
                            size={24}
                            color={isActive ? '#007AFF' : '#666'}
                          />
                          <Text style={[
                            styles.transportOptionText,
                            isActive && styles.transportOptionTextActive
                          ]}>
                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Waypoints Section */}
                <View style={styles.sheetSection}>
                  <View style={styles.sheetRow}>
                    <Ionicons name="location-outline" size={20} color="#666" />
                    <Text style={styles.sheetLabel}>Waypoints</Text>
                  </View>

                  {/* List of waypoints */}
                  {pendingWaypoints.length > 0 ? (
                    <View style={styles.waypointsList}>
                      {pendingWaypoints.map((waypoint, index) => (
                        <View key={index} style={styles.waypointItem}>
                          <View style={styles.waypointInfo}>
                            <View style={styles.waypointNumberBadge}>
                              <Text style={styles.waypointNumberText}>{index + 1}</Text>
                            </View>
                            <Text style={styles.waypointCoords}>
                              {waypoint.lat.toFixed(5)}, {waypoint.lng.toFixed(5)}
                            </Text>
                          </View>
                          <View style={styles.waypointActions}>
                            <TouchableOpacity
                              onPress={() => handleStartDragWaypoint(index)}
                              style={styles.waypointActionButton}
                            >
                              <Ionicons name="move" size={20} color="#007AFF" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleRemoveWaypoint(index)}
                              style={styles.waypointActionButton}
                            >
                              <Ionicons name="close-circle" size={20} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Instructions */}
                  {isAddingWaypoint ? (
                    <View style={styles.instructionBox}>
                      <Ionicons name="information-circle" size={20} color="#007AFF" />
                      <Text style={styles.instructionText}>
                        Tap on the route line to add a waypoint
                      </Text>
                    </View>
                  ) : draggingWaypointIndex !== null ? (
                    <View style={styles.instructionBox}>
                      <Ionicons name="information-circle" size={20} color="#007AFF" />
                      <Text style={styles.instructionText}>
                        Dragging waypoint {draggingWaypointIndex + 1}...
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.instructionBox}>
                      <Ionicons name="information-circle-outline" size={20} color="#666" />
                      <Text style={[styles.instructionText, { color: '#666' }]}>
                        Tap route to add • Drag waypoints to move
                      </Text>
                    </View>
                  )}

                  {/* Add waypoint button */}
                  <TouchableOpacity
                    style={[
                      styles.sheetButton,
                      styles.addWaypointButton,
                      isAddingWaypoint && styles.addWaypointButtonActive
                    ]}
                    onPress={handleAddWaypointMode}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={isAddingWaypoint ? '#666' : '#007AFF'} />
                    <Text style={[styles.sheetButtonText, isAddingWaypoint && { color: '#666' }]}>
                      {isAddingWaypoint ? 'Adding waypoint...' : 'Add Waypoint'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Save button */}
                <TouchableOpacity
                  style={[styles.sheetButton, styles.saveButton]}
                  onPress={handleSaveRouteChanges}
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
  waypointMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F59E0B',
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  waypointNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
  },
  waypointsList: {
    marginTop: 8,
    marginLeft: 28,
    gap: 8,
  },
  waypointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  waypointInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  waypointNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'white',
  },
  waypointCoords: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'monospace',
  },
  waypointActions: {
    flexDirection: 'row',
    gap: 8,
  },
  waypointActionButton: {
    padding: 4,
  },
  waypointRemoveButton: {
    padding: 4,
  },
  addWaypointButton: {
    marginTop: 8,
    marginLeft: 28,
    backgroundColor: '#f0f8ff',
  },
  addWaypointButtonActive: {
    backgroundColor: '#e0e0e0',
  },
  waypointMarkerDragging: {
    opacity: 0.6,
    transform: [{ scale: 1.2 }],
  },
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginLeft: 28,
    padding: 10,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1E7FF',
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: '#007AFF',
    lineHeight: 18,
  },
});
