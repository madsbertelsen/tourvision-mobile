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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function LocationDetailScreen() {
  const router = useRouter();
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
      {/* Photo Banner */}
      {photoUrl && (
        <View style={styles.photoBanner}>
          <Image
            source={{ uri: photoUrl }}
            style={styles.photo}
            resizeMode="cover"
          />
          <View style={styles.photoOverlay}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setIsBookmarked(!isBookmarked)}
              >
                <Ionicons
                  name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                  size={24}
                  color="#fff"}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => console.log('Share location:', { name, lat, lng })}
              >
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.locationName}>{name}</Text>
          <View style={styles.subtitle}>
            <Ionicons name="location-sharp" size={14} color="#6b7280" />
            <Text style={styles.subtitleText}>Attraction</Text>
          </View>
          {!photoUrl && (
            <TouchableOpacity
              style={styles.headerBookmark}
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

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity style={styles.tabActive}>
            <Text style={styles.tabTextActive}>Overview</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab}>
            <Text style={styles.tabText}>Location</Text>
          </TouchableOpacity>
        </View>

        {/* Overview Section */}
        {description && (
          <View style={styles.section}>
            <Text style={styles.descriptionText}>{description}</Text>
            {description.length > 200 && (
              <TouchableOpacity>
                <Text style={styles.readMore}>Read more</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity style={styles.actionButtonPrimary} onPress={openInMaps}>
            <Ionicons name="navigate" size={20} color="#fff" />
            <Text style={styles.actionButtonPrimaryText}>Directions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButtonSecondary}>
            <Ionicons name="call-outline" size={20} color="#3B82F6" />
            <Text style={styles.actionButtonSecondaryText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButtonSecondary}>
            <Ionicons name="globe-outline" size={20} color="#3B82F6" />
            <Text style={styles.actionButtonSecondaryText}>Website</Text>
          </TouchableOpacity>
        </View>

        {/* Coordinates Info */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color="#6b7280" />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Coordinates</Text>
              <Text style={styles.infoValue}>
                {formatCoordinate(lat, 'lat')}, {formatCoordinate(lng, 'lng')}
              </Text>
            </View>
          </View>
        </View>

        {/* Mentioned in conversation */}
        <View style={styles.mentionedSection}>
          <Ionicons name="chatbubble-outline" size={16} color="#6b7280" />
          <Text style={styles.mentionedText}>
            Mentioned in your travel conversation
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  photoBanner: {
    width: '100%',
    height: 300,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  locationName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitleText: {
    fontSize: 13,
    color: '#6b7280',
  },
  headerBookmark: {
    position: 'absolute',
    top: 20,
    right: 16,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginRight: 24,
  },
  tabActive: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginRight: 24,
    borderBottomWidth: 3,
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6b7280',
  },
  tabTextActive: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  descriptionText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  readMore: {
    fontSize: 15,
    color: '#3B82F6',
    fontWeight: '500',
    marginTop: 8,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  actionButtonPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  actionButtonSecondaryText: {
    color: '#3B82F6',
    fontSize: 15,
    fontWeight: '600',
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
  },
  mentionedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
  },
  mentionedText: {
    fontSize: 13,
    color: '#6b7280',
  },
});