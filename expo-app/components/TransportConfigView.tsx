import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchRouteWithCache, type RouteDetails } from '../utils/transportation-api';

type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

interface TransportConfigViewProps {
  locationName: string;
  locationLat: number;
  locationLng: number;
  originLocation?: {
    lat: number;
    lng: number;
    name: string;
  } | null;
  allOrigins?: Array<{
    geoId: string;
    placeName: string;
    lat: number;
    lng: number;
  }>;
  selectedMode: TransportMode;
  onSelectMode: (mode: TransportMode) => void;
  onAddToDocument: () => void;
  onBack: () => void;
  onRouteChange?: (route: {
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number };
    geometry?: RouteDetails['geometry'];
  } | null) => void;
}

const TRANSPORT_MODES: Array<{
  mode: TransportMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}> = [
  {
    mode: 'walking',
    label: 'Walking',
    icon: 'walk',
    description: 'On foot',
  },
  {
    mode: 'driving',
    label: 'Driving',
    icon: 'car',
    description: 'By car',
  },
  {
    mode: 'transit',
    label: 'Transit',
    icon: 'bus',
    description: 'Public transport',
  },
  {
    mode: 'cycling',
    label: 'Cycling',
    icon: 'bicycle',
    description: 'By bike',
  },
  {
    mode: 'flight',
    label: 'Flight',
    icon: 'airplane',
    description: 'By plane',
  },
];

