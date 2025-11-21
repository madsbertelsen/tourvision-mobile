import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useDocumentNextWebRTCContext } from '../_layout';

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

export default function LocationDetailsRoute() {
  const { locationId } = useLocalSearchParams();
  const router = useRouter();
  const {
    documentId,
    locations,
    bottomSheetRef,
    setSheetHeaderInfo
  } = useDocumentNextWebRTCContext();

  // Find the location by ID
  const location = locations.find(loc => loc.geoId === locationId);

  useEffect(() => {
    if (location) {
      // Get color from colorIndex
      const locationColor = COLORS[(location.colorIndex ?? 0) % COLORS.length];

      // Set sheet header info
      setSheetHeaderInfo({
        title: location.displayText || location.placeName,
        colorDot: locationColor,
        onBack: undefined, // No back button on location details
      });

      // Snap bottom sheet to 50% (index 0)
      bottomSheetRef.current?.snapToIndex(0);
    }

    // Cleanup on unmount
    return () => {
      setSheetHeaderInfo(null);
    };
  }, [location, bottomSheetRef, setSheetHeaderInfo]);

  if (!location) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Location not found</Text>
      </View>
    );
  }

  const handleTransportation = () => {
    // Navigate to transport config for this location
    router.push(`/document-next/${documentId}/transport/${locationId}`);
  };

  const handleEditLocation = () => {
    // Navigate to edit location within bottom sheet
    router.push(`/document-next/${documentId}/edit/${location.geoId}`);
  };

  return (
    <BottomSheetScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Location details sections */}
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

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="location-outline" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Place Name</Text>
        </View>
        <Text style={styles.sectionValue}>{location.placeName}</Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={handleTransportation}
        >
          <Ionicons name="car-outline" size={20} color="#007AFF" />
          <Text style={styles.linkButtonText}>Configure Transport</Text>
          <Ionicons name="chevron-forward" size={20} color="#007AFF" style={styles.linkChevron} />
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
  actions: {
    marginTop: 20,
    gap: 12,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  linkButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginLeft: 12,
  },
  linkChevron: {
    marginLeft: 8,
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
