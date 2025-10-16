import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import Mapbox from '@rnmapbox/maps';

// Set Mapbox access token
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 400;

interface LocationSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
}

export default function CreateLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId?: string;
    placeName?: string;
    lat?: string;
    lng?: string;
  }>();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Mapbox.Camera>(null);

  const [searchQuery, setSearchQuery] = useState(params.placeName || '');
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [description, setDescription] = useState('');

  // Selected location from picker
  const selectedLocation = suggestions[selectedIndex] || null;

  // Search Nominatim when query changes
  useEffect(() => {
    const searchLocations = async () => {
      if (!searchQuery || searchQuery.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
            searchQuery
          )}&format=jsonv2&limit=20&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'TourVision-App',
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch location suggestions');
        }

        const data = await response.json();
        setSuggestions(data || []);
        setSelectedIndex(0); // Reset to first suggestion
      } catch (err) {
        console.error('Error fetching Nominatim suggestions:', err);
        setError('Unable to fetch location suggestions');
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce search
    const timeoutId = setTimeout(searchLocations, 500);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Update map to show all suggestions or fit to selected
  useEffect(() => {
    if (!cameraRef.current || suggestions.length === 0) return;

    if (suggestions.length === 1) {
      // Single location - center on it
      cameraRef.current.setCamera({
        centerCoordinate: [parseFloat(suggestions[0].lon), parseFloat(suggestions[0].lat)],
        zoomLevel: 14,
        animationDuration: 500,
      });
    } else {
      // Multiple locations - fit all in view
      const coordinates = suggestions.map(s => [parseFloat(s.lon), parseFloat(s.lat)]);
      cameraRef.current.fitBounds(
        [Math.min(...coordinates.map(c => c[0])), Math.min(...coordinates.map(c => c[1]))],
        [Math.max(...coordinates.map(c => c[0])), Math.max(...coordinates.map(c => c[1]))],
        [50, 50, 50, 50], // padding
        500 // animation duration
      );
    }
  }, [suggestions]);

  // When selection changes, highlight it on the map
  useEffect(() => {
    // The map will re-render with updated markers showing selection
  }, [selectedIndex]);

  const handleSave = () => {
    if (!selectedLocation) {
      Alert.alert('Error', 'Please search and select a location from the picker');
      return;
    }

    // Create geo-mark data
    const geoMarkData = {
      geoId: `loc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      placeName: selectedLocation.display_name,
      lat: parseFloat(selectedLocation.lat),
      lng: parseFloat(selectedLocation.lon),
      description: description.trim(),
      colorIndex: 0,
      transportFrom: null,
      transportProfile: 'walking',
      waypoints: null,
    };

    console.log('[CreateLocation] Saving location:', geoMarkData);

    // Navigate back with the saved location data
    if (params.tripId) {
      if (params.tripId === 'prosemirror-test') {
        router.navigate({
          pathname: '/(mock)/prosemirror-test',
          params: {
            savedLocation: JSON.stringify(geoMarkData)
          }
        });
      } else {
        router.navigate({
          pathname: `/(mock)/trip/${params.tripId}`,
          params: {
            savedLocation: JSON.stringify(geoMarkData)
          }
        });
      }
    } else {
      console.warn('[CreateLocation] No tripId available, falling back to router.back()');
      router.back();
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen
        options={{
          title: 'Create Location',
          headerShown: false,
        }}
      />

      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Location</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.headerButton, { opacity: selectedLocation ? 1 : 0.5 }]}
          disabled={!selectedLocation}
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#8E8E93" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search for a location..."
            autoFocus
            returnKeyType="search"
          />
          {isLoading && (
            <ActivityIndicator
              style={styles.searchLoader}
              size="small"
              color="#007AFF"
            />
          )}
        </View>
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={16} color="#FF3B30" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Map View */}
      {suggestions.length > 0 && (
        <View style={styles.mapContainer}>
          <Mapbox.MapView
            style={styles.map}
            styleURL={Mapbox.StyleURL.Street}
            zoomEnabled={true}
            scrollEnabled={true}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Mapbox.Camera
              ref={cameraRef}
              zoomLevel={14}
              animationDuration={500}
            />

            {/* Markers for all suggestions */}
            {suggestions.map((suggestion, index) => {
              const isSelected = index === selectedIndex;
              const locationName = suggestion.display_name.split(',')[0];

              return (
                <Mapbox.PointAnnotation
                  key={suggestion.place_id}
                  id={`location-${suggestion.place_id}`}
                  coordinate={[parseFloat(suggestion.lon), parseFloat(suggestion.lat)]}
                  onSelected={() => {
                    console.log('[CreateLocation] Marker tapped, selecting index:', index);
                    setSelectedIndex(index);
                  }}
                >
                  <View style={[
                    styles.markerContainer,
                    isSelected && styles.markerSelected
                  ]}>
                    <Ionicons
                      name={isSelected ? "location" : "location-outline"}
                      size={isSelected ? 40 : 28}
                      color={isSelected ? "#007AFF" : "#8E8E93"}
                    />
                  </View>
                </Mapbox.PointAnnotation>
              );
            })}
          </Mapbox.MapView>

          {/* Location info overlay for selected location */}
          {selectedLocation && (
            <View style={styles.locationInfoOverlay}>
              <Text style={styles.locationName} numberOfLines={2}>
                {selectedLocation.display_name}
              </Text>
              <Text style={styles.locationCoords}>
                {parseFloat(selectedLocation.lat).toFixed(6)}, {parseFloat(selectedLocation.lon).toFixed(6)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Suggestions Picker */}
      {suggestions.length > 0 ? (
        <View style={styles.pickerSection}>
          <Text style={styles.pickerLabel}>Select Location</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedIndex}
              onValueChange={(itemValue) => setSelectedIndex(itemValue as number)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
            >
              {suggestions.map((suggestion, index) => (
                <Picker.Item
                  key={suggestion.place_id}
                  label={suggestion.display_name}
                  value={index}
                />
              ))}
            </Picker>
          </View>
        </View>
      ) : (
        !isLoading && searchQuery.trim().length >= 2 && (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={48} color="#8E8E93" />
            <Text style={styles.emptyStateTitle}>No locations found</Text>
            <Text style={styles.emptyStateText}>
              Try adjusting your search terms
            </Text>
          </View>
        )
      )}

      {/* Description Input */}
      {selectedLocation && (
        <View style={styles.descriptionSection}>
          <Text style={styles.descriptionLabel}>Notes (Optional)</Text>
          <TextInput
            style={styles.descriptionInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Add notes about this location..."
            multiline
            textAlignVertical="top"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E1E1',
  },
  headerButton: {
    paddingVertical: 8,
    minWidth: 60,
  },
  cancelText: {
    fontSize: 17,
    color: '#007AFF',
  },
  saveText: {
    fontSize: 17,
    color: '#007AFF',
    fontWeight: '600',
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  searchSection: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E1E1',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 10,
    backgroundColor: '#F9F9F9',
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
    color: '#000',
  },
  searchLoader: {
    marginLeft: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#C62828',
    flex: 1,
  },
  mapContainer: {
    height: MAP_HEIGHT,
    backgroundColor: '#E5E5EA',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerSelected: {
    transform: [{ scale: 1.2 }],
  },
  locationInfoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E1E1E1',
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  locationCoords: {
    fontSize: 14,
    color: '#666',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  pickerSection: {
    backgroundColor: 'white',
    marginTop: 8,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E1E1E1',
  },
  picker: {
    height: 200,
  },
  pickerItem: {
    fontSize: 16,
    height: 200,
  },
  descriptionSection: {
    backgroundColor: 'white',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  descriptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
    minHeight: 80,
    color: '#000',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    flex: 1,
    justifyContent: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
});
