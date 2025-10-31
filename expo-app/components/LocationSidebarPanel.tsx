/**
 * LocationSidebarPanel - Location selection as a vertical sidebar
 *
 * Displays as a sidebar within the map panel (left-aligned)
 * Two-step process:
 * 1. Select location from Nominatim search results
 * 2. Configure transport mode and route
 */

import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface LocationData {
  placeName: string;
  lat: number;
  lng: number;
}

export interface TransportConfig {
  from: { lat: number; lng: number; name: string } | null;
  mode: 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';
  routeGeometry: any | null;
  routeDistance: number | null;
  routeDuration: number | null;
  waypoints: Array<{ lat: number; lng: number }>;
}

interface LocationSidebarPanelProps {
  // Sidebar visibility and control
  visible: boolean;
  onClose: () => void;

  // Step control
  step: 'location' | 'transport';
  onStepChange: (step: 'location' | 'transport') => void;

  // Location selection (Step 1)
  locationSearchResults: any[];
  selectedResultIndex: number;
  onSelectResult: (index: number) => void;
  isLoadingLocation: boolean;
  selectedLocation: LocationData | null;

  // Transport configuration (Step 2)
  transportConfig: TransportConfig;
  onTransportModeChange: (mode: TransportConfig['mode']) => void;
  onWaypointsChange: (waypoints: Array<{ lat: number; lng: number }>) => void;
  isLoadingRoute: boolean;

  // Positioning
  selectionTop?: number;
  arrowEndY?: number; // Y position where the arrow ends (for alignment)

  // Actions
  onContinue: () => void; // Move from Step 1 to Step 2
  onAddLocation: () => void; // Add location to document (Step 2)
  onFocusChange?: (index: number) => void; // Called when focused item changes
}

export default function LocationSidebarPanel({
  visible,
  onClose,
  step,
  onStepChange,
  locationSearchResults,
  selectedResultIndex,
  onSelectResult,
  isLoadingLocation,
  selectedLocation,
  transportConfig,
  onTransportModeChange,
  onWaypointsChange,
  isLoadingRoute,
  selectionTop = 200,
  arrowEndY,
  onContinue,
  onAddLocation,
  onFocusChange,
}: LocationSidebarPanelProps) {
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const scrollViewRef = React.useRef<ScrollView>(null);

  // Reset focused index when modal becomes visible
  React.useEffect(() => {
    if (visible) {
      setFocusedIndex(0);
    }
  }, [visible]);

  // Call onFocusChange when focused index changes
  React.useEffect(() => {
    if (visible && onFocusChange) {
      onFocusChange(focusedIndex);
    }
  }, [focusedIndex, visible, onFocusChange]);

  if (!visible) return null;

  // Show all location search results (with safety check and filtering out null/undefined)
  const displayResults = (locationSearchResults || []).filter(result => result != null);

  // Item height calculation: padding (16*2) + text height (~20) + number badge (26)
  // Approximate total: 58px per item + 12px gap = 70px
  const ITEM_HEIGHT = 82; // Item height + gap

  // Position box to align with arrow end position
  // If arrowEndY is provided, use it directly (it's already relative to contentWrapper)
  // Otherwise fall back to selectionTop calculation for backward compatibility
  // Move up by half an element (41px) so the curve connects to the middle of the first item
  const adjustedTop = (arrowEndY !== undefined ? arrowEndY : (selectionTop + 60 - 16)) - (ITEM_HEIGHT / 2);

  const handleScroll = (event: any) => {
    const scrollOffset = event.nativeEvent.contentOffset.y;
    const newFocusedIndex = Math.round(scrollOffset / ITEM_HEIGHT);
    setFocusedIndex(newFocusedIndex);
  };

  return (
    <>
      <View style={[styles.sidebar, { top: adjustedTop }]}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.mockBox}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="start"
          snapToStart={true}
          decelerationRate="fast"
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {isLoadingLocation && displayResults.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.loadingText}>Searching locations...</Text>
            </View>
          ) : displayResults.length === 0 ? (
            <View style={styles.noResultsContainer}>
              <Text style={styles.noResultsText}>No locations found</Text>
            </View>
          ) : displayResults.map((result, index) => (
            <View
              key={index}
              style={[
                styles.mockItem,
                index === focusedIndex && styles.mockItemFocused,
                index === displayResults.length - 1 && { marginBottom: 0 } // Remove margin from last item
              ]}
            >
              <View style={[styles.resultNumber, index === focusedIndex && styles.resultNumberFocused]}>
                <Text style={[styles.resultNumberText, index === focusedIndex && styles.resultNumberTextFocused]}>{index + 1}</Text>
              </View>
              <Text style={styles.resultText} numberOfLines={1}>
                {result?.display_name || 'Unknown location'}
              </Text>
            </View>
          ))}

          {/* Add invisible spacers at the bottom so list can scroll */}
          <View style={{ height: ITEM_HEIGHT * 3 }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    left: -100, // Negative value to overlap the document panel
    width: 300,
    height: 300,
    zIndex: 100,
  },
  scrollView: {
    height: 300,
    // Web-specific scroll snap properties
    scrollSnapType: 'y mandatory' as any,
  },
  mockBox: {
    // gap handled by marginBottom on individual items
  },
  mockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 2,
    borderColor: 'transparent',
    height: 70,  // Fixed height for consistent snapping
    marginBottom: 12,  // Gap between items
    // Web-specific scroll snap property
    scrollSnapAlign: 'start' as any,
  },
  mockItemFocused: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
  },
  noResultsContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  noResultsText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
    gap: 16,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  resultItemSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  resultNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultNumberFocused: {
    backgroundColor: '#3b82f6',
  },
  resultNumberSelected: {
    backgroundColor: '#3b82f6',
  },
  resultNumberText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  resultNumberTextFocused: {
    color: '#ffffff',
  },
  resultNumberTextSelected: {
    color: '#ffffff',
  },
  resultText: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginBottom: 8,
  },
  selectedChipText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    fontWeight: '500',
    lineHeight: 18,
  },
  fromBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  fromText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  noFrom: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    gap: 8,
  },
  noFromText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  transportModes: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  modeButton: {
    flex: 1,
    minWidth: 85,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    gap: 4,
  },
  modeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  modeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b7280',
  },
  modeTextActive: {
    color: '#ffffff',
  },
  routeLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  routeLoadingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  routeInfo: {
    flexDirection: 'row',
    gap: 16,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeInfoText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  footer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    gap: 6,
  },
  primaryButtonDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    gap: 6,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
});
