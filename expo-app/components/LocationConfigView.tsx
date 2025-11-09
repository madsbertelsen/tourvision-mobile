import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { fetchRouteWithCache, type RouteDetails } from '../utils/transportation-api';
import LocationPickerMap from './LocationPickerMap';

type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

interface LocationConfigViewProps {
  selectedText: string; // The text that was selected/clicked (used as title)
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
  onLocationChange?: (lat: number, lng: number) => void;
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

export default function LocationConfigView({
  selectedText,
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
  onLocationChange,
}: LocationConfigViewProps) {
  const [routeData, setRouteData] = useState<RouteDetails | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<typeof originLocation>(originLocation);
  const [showOriginSelector, setShowOriginSelector] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [currentLat, setCurrentLat] = useState(locationLat);
  const [currentLng, setCurrentLng] = useState(locationLng);

  const handleLocationChange = (lat: number, lng: number) => {
    setCurrentLat(lat);
    setCurrentLng(lng);
    onLocationChange?.(lat, lng);
  };

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
        <Text style={styles.headerTitle} numberOfLines={1}>{selectedText}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Map preview - only on web */}
      {Platform.OS === 'web' && (
        <View style={styles.mapContainer}>
          <LocationPickerMap
            lat={currentLat}
            lng={currentLng}
            placeName={locationName}
            editable={isEditingLocation}
            onLocationChange={handleLocationChange}
          />
          <TouchableOpacity
            style={styles.editLocationButton}
            onPress={() => setIsEditingLocation(!isEditingLocation)}
          >
            <Ionicons
              name={isEditingLocation ? 'checkmark-circle' : 'pencil'}
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.editLocationButtonText}>
              {isEditingLocation ? 'Done' : 'Adjust Location'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Scrollable content */}
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
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
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedOrigin ? `${selectedOrigin.lat},${selectedOrigin.lng}` : null}
                onValueChange={(value) => {
                  if (value === null) {
                    setSelectedOrigin(null);
                  } else {
                    const [lat, lng] = value.split(',').map(Number);
                    const origin = allOrigins.find(o => o.lat === lat && o.lng === lng);
                    if (origin) {
                      setSelectedOrigin({
                        lat: origin.lat,
                        lng: origin.lng,
                        name: origin.placeName,
                      });
                    }
                  }
                }}
                style={styles.picker}
              >
                <Picker.Item label="No starting point" value={null} />
                {allOrigins.map((origin) => (
                  <Picker.Item
                    key={origin.geoId}
                    label={origin.placeName}
                    value={`${origin.lat},${origin.lng}`}
                  />
                ))}
              </Picker>
            </View>
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
        <View style={styles.modesSection}>
          <Text style={styles.sectionLabel}>How will you get there?</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedMode}
              onValueChange={(value) => onSelectMode(value as TransportMode)}
              style={styles.picker}
            >
              {TRANSPORT_MODES.map((transport) => (
                <Picker.Item
                  key={transport.mode}
                  label={`${transport.label} - ${transport.description}`}
                  value={transport.mode}
                />
              ))}
            </Picker>
          </View>
        </View>
      </ScrollView>

      {/* Fixed footer with Add to Document button */}
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
  mapContainer: {
    position: 'relative',
    height: 200,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  editLocationButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  editLocationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingBottom: 16,
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
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: '#111827',
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
  modesSection: {
    padding: 16,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
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