export default function TransportConfigView({
  locationName,
  locationLat,
  locationLng,
  originLocation,
  allOrigins = [],
  selectedMode,
  onSelectMode,
  onAddToDocument,
  onBack,
  onRouteChange,
}: TransportConfigViewProps) {
  const [routeData, setRouteData] = useState<RouteDetails | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<typeof originLocation>(originLocation);
  const [showOriginSelector, setShowOriginSelector] = useState(false);

  // Fetch route when transport mode or locations change
  useEffect(() => {
    if (!selectedOrigin || selectedMode === 'flight') {
      setRouteData(null);
      return;
    }

    const fetchRouteData = async () => {
      setIsLoadingRoute(true);
      setRouteError(null);

      try {
        // Map TransportMode to API profile
        const profileMap: Record<Exclude<TransportMode, 'flight'>, 'walking' | 'driving' | 'cycling' | 'transit'> = {
          walking: 'walking',
          driving: 'driving',
          cycling: 'cycling',
          transit: 'transit',
        };

        const profile = profileMap[selectedMode as Exclude<TransportMode, 'flight'>];
        const waypoints = [
          { lat: selectedOrigin.lat, lng: selectedOrigin.lng },
          { lat: locationLat, lng: locationLng },
        ];

        const route = await fetchRouteWithCache(profile, waypoints);
        setRouteData(route);
      } catch (error) {
        console.error('Error fetching route:', error);
        setRouteError('Failed to load route');
        setRouteData(null);
      } finally {
        setIsLoadingRoute(false);
      }
    };

    fetchRouteData();
  }, [selectedOrigin, locationLat, locationLng, selectedMode]);

  // Notify parent component when route changes
  useEffect(() => {
    if (!onRouteChange) return;

    if (!selectedOrigin) {
      // No origin selected - clear route
      onRouteChange(null);
      return;
    }

    // Create a straight line geometry if we don't have route data yet
    const geometry: RouteDetails['geometry'] = routeData?.geometry || {
      type: 'LineString',
      coordinates: [
        [selectedOrigin.lng, selectedOrigin.lat],
        [locationLng, locationLat],
      ],
    };

    onRouteChange({
      origin: { lat: selectedOrigin.lat, lng: selectedOrigin.lng },
      destination: { lat: locationLat, lng: locationLng },
      geometry,
    });
  }, [selectedOrigin, routeData, locationLat, locationLng, onRouteChange]);

  return (
    <View style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transportation</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Selected location summary */}
      <View style={styles.locationSummary}>
        <View style={styles.locationIcon}>
          <Ionicons name="location" size={20} color="#3B82F6" />
        </View>
        <View style={styles.locationInfo}>
          <Text style={styles.locationLabel}>Destination</Text>
          <Text style={styles.locationName} numberOfLines={2}>
            {locationName}
          </Text>
        </View>
      </View>

      {/* Origin selector */}
      {allOrigins.length > 0 && (
        <View style={styles.originSection}>
          <Text style={styles.sectionLabel}>Route from (optional):</Text>

          {/* No origin option */}
          <TouchableOpacity
            style={[
              styles.originCard,
              !selectedOrigin && styles.originCardSelected,
            ]}
            onPress={() => setSelectedOrigin(null)}
          >
            <View style={styles.originIconContainer}>
              <Ionicons
                name="close-circle"
                size={24}
                color={!selectedOrigin ? '#3B82F6' : '#6B7280'}
              />
            </View>
            <Text style={[
              styles.originLabel,
              !selectedOrigin && styles.originLabelSelected,
            ]}>
              No starting point
            </Text>
            {!selectedOrigin && (
              <View style={styles.checkmarkContainer}>
                <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
              </View>
            )}
          </TouchableOpacity>

          {/* Origin location options */}
          {allOrigins.map((origin) => {
            const isSelected = selectedOrigin?.lat === origin.lat && selectedOrigin?.lng === origin.lng;
            return (
              <TouchableOpacity
                key={origin.geoId}
                style={[
                  styles.originCard,
                  isSelected && styles.originCardSelected,
                ]}
                onPress={() => setSelectedOrigin({
                  lat: origin.lat,
                  lng: origin.lng,
                  name: origin.placeName,
                })}
              >
                <View style={styles.originIconContainer}>
                  <Ionicons
                    name="location"
                    size={24}
                    color={isSelected ? '#3B82F6' : '#6B7280'}
                  />
                </View>
                <Text
                  style={[
                    styles.originLabel,
                    isSelected && styles.originLabelSelected,
                  ]}
                  numberOfLines={1}
                >
                  {origin.placeName}
                </Text>
                {isSelected && (
                  <View style={styles.checkmarkContainer}>
                    <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Route info display */}
      {selectedOrigin && routeData && !isLoadingRoute && (
        <View style={styles.routeInfoContainer}>
          <View style={styles.routeInfoHeader}>
            <Ionicons name="information-circle" size={20} color="#3B82F6" />
            <Text style={styles.routeInfoTitle}>Route Details</Text>
          </View>
          <View style={styles.routeInfoContent}>
            <View style={styles.routeInfoItem}>
              <Ionicons name="navigate" size={16} color="#6B7280" />
              <Text style={styles.routeInfoText}>
                {(routeData.distance / 1000).toFixed(1)} km
              </Text>
            </View>
            <View style={styles.routeInfoDivider} />
            <View style={styles.routeInfoItem}>
              <Ionicons name="time" size={16} color="#6B7280" />
              <Text style={styles.routeInfoText}>
                {Math.round(routeData.duration / 60)} min
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Loading route indicator */}
      {selectedOrigin && isLoadingRoute && (
        <View style={styles.routeLoadingContainer}>
          <Text style={styles.routeLoadingText}>Calculating route...</Text>
        </View>
      )}

      {/* Transport modes */}
      <ScrollView style={styles.modesScroll} contentContainerStyle={styles.modesContainer}>
        <Text style={styles.sectionLabel}>How will you get there?</Text>

        {TRANSPORT_MODES.map((transport) => (
          <TouchableOpacity
            key={transport.mode}
            style={[
              styles.modeCard,
              selectedMode === transport.mode && styles.modeCardSelected,
            ]}
            onPress={() => onSelectMode(transport.mode)}
          >
            <View style={[
              styles.modeIconContainer,
              selectedMode === transport.mode && styles.modeIconContainerSelected,
            ]}>
              <Ionicons
                name={transport.icon}
                size={24}
                color={selectedMode === transport.mode ? '#3B82F6' : '#6B7280'}
              />
            </View>

            <View style={styles.modeTextContainer}>
              <Text style={[
                styles.modeLabel,
                selectedMode === transport.mode && styles.modeLabelSelected,
              ]}>
                {transport.label}
              </Text>
              <Text style={styles.modeDescription}>{transport.description}</Text>
            </View>

            {selectedMode === transport.mode && (
              <View style={styles.checkmarkContainer}>
                <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Add to document button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.addButton} onPress={onAddToDocument}>
          <Ionicons name="add-circle" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add to Document</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 32, // Match back button width for centering
  },
  locationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
    gap: 12,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
  },
  originSection: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  originCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  originCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  originIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  originLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  originLabelSelected: {
    color: '#1E40AF',
  },
  routeInfoContainer: {
    margin: 16,
    marginBottom: 0,
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  routeInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  routeInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  routeInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeInfoText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  routeInfoDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#DBEAFE',
  },
  routeLoadingContainer: {
    margin: 16,
    marginBottom: 0,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignItems: 'center',
  },
  routeLoadingText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  modesScroll: {
    flex: 1,
  },
  modesContainer: {
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  modeCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  modeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconContainerSelected: {
    backgroundColor: '#DBEAFE',
  },
  modeTextContainer: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  modeLabelSelected: {
    color: '#1E40AF',
  },
  modeDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  checkmarkContainer: {
    padding: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
