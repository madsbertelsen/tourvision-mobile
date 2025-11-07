import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import LocationResultsList from './LocationResultsList';
import TransportConfigView from './TransportConfigView';

interface ToolPickerBottomSheetProps {
  visible: boolean;
  selectedText: string;
  onSelectLocation: () => void;
  onSelectComment: () => void;
  onClose: () => void;
  // Edit mode props
  isEditing?: boolean;
  markType?: 'location' | 'comment' | null;
  existingMarkAttrs?: any;
  onEdit?: () => void;
  onDelete?: () => void;
  // New props for location search
  onCreateGeoMark?: (data: {
    placeName: string;
    lat: number;
    lng: number;
    transportMode?: string;
    transportFrom?: string;  // geoId of origin location
    waypoints?: Array<{ lat: number; lng: number }>;  // route coordinates
  }) => void;
  onSearchResultsChange?: (results: LocationResult[], selectedIndex: number) => void;
  // Existing geo-marks from document
  existingGeoMarks?: Array<{
    geoId: string;
    placeName: string;
    lat: number;
    lng: number;
  }>;
  // Route preview callback
  onRouteChange?: (route: {
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number };
    geometry?: {
      type: 'LineString';
      coordinates: number[][];
    };
  } | null) => void;
}

export interface LocationResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    country?: string;
    state?: string;
  };
}

type ToolType = 'location' | 'comment';
type Step = 'picker' | 'location-search' | 'transport-config';
type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

