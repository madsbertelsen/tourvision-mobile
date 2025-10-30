/**
 * LocationModalPanel - Reusable location selection modal
 *
 * Displays as an overlay within a container (not full-screen)
 * Two-step process:
 * 1. Select location from Nominatim search results
 * 2. Configure transport mode and route
 */

import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LocationSearchMap from '@/components/LocationSearchMap';

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

interface LocationModalPanelProps {
  // Modal visibility and control
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

  // All locations (for map display)
  existingLocations: Array<{ geoId: string; placeName: string; lat: number; lng: number }>;

  // Actions
  onContinue: () => void; // Move from Step 1 to Step 2
  onAddLocation: () => void; // Add location to document (Step 2)
}

export default function LocationModalPanel({
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
  existingLocations,
  onContinue,
  onAddLocation,
}: LocationModalPanelProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      {/* Bottom Sheet */}
      <View style={styles.modalContent}>
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {step === 'location' ? 'Add Location' : 'Configure Transport'}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#6b7280" />
          </TouchableOpacity>
        </View>

        <View style={styles.modalBody}>
          {/* Map Section - 60% height - Always rendered for both steps */}
          <View style={styles.mapSection}>
            <View style={styles.mapContainer}>
              <LocationSearchMap
                results={locationSearchResults}
                selectedIndex={selectedResultIndex}
                onSelectResult={onSelectResult}
                existingLocations={existingLocations}
                routeFrom={transportConfig.from}
                routeTo={selectedLocation}
                routeGeometry={transportConfig.routeGeometry}
                showRoute={step === 'transport'}
                waypoints={transportConfig.waypoints}
                onWaypointsChange={onWaypointsChange}
              />
            </View>
          </View>

          {/* Bottom Section - 40% height - Content changes based on step */}
          <View style={styles.resultsSection}>
            <ScrollView contentContainerStyle={styles.transportFormContent}>
              {step === 'location' && (
                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>SELECT LOCATION</Text>
                  {locationSearchResults.length > 0 && !isLoadingLocation ? (
                    locationSearchResults.map((result, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.locationResultItem,
                          index === selectedResultIndex && styles.locationResultItemSelected
                        ]}
                        onPress={() => onSelectResult(index)}
                      >
                        <View style={[
                          styles.locationResultNumber,
                          index === selectedResultIndex && styles.locationResultNumberSelected
                        ]}>
                          <Text style={styles.locationResultNumberText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.locationResultText} numberOfLines={2}>
                          {result.display_name}
                        </Text>
                        {index === selectedResultIndex && (
                          <Ionicons name="checkmark-circle" size={24} color="#3b82f6" />
                        )}
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.emptyResultsState}>
                      <Ionicons name="search" size={32} color="#9ca3af" />
                      <Text style={styles.emptyResultsText}>
                        {isLoadingLocation ? 'Searching locations...' : 'Search results will appear here'}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {step === 'transport' && (
                <>
                  {/* Selected Location Display */}
                  {selectedLocation && (
                    <View style={styles.selectedLocationChip}>
                      <Ionicons name="location" size={20} color="#3b82f6" />
                      <Text style={styles.selectedLocationText} numberOfLines={2}>
                        {selectedLocation.placeName}
                      </Text>
                    </View>
                  )}

                  {/* Starting Location Section */}
                  <View style={styles.formSection}>
                    <Text style={styles.formSectionTitle}>FROM</Text>
                    {transportConfig.from ? (
                      <View style={styles.transportFromBox}>
                        <Ionicons name="location-outline" size={20} color="#6b7280" />
                        <Text style={styles.transportFromText}>{transportConfig.from.name}</Text>
                        <TouchableOpacity
                          style={styles.changeButton}
                          onPress={() => {
                            // TODO: Add ability to change starting location
                            console.log('Change starting location');
                          }}
                        >
                          <Text style={styles.changeButtonText}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.noTransportFrom}>
                        <Ionicons name="information-circle-outline" size={20} color="#9ca3af" />
                        <Text style={styles.noTransportFromText}>No previous location - starting fresh</Text>
                      </View>
                    )}
                  </View>

                  {/* Transport Mode Section */}
                  <View style={styles.formSection}>
                    <Text style={styles.formSectionTitle}>TRANSPORT MODE</Text>
                    <View style={styles.transportModes}>
                      <TouchableOpacity
                        style={[styles.modeButton, transportConfig.mode === 'walking' && styles.modeButtonActive]}
                        onPress={() => onTransportModeChange('walking')}
                      >
                        <Ionicons name="walk" size={24} color={transportConfig.mode === 'walking' ? '#fff' : '#6b7280'} />
                        <Text style={[styles.modeButtonText, transportConfig.mode === 'walking' && styles.modeButtonTextActive]}>
                          Walk
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeButton, transportConfig.mode === 'driving' && styles.modeButtonActive]}
                        onPress={() => onTransportModeChange('driving')}
                      >
                        <Ionicons name="car" size={24} color={transportConfig.mode === 'driving' ? '#fff' : '#6b7280'} />
                        <Text style={[styles.modeButtonText, transportConfig.mode === 'driving' && styles.modeButtonTextActive]}>
                          Drive
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeButton, transportConfig.mode === 'transit' && styles.modeButtonActive]}
                        onPress={() => onTransportModeChange('transit')}
                      >
                        <Ionicons name="train" size={24} color={transportConfig.mode === 'transit' ? '#fff' : '#6b7280'} />
                        <Text style={[styles.modeButtonText, transportConfig.mode === 'transit' && styles.modeButtonTextActive]}>
                          Transit
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeButton, transportConfig.mode === 'cycling' && styles.modeButtonActive]}
                        onPress={() => onTransportModeChange('cycling')}
                      >
                        <Ionicons name="bicycle" size={24} color={transportConfig.mode === 'cycling' ? '#fff' : '#6b7280'} />
                        <Text style={[styles.modeButtonText, transportConfig.mode === 'cycling' && styles.modeButtonTextActive]}>
                          Cycle
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeButton, transportConfig.mode === 'flight' && styles.modeButtonActive]}
                        onPress={() => onTransportModeChange('flight')}
                      >
                        <Ionicons name="airplane" size={24} color={transportConfig.mode === 'flight' ? '#fff' : '#6b7280'} />
                        <Text style={[styles.modeButtonText, transportConfig.mode === 'flight' && styles.modeButtonTextActive]}>
                          Flight
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Route Preview Section */}
                  {transportConfig.from && selectedLocation && (
                    <View style={styles.formSection}>
                      <Text style={styles.formSectionTitle}>ROUTE PREVIEW</Text>
                      {isLoadingRoute ? (
                        <View style={styles.routePreviewLoading}>
                          <ActivityIndicator size="small" color="#3b82f6" />
                          <Text style={styles.routePreviewLoadingText}>Calculating route...</Text>
                        </View>
                      ) : transportConfig.routeDistance && transportConfig.routeDuration ? (
                        <View style={styles.routeInfo}>
                          <View style={styles.routeInfoItem}>
                            <Ionicons name="navigate" size={20} color="#6b7280" />
                            <Text style={styles.routeInfoText}>
                              {(transportConfig.routeDistance / 1000).toFixed(1)} km
                            </Text>
                          </View>
                          <View style={styles.routeInfoItem}>
                            <Ionicons name="time" size={20} color="#6b7280" />
                            <Text style={styles.routeInfoText}>
                              {Math.round(transportConfig.routeDuration / 60)} min
                            </Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>

        <View style={styles.modalFooter}>
          {step === 'location' ? (
            // Step 1: Continue to transport configuration
            <TouchableOpacity
              style={[styles.saveButton, !selectedLocation && styles.saveButtonDisabled]}
              onPress={onContinue}
              disabled={!selectedLocation}
            >
              <Text style={styles.saveButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            // Step 2: Add to document with transport info
            <View style={styles.footerButtons}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  onStepChange('location');
                  onWaypointsChange([]);
                }}
              >
                <Ionicons name="arrow-back" size={20} color="#3b82f6" />
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, styles.primaryButton]}
                onPress={onAddLocation}
              >
                <Ionicons name="location" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Add to Document</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 1000,
  },
  modalContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '85%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#d1d5db',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  modalBody: {
    flex: 1,
  },
  mapSection: {
    height: '60%',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  mapContainer: {
    flex: 1,
  },
  resultsSection: {
    height: '40%',
  },
  transportFormContent: {
    padding: 20,
    gap: 20,
  },
  formSection: {
    gap: 12,
  },
  formSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    letterSpacing: 0.5,
  },
  locationResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  locationResultItemSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  locationResultNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationResultNumberSelected: {
    backgroundColor: '#3b82f6',
  },
  locationResultNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  locationResultText: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  emptyResultsState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyResultsText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  selectedLocationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  selectedLocationText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  transportFromBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  transportFromText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
  },
  changeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  noTransportFrom: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    gap: 8,
  },
  noTransportFromText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  transportModes: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  modeButton: {
    flex: 1,
    minWidth: 90,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    gap: 4,
  },
  modeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  routePreviewLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  routePreviewLoadingText: {
    fontSize: 14,
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
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    gap: 8,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  primaryButton: {
    flex: 2,
  },
});
