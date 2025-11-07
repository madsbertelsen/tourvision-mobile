import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTripContext } from '../../_layout';

interface SearchResult {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
}

export default function LocationSearchRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { id: tripId, geoId } = params as { id: string; geoId: string };
  const { locationFlowState, updateLocationFlow, clearLocationFlow } = useTripContext();

  const [searchQuery, setSearchQuery] = useState(locationFlowState.searchQuery || '');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleBack = () => {
    router.back();
  };

  const handleClose = () => {
    clearLocationFlow();
    router.push(`/document/${tripId}`);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: {
            'User-Agent': 'TourVision Mobile App',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const results = await response.json();
      setSearchResults(results);
      setSelectedIndex(0);
    } catch (error) {
      console.error('Error searching location:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(searchQuery);
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSelectLocation = (result: SearchResult) => {
    const selectedLocation = {
      placeName: result.display_name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };

    updateLocationFlow({
      searchQuery,
      searchResults,
      selectedLocation,
    });

    // Navigate to transport config
    router.push(`/document/${tripId}/geo/${geoId}/transport`);
  };

  const handleContinue = () => {
    if (searchResults.length > 0 && searchResults[selectedIndex]) {
      handleSelectLocation(searchResults[selectedIndex]);
    }
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        onPress={handleClose}
        activeOpacity={1}
      />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search Location</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Selected text display */}
        {locationFlowState.selectedText && (
          <View style={styles.selectedTextContainer}>
            <Text style={styles.selectedTextLabel}>Selected text:</Text>
            <Text style={styles.selectedText} numberOfLines={2}>
              "{locationFlowState.selectedText}"
            </Text>
          </View>
        )}

        {/* Search input */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for a place..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleContinue}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Search results */}
        <ScrollView style={styles.resultsContainer} contentContainerStyle={styles.resultsContent}>
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          )}

          {!isLoading && searchResults.length === 0 && searchQuery.trim() !== '' && (
            <View style={styles.emptyContainer}>
              <Ionicons name="location-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No locations found</Text>
              <Text style={styles.emptySubtext}>Try a different search term</Text>
            </View>
          )}

          {!isLoading && searchResults.length === 0 && searchQuery.trim() === '' && (
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Start typing to search</Text>
              <Text style={styles.emptySubtext}>Search for cities, landmarks, or addresses</Text>
            </View>
          )}

          {!isLoading && searchResults.map((result, index) => (
            <TouchableOpacity
              key={result.place_id}
              style={[
                styles.resultItem,
                selectedIndex === index && styles.resultItemSelected,
              ]}
              onPress={() => handleSelectLocation(result)}
            >
              <View style={styles.resultIconContainer}>
                <Ionicons name="location" size={24} color="#3B82F6" />
              </View>
              <View style={styles.resultTextContainer}>
                <Text style={styles.resultName} numberOfLines={1}>
                  {result.display_name.split(',')[0]}
                </Text>
                <Text style={styles.resultAddress} numberOfLines={2}>
                  {result.display_name}
                </Text>
              </View>
              {selectedIndex === index && (
                <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Footer */}
        {searchResults.length > 0 && (
          <View style={styles.footer}>
            <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
              <Text style={styles.continueButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
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
  closeButton: {
    padding: 4,
  },
  selectedTextContainer: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  selectedTextLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  selectedText: {
    fontSize: 14,
    color: '#111827',
    fontStyle: 'italic',
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#111827',
  },
  clearButton: {
    padding: 4,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsContent: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  resultItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  resultIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextContainer: {
    flex: 1,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  resultAddress: {
    fontSize: 13,
    color: '#6B7280',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    gap: 8,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