export default function ToolPickerBottomSheet({
  visible,
  selectedText,
  onSelectLocation,
  onSelectComment,
  onClose,
  isEditing = false,
  markType = null,
  existingMarkAttrs = null,
  onEdit,
  onDelete,
  onCreateGeoMark,
  onSearchResultsChange,
  existingGeoMarks = [],
  onRouteChange,
}: ToolPickerBottomSheetProps) {
  const [focusedTool, setFocusedTool] = useState<ToolType>(markType || 'location');
  const [currentStep, setCurrentStep] = useState<Step>('picker');

  // Location search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);

  // Transport config state
  const [transportMode, setTransportMode] = useState<TransportMode>('walking');
  const [currentRoute, setCurrentRoute] = useState<{
    origin: { lat: number; lng: number; geoId?: string } | null;
    geometry?: { type: 'LineString'; coordinates: number[][] };
  } | null>(null);

  // Reset to picker step when modal opens/closes
  useEffect(() => {
    if (visible) {
      setFocusedTool(markType || 'location');
      setCurrentStep('picker');
      // Pre-fill search with selected text
      setSearchQuery(selectedText);
      setSearchResults([]);
      setSelectedResultIndex(0);
      setSelectedLocation(null);
      setTransportMode('walking');
      setCurrentRoute(null);

      // Move focus out of iframe to enable keyboard navigation
      // Use setTimeout to ensure the DOM is ready
      setTimeout(() => {
        // Blur any active element (likely the iframe)
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        // Focus on the window to capture keyboard events
        window.focus();
      }, 0);
    }
  }, [visible, selectedText, markType]);

  // Notify parent of search results changes
  useEffect(() => {
    if (onSearchResultsChange && currentStep === 'location-search') {
      onSearchResultsChange(searchResults, selectedResultIndex);
    }
  }, [searchResults, selectedResultIndex, currentStep, onSearchResultsChange]);

  // Auto-trigger search when in location-search step
  useEffect(() => {
    if (currentStep === 'location-search' && searchQuery.trim()) {
      // Debounce search
      const timeoutId = setTimeout(() => {
        performSearch(searchQuery);
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [currentStep, searchQuery]);

  // Perform Nominatim search
  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}` +
        `&format=jsonv2` +
        `&limit=5` +
        `&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'TourVision-App',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const results = await response.json();
      setSearchResults(results || []);
      setSelectedResultIndex(0);
    } catch (error) {
      console.error('[ToolPickerBottomSheet] Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle location selection clicked
  const handleLocationButtonClick = () => {
    console.log('[ToolPickerBottomSheet] Location button clicked');
    setCurrentStep('location-search');
  };

  // Handle location result selected
  const handleLocationResultSelected = (result: LocationResult, index: number) => {
    console.log('[ToolPickerBottomSheet] Location selected:', result.display_name);
    setSelectedLocation(result);
    setSelectedResultIndex(index);
    setCurrentStep('transport-config');
  };

  // Handle back from location search
  const handleBackFromSearch = () => {
    setCurrentStep('picker');
    setSearchQuery('');
    setSearchResults([]);
  };

  // Handle back from transport config
  const handleBackFromTransport = () => {
    setCurrentStep('location-search');
  };

  // Handle route change from TransportConfigView
  const handleRouteChange = useCallback((route: {
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number };
    geometry?: { type: 'LineString'; coordinates: number[][] };
  } | null) => {
    console.log('[ToolPickerBottomSheet] Route changed:', route);

    // Store route data with geoId if origin exists
    if (route && route.origin) {
      // Find the geoId of the origin by matching coordinates
      const originGeoMark = existingGeoMarks.find(
        mark => mark.lat === route.origin!.lat && mark.lng === route.origin!.lng
      );

      setCurrentRoute({
        origin: {
          lat: route.origin.lat,
          lng: route.origin.lng,
          geoId: originGeoMark?.geoId,
        },
        geometry: route.geometry,
      });
    } else {
      setCurrentRoute(null);
    }

    // Also forward to parent's onRouteChange if it exists
    if (onRouteChange) {
      onRouteChange(route);
    }
  }, [existingGeoMarks, onRouteChange]);

  // Handle add to document
  const handleAddToDocument = () => {
    if (!selectedLocation || !onCreateGeoMark) {
      console.error('[ToolPickerBottomSheet] Missing data for geo-mark creation');
      return;
    }

    // Waypoints should only be stored if the user has customized the route
    // For now, we don't have UI for adding custom waypoints, so always undefined
    // The route can be recalculated from transportFrom + transportProfile
    const waypoints = undefined;

    const geoMarkData = {
      placeName: selectedLocation.display_name,
      lat: parseFloat(selectedLocation.lat),
      lng: parseFloat(selectedLocation.lon),
      transportMode,
      transportFrom: currentRoute?.origin?.geoId,
      waypoints,
    };

    console.log('[ToolPickerBottomSheet] Creating geo-mark with transport config:', geoMarkData);

    onCreateGeoMark(geoMarkData);

    onClose();
  };

  // Keyboard navigation handler for picker step
  useEffect(() => {
    if (!visible || currentStep !== 'picker' || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('[ToolPickerBottomSheet] Key pressed:', e.key, 'focusedTool:', focusedTool);
      e.stopPropagation();

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          setFocusedTool('location');
          break;

        case 'ArrowRight':
          e.preventDefault();
          setFocusedTool('comment');
          break;

        case 'l':
        case 'L':
          e.preventDefault();
          handleLocationButtonClick();
          break;

        case 'c':
        case 'C':
          e.preventDefault();
          onSelectComment();
          break;

        case 'Enter':
          e.preventDefault();
          if (focusedTool === 'location') {
            handleLocationButtonClick();
          } else {
            onSelectComment();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, currentStep, focusedTool, onSelectComment, onClose, handleLocationButtonClick]);

  if (!visible) return null;

  // Render different steps
  const renderContent = () => {
    // Step 1: Tool Picker
    if (currentStep === 'picker') {
      return (
        <>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <Text style={styles.headerTitle}>
              {isEditing ? `Edit ${markType === 'location' ? 'Location' : 'Comment'}` : 'Add to Selection'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Selected Text Preview */}
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>Selected text:</Text>
            <Text style={styles.previewText} numberOfLines={2}>
              "{selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText}"
            </Text>
          </View>

          {/* Tool Buttons */}
          <View style={styles.toolsContainer}>
            {isEditing ? (
              // Edit mode buttons
              <>
                <TouchableOpacity
                  style={[styles.toolButton, styles.toolButtonFocused]}
                  onPress={onEdit || (markType === 'location' ? handleLocationButtonClick : onSelectComment)}
                >
                  <View style={styles.toolIconContainer}>
                    <Ionicons
                      name={markType === 'location' ? 'location' : 'chatbubble'}
                      size={32}
                      color="#3B82F6"
                    />
                  </View>
                  <View style={styles.toolTextContainer}>
                    <Text style={[styles.toolTitle, styles.toolTitleFocused]}>
                      Edit {markType === 'location' ? 'Location' : 'Comment'}
                    </Text>
                    <Text style={styles.toolDescription}>
                      {markType === 'location'
                        ? existingMarkAttrs?.placeName || 'Update location details'
                        : existingMarkAttrs?.content || 'Update comment'}
                    </Text>
                  </View>
                  <View style={styles.shortcutBadge}>
                    <Text style={styles.shortcutText}>E</Text>
                  </View>
                </TouchableOpacity>

                {onDelete && (
                  <TouchableOpacity
                    style={[styles.toolButton, styles.toolButtonDelete]}
                    onPress={onDelete}
                  >
                    <View style={styles.toolIconContainer}>
                      <Ionicons name="trash" size={32} color="#EF4444" />
                    </View>
                    <View style={styles.toolTextContainer}>
                      <Text style={[styles.toolTitle, { color: '#EF4444' }]}>
                        Delete
                      </Text>
                      <Text style={styles.toolDescription}>
                        Remove this {markType === 'location' ? 'location' : 'comment'}
                      </Text>
                    </View>
                    <View style={styles.shortcutBadge}>
                      <Text style={styles.shortcutText}>D</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              // Create mode buttons
              <>
                <TouchableOpacity
                  style={[
                    styles.toolButton,
                    focusedTool === 'location' && styles.toolButtonFocused
                  ]}
                  onPress={handleLocationButtonClick}
                  onFocus={() => setFocusedTool('location')}
                >
                  <View style={styles.toolIconContainer}>
                    <Ionicons
                      name="location"
                      size={32}
                      color={focusedTool === 'location' ? '#3B82F6' : '#6B7280'}
                    />
                  </View>
                  <View style={styles.toolTextContainer}>
                    <Text style={[
                      styles.toolTitle,
                      focusedTool === 'location' && styles.toolTitleFocused
                    ]}>
                      Location
                    </Text>
                    <Text style={styles.toolDescription}>
                      Add a place or location marker
                    </Text>
                  </View>
                  <View style={styles.shortcutBadge}>
                    <Text style={styles.shortcutText}>L</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.toolButton,
                    focusedTool === 'comment' && styles.toolButtonFocused
                  ]}
                  onPress={onSelectComment}
                  onFocus={() => setFocusedTool('comment')}
                >
                  <View style={styles.toolIconContainer}>
                    <Ionicons
                      name="chatbubble"
                      size={32}
                      color={focusedTool === 'comment' ? '#3B82F6' : '#6B7280'}
                    />
                  </View>
                  <View style={styles.toolTextContainer}>
                    <Text style={[
                      styles.toolTitle,
                      focusedTool === 'comment' && styles.toolTitleFocused
                    ]}>
                      Comment
                    </Text>
                    <Text style={styles.toolDescription}>
                      Add a note or comment
                    </Text>
                  </View>
                  <View style={styles.shortcutBadge}>
                    <Text style={styles.shortcutText}>C</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Keyboard Hint */}
          <View style={styles.hintContainer}>
            <Text style={styles.hintText}>
              <Text style={styles.hintKey}>←→</Text> Navigate • <Text style={styles.hintKey}>Enter</Text> Select • <Text style={styles.hintKey}>Esc</Text> Close
            </Text>
          </View>
        </>
      );
    }

    // Step 2: Location Search
    if (currentStep === 'location-search') {
      return (
        <View style={styles.searchContainer}>
          {/* Header with back button */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Search Location</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Search Input */}
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for a location..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Results List */}
          <LocationResultsList
            results={searchResults}
            isLoading={isSearching}
            onSelectResult={handleLocationResultSelected}
            selectedIndex={selectedResultIndex}
          />
        </View>
      );
    }

    // Step 3: Transport Config
    if (currentStep === 'transport-config' && selectedLocation) {
      // Get the last geo-mark as default origin (most recently added location)
      const defaultOrigin = existingGeoMarks.length > 0
        ? {
            lat: existingGeoMarks[existingGeoMarks.length - 1].lat,
            lng: existingGeoMarks[existingGeoMarks.length - 1].lng,
            name: existingGeoMarks[existingGeoMarks.length - 1].placeName,
          }
        : null;

      return (
        <TransportConfigView
          locationName={selectedLocation.display_name}
          locationLat={parseFloat(selectedLocation.lat)}
          locationLng={parseFloat(selectedLocation.lon)}
          originLocation={defaultOrigin}
          allOrigins={existingGeoMarks}
          selectedMode={transportMode}
          onSelectMode={setTransportMode}
          onAddToDocument={handleAddToDocument}
          onBack={handleBackFromTransport}
          onRouteChange={handleRouteChange}
        />
      );
    }

    return null;
  };

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.bottomSheet,
            currentStep !== 'picker' && styles.bottomSheetExpanded
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {renderContent()}
        </Pressable>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  bottomSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    maxHeight: '60%',
  },
  bottomSheetExpanded: {
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 4,
    position: 'absolute',
    right: 16,
  },
  backButton: {
    padding: 4,
    position: 'absolute',
    left: 16,
  },
  headerSpacer: {
    width: 32,
  },
  previewContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previewText: {
    fontSize: 14,
    color: '#111827',
    fontStyle: 'italic',
  },
  toolsContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 16,
  },
  toolButtonFocused: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  toolButtonDelete: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  toolIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTextContainer: {
    flex: 1,
  },
  toolTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  toolTitleFocused: {
    color: '#3B82F6',
  },
  toolDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  shortcutBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  shortcutText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  hintContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  hintKey: {
    fontWeight: '600',
    color: '#6B7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  searchContainer: {
    flex: 1,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    outlineStyle: 'none',
  },
  clearButton: {
    padding: 4,
  },
});
