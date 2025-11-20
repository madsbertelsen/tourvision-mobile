import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useMapContext } from './_layout';
import { useDocumentNextContext } from '../_layout';
import { Ionicons } from '@expo/vector-icons';

export default function MapIndexRoute() {
  const router = useRouter();
  const { documentId } = useDocumentNextContext();
  const { locations, bottomSheetRef } = useMapContext();

  useEffect(() => {
    // Optionally auto-navigate to first location
    // Uncomment to enable:
    /*
    if (locations.length > 0) {
      router.replace(`/document/${documentId}/map/location/${locations[0].geoId}`);
    }
    */

    // Make sure bottom sheet is closed on index route
    bottomSheetRef.current?.close();
  }, [locations, documentId, router, bottomSheetRef]);

  // Return instructions overlay
  return (
    <View style={styles.container}>
      <View style={styles.instructionCard}>
        <Ionicons name="hand-left-outline" size={32} color="#6B7280" />
        <Text style={styles.title}>Explore Your Locations</Text>
        <Text style={styles.description}>
          Tap any marker on the map to view location details
        </Text>
        {locations.length > 1 && (
          <Text style={styles.description}>
            Tap route lines to configure transportation
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  instructionCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 12,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
});