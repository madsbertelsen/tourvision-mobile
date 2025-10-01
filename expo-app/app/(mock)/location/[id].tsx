import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Image
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function LocationDetailScreen() {
  const params = useLocalSearchParams();
  const { id, name, lat, lng, description, photoName } = params as {
    id: string;
    name: string;
    lat: string;
    lng: string;
    description?: string;
    photoName?: string;
  };

  const [isBookmarked, setIsBookmarked] = useState(false);

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

  // Photo URL from Google Places
  const photoUrl = photoName
    ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=600&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY}`
    : null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Photo Banner */}
        {photoUrl && (
          <View style={styles.photoBanner}>
            <Image
              source={{ uri: photoUrl }}
              style={styles.photo}
              resizeMode="cover"
            />
            <TouchableOpacity
              style={styles.bookmarkButton}
              onPress={() => setIsBookmarked(!isBookmarked)}
            >
              <Ionicons
                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={28}
                color={isBookmarked ? '#3B82F6' : '#fff'}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Location Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="location" size={24} color="#3B82F6" />
            <Text style={styles.locationName}>{name}</Text>
            {!photoUrl && (
              <TouchableOpacity
                style={styles.headerBookmarkButton}
                onPress={() => setIsBookmarked(!isBookmarked)}
              >
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={24}
                  color={isBookmarked ? '#3B82F6' : '#6b7280'}
                />
              </TouchableOpacity>
            )}
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
          {description && (
            <Text style={styles.descriptionText}>
              {description}
            </Text>
          )}
          <Text style={styles.infoText}>
            {description ? 'This location was mentioned in your travel conversation.' : 'This location was mentioned in your travel conversation. Tap "Open in Maps" to view it in your preferred maps application or get directions.'}
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
    padding: 0,
  },
  photoBanner: {
    width: '100%',
    height: 250,
    position: 'relative',
    marginBottom: 16,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  bookmarkButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    marginHorizontal: 16,
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
  headerBookmarkButton: {
    padding: 4,
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
    marginHorizontal: 16,
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
    marginHorizontal: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
    marginBottom: 12,
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
    marginHorizontal: 16,
    marginBottom: 16,
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