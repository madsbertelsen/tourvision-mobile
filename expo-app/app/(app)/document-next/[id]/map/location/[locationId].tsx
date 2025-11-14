import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useMapContext } from '../_layout';
import { useDocumentNextContext } from '../../_layout';

export default function LocationDetailsRoute() {
  const { locationId } = useLocalSearchParams();
  const router = useRouter();
  const { documentId } = useDocumentNextContext();
  const {
    locations,
    routes,
    selectedLocationId,
    setSelectedLocationId,
    bottomSheetRef,
    focusOnLocation
  } = useMapContext();

  // Find the location by ID
  const location = locations.find(loc => loc.geoId === locationId);

  // Find all routes related to this location
  const routesToLocation = routes.filter(r => r.toLocationId === locationId);
  const routesFromLocation = routes.filter(r => r.fromLocationId === locationId);

  useEffect(() => {
    if (location) {
      // Focus camera on location when this route mounts
      focusOnLocation(location);

      // Set as selected location
      setSelectedLocationId(location.geoId);

      // Snap bottom sheet to 50% (index 1)
      bottomSheetRef.current?.snapToIndex(1);
    }

    // Cleanup on unmount
    return () => {
      setSelectedLocationId(null);
    };
  }, [location, focusOnLocation, setSelectedLocationId, bottomSheetRef]);

  if (!location) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Location not found</Text>
      </View>
    );
  }

  const handleTransportation = () => {
    // Navigate to transport config for this location
    router.push(`/document-next/${documentId}/map/transport/${locationId}`);
  };

  const handleEditLocation = () => {
    // Navigate to edit location within bottom sheet
    router.push(`/document-next/${documentId}/map/edit/${location.geoId}`);
  };

  return (
    <BottomSheetScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[
          styles.colorDot,
          { backgroundColor: location.color }
        ]} />
        <Text style={styles.title} numberOfLines={2}>
          {location.displayText || location.placeName}
        </Text>
      </View>

      {/* Location details sections */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="location-outline" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Full Address</Text>
        </View>
        <Text style={styles.sectionValue}>{location.placeName}</Text>
      </View>

      {location.description && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Ionicons name="document-text-outline" size={20} color="#6B7280" />
            <Text style={styles.sectionLabel}>Description</Text>
          </View>
          <Text style={styles.sectionValue}>{location.description}</Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="navigate-outline" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Coordinates</Text>
        </View>
        <Text style={styles.sectionValue}>
          {Number(location.lat).toFixed(6)}, {Number(location.lng).toFixed(6)}
        </Text>
      </View>

      {/* Routes information */}
      {routesToLocation.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Ionicons name="arrow-back-outline" size={20} color="#6B7280" />
            <Text style={styles.sectionLabel}>Routes to this location</Text>
          </View>
          {routesToLocation.map(route => {
            const fromLoc = locations.find(l => l.geoId === route.fromLocationId);
            return (
              <View key={route.id} style={{ marginBottom: 8 }}>
                <Text style={styles.sectionValue}>
                  From {fromLoc?.displayText || 'Unknown'}
                </Text>
                <View style={styles.routeInfo}>
                  <View style={styles.routeStat}>
                    <Ionicons
                      name={
                        route.transportMode === 'walking' ? 'walk' :
                        route.transportMode === 'cycling' ? 'bicycle' :
                        'car'
                      }
                      size={16}
                      color="#6B7280"
                    />
                    <Text style={styles.routeStatText}>
                      {route.transportMode}
                    </Text>
                  </View>
                  <View style={styles.routeStat}>
                    <Ionicons name="time-outline" size={16} color="#6B7280" />
                    <Text style={styles.routeStatText}>
                      {Math.round(route.duration / 60)} min
                    </Text>
                  </View>
                  <View style={styles.routeStat}>
                    <Ionicons name="resize-outline" size={16} color="#6B7280" />
                    <Text style={styles.routeStatText}>
                      {(route.distance / 1000).toFixed(1)} km
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleTransportation}
        >
          <Ionicons name="car-outline" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Configure Transport</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={handleEditLocation}
        >
          <Ionicons name="create-outline" size={20} color="#007AFF" />
          <Text style={styles.secondaryButtonText}>Edit Location</Text>
        </TouchableOpacity>
      </View>
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
    marginBottom: 20,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
  routeInfo: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
  },
  routeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeStatText: {
    fontSize: 14,
    color: '#6B7280',
  },
  actions: {
    marginTop: 20,
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 20,
  },
});