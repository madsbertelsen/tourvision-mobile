import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams, useGlobalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LocationSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
}

interface GeoMarkData {
  placeName: string;
  lat: string;
  lng: string;
  description: string;
  colorIndex: number;
}

export default function CreateLocationScreen() {
  const router = useRouter();
  const globalParams = useGlobalSearchParams();
  const params = useLocalSearchParams<{
    tripId?: string;
    placeName?: string;
    lat?: string;
    lng?: string;
  }>();
  const insets = useSafeAreaInsets();

  const [searchQuery, setSearchQuery] = useState(params.placeName || '');
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const [description, setDescription] = useState('');

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
          )}&format=jsonv2&limit=10&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'TourVision-App', // Nominatim requires a user agent
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch location suggestions');
        }

        const data = await response.json();
        setSuggestions(data || []);
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

  const handleLocationSelect = (suggestion: LocationSuggestion) => {
    setSelectedLocation(suggestion);
    setSearchQuery(suggestion.display_name);
    setSuggestions([]);
  };

  const handleSave = () => {
    if (!selectedLocation) {
      Alert.alert('Error', 'Please select a location from the suggestions');
      return;
    }

    // Create geo-mark data with unique ID and color
    const geoMarkData = {
      geoId: `loc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      placeName: selectedLocation.display_name,
      lat: parseFloat(selectedLocation.lat),
      lng: parseFloat(selectedLocation.lon),
      description: description.trim(),
      colorIndex: 0, // Will be assigned by the document editor based on existing geo-marks
      transportFrom: null,
      transportProfile: 'walking',
      waypoints: null,
    };

    console.log('[CreateLocation] Saving location:', geoMarkData);

    // Navigate back to the trip screen with the saved location data
    if (params.tripId) {
      router.navigate({
        pathname: `/(mock)/trip/${params.tripId}`,
        params: {
          savedLocation: JSON.stringify(geoMarkData)
        }
      });
    } else {
      // Fallback to router.back() if tripId is not available
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

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Search Input */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location Name</Text>
          <View style={styles.searchContainer}>
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

        {/* Suggestions List */}
        {suggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Suggestions</Text>
            {suggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion.place_id}
                style={[
                  styles.suggestionItem,
                  selectedLocation?.place_id === suggestion.place_id && styles.selectedSuggestion
                ]}
                onPress={() => handleLocationSelect(suggestion)}
              >
                <View style={styles.suggestionContent}>
                  <Text style={styles.suggestionName} numberOfLines={2}>
                    {suggestion.display_name}
                  </Text>
                  <Text style={styles.suggestionCoords}>
                    {parseFloat(suggestion.lat).toFixed(4)}, {parseFloat(suggestion.lon).toFixed(4)}
                  </Text>
                  {suggestion.type && (
                    <Text style={styles.suggestionType}>{suggestion.type}</Text>
                  )}
                </View>
                {selectedLocation?.place_id === suggestion.place_id && (
                  <Ionicons name="checkmark-circle" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Selected Location */}
        {selectedLocation && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Selected Location</Text>
            <View style={styles.selectedLocationCard}>
              <Text style={styles.selectedLocationName}>
                {selectedLocation.display_name}
              </Text>
              <Text style={styles.selectedLocationCoords}>
                Lat: {parseFloat(selectedLocation.lat).toFixed(6)}, 
                Lng: {parseFloat(selectedLocation.lon).toFixed(6)}
              </Text>
            </View>
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description (Optional)</Text>
          <TextInput
            style={styles.descriptionInput}
            value={description}
            onChangeText={setDescription}
            placeholder="Add notes about this location..."
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Empty state */}
        {!isLoading && suggestions.length === 0 && searchQuery.trim().length >= 2 && (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={48} color="#8E8E93" />
            <Text style={styles.emptyStateTitle}>No locations found</Text>
            <Text style={styles.emptyStateText}>
              Try adjusting your search terms or enter coordinates manually.
            </Text>
          </View>
        )}
      </ScrollView>
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
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
  searchLoader: {
    marginRight: 12,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    margin: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#C62828',
    flex: 1,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
  },
  selectedSuggestion: {
    backgroundColor: '#E3F2FD',
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    lineHeight: 20,
  },
  suggestionCoords: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  suggestionType: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  selectedLocationCard: {
    backgroundColor: '#F0F8FF',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B3E5FC',
  },
  selectedLocationName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
    lineHeight: 20,
  },
  selectedLocationCoords: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontFamily: 'System',
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