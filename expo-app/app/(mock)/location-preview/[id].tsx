import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function LocationPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const {
    id,
    name,
    lat,
    lng,
    description,
    colorIndex
  } = params as {
    id: string;
    name: string;
    lat: string;
    lng: string;
    description?: string;
    colorIndex?: string;
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
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Location</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Location Name */}
        <View style={styles.titleSection}>
          <Text style={styles.locationName}>{name}</Text>
          <View style={styles.subtitle}>
            <Ionicons name="location-sharp" size={14} color="#6b7280" />
            <Text style={styles.subtitleText}>Location</Text>
          </View>
        </View>

        {/* Description */}
        {description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{description}</Text>
          </View>
        )}

        {/* Coordinates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coordinates</Text>
          <View style={styles.coordRow}>
            <Ionicons name="location-outline" size={20} color="#6b7280" />
            <Text style={styles.coordText}>
              {formatCoordinate(lat, 'lat')}, {formatCoordinate(lng, 'lng')}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.actionButtonPrimary} onPress={openInMaps}>
            <Ionicons name="navigate" size={20} color="#fff" />
            <Text style={styles.actionButtonPrimaryText}>Get Directions</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            <TouchableOpacity style={styles.actionButtonSecondary}>
              <Ionicons name="share-outline" size={20} color="#3B82F6" />
              <Text style={styles.actionButtonSecondaryText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButtonSecondary}>
              <Ionicons name="bookmark-outline" size={20} color="#3B82F6" />
              <Text style={styles.actionButtonSecondaryText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Part of Document */}
        <View style={styles.infoCard}>
          <Ionicons name="document-text-outline" size={18} color="#6b7280" />
          <Text style={styles.infoCardText}>
            Part of your document
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  titleSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  locationName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitleText: {
    fontSize: 14,
    color: '#6b7280',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  descriptionText: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coordText: {
    fontSize: 15,
    color: '#111827',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  actionSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  actionButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  actionButtonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
  },
  actionButtonSecondaryText: {
    color: '#3B82F6',
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  infoCardText: {
    fontSize: 14,
    color: '#6b7280',
  },
});
