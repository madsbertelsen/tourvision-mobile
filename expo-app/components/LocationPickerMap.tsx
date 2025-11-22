import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LocationPickerMapProps {
  lat: number;
  lng: number;
  placeName: string;
  editable?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
}

export default function LocationPickerMap({
  lat,
  lng,
  placeName,
}: LocationPickerMapProps) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="map-outline" size={48} color="#9CA3AF" />
        <Text style={styles.placeName}>{placeName}</Text>
        <Text style={styles.coordinates}>
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </Text>
        <Text style={styles.subtitle}>Map preview unavailable</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 200,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 8,
  },
  placeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    marginTop: 8,
  },
  coordinates: {
    fontSize: 13,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  subtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
