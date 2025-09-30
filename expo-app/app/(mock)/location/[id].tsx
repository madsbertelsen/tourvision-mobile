import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function LocationDetailScreen() {
  const params = useLocalSearchParams();
  const { id, name, lat, lng } = params as {
    id: string;
    name: string;
    lat: string;
    lng: string;
  };

  // Format coordinates for display
  const formatCoordinate = (coord: string, type: 'lat' | 'lng') => {
    const value = parseFloat(coord);
    if (isNaN(value)) return coord;

    if (type === 'lat') {
      return `${Math.abs(value).toFixed(6)}° ${value >= 0 ? 'N' : 'S'}`;
    } else {
      return `${Math.abs(value).toFixed(6)}° ${value >= 0 ? 'E' : 'W'}`;
    }
  };

  // Open in maps app
  const openInMaps = () => {
    const scheme = Platform.select({
      ios: 'maps:',
      android: 'geo:',
    });
    const latLng = `${lat},${lng}`;
    const label = encodeURIComponent(name);

    const url = Platform.select({
      ios: `${scheme}${latLng}?q=${label}`,
      android: `${scheme}${latLng}?q=${label}`,
      web: `https://www.google.com/maps/search/?api=1&query=${label}&query_place_id=${latLng}`
    });

    if (url) {
      Linking.openURL(url);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Location Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="location" size={24} color="#3B82F6" />
            <Text style={styles.locationName}>{name}</Text>
          </View>

          <View style={styles.coordinatesContainer}>
            <View style={styles.coordinateRow}>
              <Text style={styles.coordinateLabel}>Latitude:</Text>
              <Text style={styles.coordinateValue}>{formatCoordinate(lat, 'lat')}</Text>
            </View>
            <View style={styles.coordinateRow}>
              <Text style={styles.coordinateLabel}>Longitude:</Text>
              <Text style={styles.coordinateValue}>{formatCoordinate(lng, 'lng')}</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={openInMaps}>
            <Ionicons name="map" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Open in Maps</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => {
              // Could implement share functionality
              console.log('Share location:', { name, lat, lng });
            }}
          >
            <Ionicons name="share-outline" size={20} color="#3B82F6" />
            <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>Share</Text>
          </TouchableOpacity>
        </View>

        {/* Additional Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About this location</Text>
          <Text style={styles.infoText}>
            This location was mentioned in your travel conversation.
            Tap "Open in Maps" to view it in your preferred maps application
            or get directions.
          </Text>
        </View>

        {/* Quick Facts */}
        <View style={styles.factsCard}>
          <Text style={styles.factsTitle}>Quick Facts</Text>
          <View style={styles.factRow}>
            <Ionicons name="globe-outline" size={16} color="#6b7280" />
            <Text style={styles.factText}>
              Coordinates: {parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 8,
    flex: 1,
  },
  coordinatesContainer: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
  },
  coordinateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  coordinateLabel: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  coordinateValue: {
    fontSize: 14,
    color: '#111827',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#3B82F6',
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  factsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
  },
  factsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  factText: {
    fontSize: 14,
    color: '#6b7280',
  },
});