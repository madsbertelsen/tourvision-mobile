import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useMapContext } from '../_layout';
import { useDocumentNextContext } from '../../_layout';

type TransportMode = 'walking' | 'driving' | 'cycling';

export default function TransportConfigRoute() {
  const { locationId } = useLocalSearchParams();
  const router = useRouter();
  const { documentId, setGeoMarkUpdate } = useDocumentNextContext();
  const {
    locations,
    routes,
    updateRoute,
    bottomSheetRef,
    focusOnRoute,
    isAddingWaypoint,
    setIsAddingWaypoint,
    pendingWaypoints,
    setPendingWaypoints,
    setSheetHeaderInfo
  } = useMapContext();

  // Find the destination location
  const destinationLocation = locations.find(loc => loc.geoId === locationId);

  // State for selected source location
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [pendingTransportMode, setPendingTransportMode] = useState<TransportMode>('driving');
  const [isUpdating, setIsUpdating] = useState(false);

  // Find existing route if any
  const existingRoute = selectedSourceId
    ? routes.find(r => r.fromLocationId === selectedSourceId && r.toLocationId === locationId)
    : null;

  useEffect(() => {
    // Snap bottom sheet to 50% (index 1)
    bottomSheetRef.current?.snapToIndex(1);

    // Set sheet header info
    if (destinationLocation) {
      setSheetHeaderInfo({
        title: 'Transport Configuration',
        colorDot: destinationLocation.color,
        onBack: () => router.back(),
      });
    }

    // If there's an existing route to this location, pre-select the source
    const existingRouteToHere = routes.find(r => r.toLocationId === locationId);
    if (existingRouteToHere) {
      setSelectedSourceId(existingRouteToHere.fromLocationId);
      setPendingTransportMode(existingRouteToHere.transportMode);
      setPendingWaypoints(existingRouteToHere.waypoints || []);

      // Focus map on the existing route
      focusOnRoute(existingRouteToHere);
    }

    // Cleanup on unmount
    return () => {
      setIsAddingWaypoint(false);
      setPendingWaypoints([]);
      setSheetHeaderInfo(null);
    };
  }, [locationId, routes, bottomSheetRef, setIsAddingWaypoint, focusOnRoute, destinationLocation, setSheetHeaderInfo, router, setPendingWaypoints]);

  // Refetch route when waypoints change
  useEffect(() => {
    if (selectedSourceId && pendingTransportMode) {
      handleTransportModeChange(pendingTransportMode);
    }
  }, [pendingWaypoints]);

  const handleBackToLocation = () => {
    router.back();
  };

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSourceId(sourceId);

    // Check if there's already a route for this pair
    const existing = routes.find(r =>
      r.fromLocationId === sourceId && r.toLocationId === locationId
    );

    if (existing) {
      setPendingTransportMode(existing.transportMode);
      setPendingWaypoints(existing.waypoints || []);
    } else {
      // Reset to defaults and trigger route fetch
      const defaultMode = 'driving';
      setPendingTransportMode(defaultMode);
      setPendingWaypoints([]);

      // Automatically fetch route with default mode
      handleTransportModeChange(defaultMode);
    }
  };

  const handleTransportModeChange = async (mode: TransportMode) => {
    setPendingTransportMode(mode);

    // Fetch route with new mode if source is selected
    if (selectedSourceId && destinationLocation) {
      const sourceLocation = locations.find(loc => loc.geoId === selectedSourceId);
      if (!sourceLocation) return;

      setIsUpdating(true);
      try {
        const profile = mode === 'walking' ? 'walking' :
                       mode === 'cycling' ? 'cycling' :
                       'driving-traffic';

        // Construct waypoints query if they exist
        let waypointsQuery = '';
        if (pendingWaypoints.length > 0) {
          const waypointCoords = pendingWaypoints
            .map(wp => `${wp.lng},${wp.lat}`)
            .join(';');
          waypointsQuery = `;${waypointCoords}`;
        }

        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${sourceLocation.lng},${sourceLocation.lat}${waypointsQuery};${destinationLocation.lng},${destinationLocation.lat}?geometries=geojson&overview=full&access_token=${process.env.EXPO_PUBLIC_MAPBOX_TOKEN}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const routeId = `route-${selectedSourceId}-${locationId}`;

          // Update or create route
          await updateRoute(routeId, {
            transportMode: mode,
            geometry: route.geometry,
            distance: route.distance,
            duration: route.duration,
            waypoints: pendingWaypoints,
          });

          // Focus on updated route
          focusOnRoute({
            id: routeId,
            fromLocationId: selectedSourceId,
            toLocationId: locationId as string,
            transportMode: mode,
            geometry: route.geometry,
            distance: route.distance,
            duration: route.duration,
            waypoints: pendingWaypoints,
            color: destinationLocation.color || '#3B82F6',
          });

          // Auto-save geo-mark attributes
          setGeoMarkUpdate({
            geoId: destinationLocation.geoId,
            updatedAttrs: {
              transportProfile: mode,
              transportFrom: selectedSourceId,
              waypoints: pendingWaypoints.length > 0 ? pendingWaypoints : null,
            }
          });
        }
      } catch (error) {
        console.error('Error updating route:', error);
      } finally {
        setIsUpdating(false);
      }
    }
  };

  const handleAddWaypoint = () => {
    // Enter waypoint adding mode
    setIsAddingWaypoint(true);
    // Minimize sheet to allow map interaction
    bottomSheetRef.current?.snapToIndex(0);
  };

  const handleRemoveWaypoint = (index: number) => {
    setPendingWaypoints(prev => prev.filter((_, i) => i !== index));
  };

  if (!destinationLocation) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Location not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleBackToLocation}>
          <Ionicons name="chevron-back" size={20} color="#007AFF" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <BottomSheetScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Destination info */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="location" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Destination</Text>
        </View>
        <Text style={styles.sectionValue}>
          {destinationLocation.displayText || destinationLocation.placeName}
        </Text>
      </View>

      {/* Source location selector */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="location-outline" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Travel From</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locationScroll}>
          <View style={styles.locationOptions}>
            {locations
              .filter(loc => loc.geoId !== locationId)
              .map(location => (
                <TouchableOpacity
                  key={location.geoId}
                  style={[
                    styles.locationOption,
                    selectedSourceId === location.geoId && styles.locationOptionActive
                  ]}
                  onPress={() => handleSourceSelect(location.geoId)}
                >
                  <View style={[
                    styles.locationDot,
                    { backgroundColor: location.color }
                  ]} />
                  <Text style={[
                    styles.locationOptionText,
                    selectedSourceId === location.geoId && styles.locationOptionTextActive
                  ]}>
                    {location.displayText || location.placeName}
                  </Text>
                </TouchableOpacity>
              ))}
          </View>
        </ScrollView>
      </View>

      {/* Transport mode selector - only show if source selected */}
      {selectedSourceId && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Ionicons name="car-outline" size={20} color="#6B7280" />
              <Text style={styles.sectionLabel}>Transportation Method</Text>
            </View>
            <View style={styles.transportOptions}>
              {(['walking', 'driving', 'cycling'] as TransportMode[]).map((mode) => {
                const isActive = pendingTransportMode === mode;

                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.transportOption,
                      isActive && styles.transportOptionActive
                    ]}
                    onPress={() => handleTransportModeChange(mode)}
                    disabled={isUpdating}
                  >
                    <Ionicons
                      name={mode === 'walking' ? 'walk' : mode === 'driving' ? 'car' : 'bicycle'}
                      size={24}
                      color={isActive ? '#007AFF' : '#6B7280'}
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

          {/* Route statistics */}
          {existingRoute && !isUpdating && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Ionicons name="analytics-outline" size={20} color="#6B7280" />
                <Text style={styles.sectionLabel}>Route Details</Text>
              </View>
              <View style={styles.routeStats}>
                <View style={styles.routeStat}>
                  <Ionicons name="time-outline" size={16} color="#6B7280" />
                  <Text style={styles.routeStatLabel}>Duration</Text>
                  <Text style={styles.routeStatValue}>
                    {Math.round(existingRoute.duration / 60)} min
                  </Text>
                </View>
                <View style={styles.routeStat}>
                  <Ionicons name="resize-outline" size={16} color="#6B7280" />
                  <Text style={styles.routeStatLabel}>Distance</Text>
                  <Text style={styles.routeStatValue}>
                    {(existingRoute.distance / 1000).toFixed(1)} km
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Loading indicator */}
          {isUpdating && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Updating route...</Text>
            </View>
          )}

          {/* Waypoints section */}
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Ionicons name="flag-outline" size={20} color="#6B7280" />
              <Text style={styles.sectionLabel}>Waypoints</Text>
            </View>
            {pendingWaypoints.length > 0 ? (
              pendingWaypoints.map((wp, index) => (
                <View key={index} style={styles.waypointItem}>
                  <Text style={styles.waypointText}>
                    {index + 1}. {wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveWaypoint(index)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={styles.noWaypointsText}>No waypoints added</Text>
            )}

            {isAddingWaypoint ? (
              <View style={styles.addingWaypointInfo}>
                <Ionicons name="information-circle" size={20} color="#F59E0B" />
                <Text style={styles.addingWaypointText}>
                  Tap on the route line to add a waypoint
                </Text>
                <TouchableOpacity onPress={() => setIsAddingWaypoint(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addWaypointButton}
                onPress={handleAddWaypoint}
              >
                <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
                <Text style={styles.addWaypointText}>Add Waypoint</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,  // Extra space at bottom for scrolling past content
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButtonInline: {
    marginRight: 12,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 8,
  },
  sectionValue: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 22,
  },
  locationScroll: {
    marginTop: 8,
  },
  locationOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  locationOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#007AFF',
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationOptionText: {
    fontSize: 14,
    color: '#6B7280',
  },
  locationOptionTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  transportOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  transportOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  transportOptionActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#007AFF',
  },
  transportOptionText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  transportOptionTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  routeStats: {
    flexDirection: 'row',
    gap: 16,
  },
  routeStat: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    gap: 4,
  },
  routeStatLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  routeStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  waypointItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  waypointText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  noWaypointsText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  addWaypointButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
  },
  addWaypointText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  addingWaypointInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  addingWaypointText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
  },
  cancelText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
});