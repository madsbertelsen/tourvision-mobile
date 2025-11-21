import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useDocumentNextWebRTCContext } from '../_layout';

type TransportMode = 'walking' | 'driving' | 'cycling';

// Define color array (same as in ProseMirror)
const COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

export default function TransportConfigRoute() {
  const { locationId } = useLocalSearchParams();
  const router = useRouter();
  const { documentId, locations, bottomSheetRef, setSheetHeaderInfo, setGeoMarkUpdate } = useDocumentNextWebRTCContext();

  // Find the destination location
  const destinationLocation = locations.find(loc => loc.geoId === locationId);

  // State for selected source location
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [pendingTransportMode, setPendingTransportMode] = useState<TransportMode>('driving');
  const [isUpdating, setIsUpdating] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    // Snap bottom sheet to 50% (index 0)
    bottomSheetRef.current?.snapToIndex(0);

    // Set sheet header info
    if (destinationLocation) {
      const locationColor = COLORS[(destinationLocation.colorIndex ?? 0) % COLORS.length];

      setSheetHeaderInfo({
        title: 'Transport Configuration',
        colorDot: locationColor,
        onBack: () => router.back(),
      });
    }

    // If there's an existing transport config, pre-select it
    if (destinationLocation?.transportFrom) {
      setSelectedSourceId(destinationLocation.transportFrom);
      setPendingTransportMode((destinationLocation.transportMode as TransportMode) || 'driving');
    }

    // Cleanup on unmount
    return () => {
      setSheetHeaderInfo(null);
    };
  }, [locationId, destinationLocation, bottomSheetRef, setSheetHeaderInfo, router]);

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSourceId(sourceId);

    // Check if there's already transport config for this location
    if (destinationLocation?.transportFrom === sourceId) {
      setPendingTransportMode((destinationLocation.transportMode as TransportMode) || 'driving');
    } else {
      // Reset to defaults and trigger route fetch
      const defaultMode = 'driving';
      setPendingTransportMode(defaultMode);
      handleTransportModeChange(defaultMode, sourceId);
    }
  };

  const handleTransportModeChange = async (mode: TransportMode, sourceId?: string) => {
    setPendingTransportMode(mode);

    // Use provided sourceId or current selectedSourceId
    const source = sourceId || selectedSourceId;

    // Fetch route with new mode if source is selected
    if (source && destinationLocation) {
      const sourceLocation = locations.find(loc => loc.geoId === source);
      if (!sourceLocation) return;

      setIsUpdating(true);
      try {
        const profile = mode === 'walking' ? 'walking' :
                       mode === 'cycling' ? 'cycling' :
                       'driving-traffic';

        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${sourceLocation.lng},${sourceLocation.lat};${destinationLocation.lng},${destinationLocation.lat}?geometries=geojson&overview=full&access_token=${process.env.EXPO_PUBLIC_MAPBOX_TOKEN}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];

          // Update route info for display
          setRouteInfo({
            distance: route.distance,
            duration: route.duration,
          });

          // Save transport config to geo-mark
          setGeoMarkUpdate({
            geoId: destinationLocation.geoId!,
            updatedAttrs: {
              transportProfile: mode,
              transportFrom: source,
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

  if (!destinationLocation) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Location not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
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
              .map(location => {
                const locationColor = COLORS[(location.colorIndex ?? 0) % COLORS.length];
                return (
                  <TouchableOpacity
                    key={location.geoId}
                    style={[
                      styles.locationOption,
                      selectedSourceId === location.geoId && styles.locationOptionActive
                    ]}
                    onPress={() => handleSourceSelect(location.geoId!)}
                  >
                    <View style={[
                      styles.locationDot,
                      { backgroundColor: locationColor }
                    ]} />
                    <Text style={[
                      styles.locationOptionText,
                      selectedSourceId === location.geoId && styles.locationOptionTextActive
                    ]}>
                      {location.displayText || location.placeName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
          {routeInfo && !isUpdating && (
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
                    {Math.round(routeInfo.duration / 60)} min
                  </Text>
                </View>
                <View style={styles.routeStat}>
                  <Ionicons name="resize-outline" size={16} color="#6B7280" />
                  <Text style={styles.routeStatLabel}>Distance</Text>
                  <Text style={styles.routeStatValue}>
                    {(routeInfo.distance / 1000).toFixed(1)} km
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Loading indicator */}
          {isUpdating && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.loadingText}>Calculating route...</Text>
            </View>
          )}
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
