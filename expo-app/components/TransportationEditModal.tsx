import React, { useState, useEffect, Suspense } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { TransportationData } from './TransportationCard';
import MapView from './dom/MapViewDOM';
import { 
  fetchTransportationOptions, 
  fetchRouteDetailsWithCache,
  type TransportationOption,
  type RouteDetails 
} from '../utils/transportation-api';

interface TransportationEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (transportation: TransportationData) => void;
  initialData?: TransportationData;
  fromPlace: string;
  toPlace: string;
  fromLocation?: { lat: number; lng: number };
  toLocation?: { lat: number; lng: number };
}

const PRIMARY_TRANSPORT_MODES: Array<{
  mode: TransportationData['mode'];
  label: string;
  icon: { name: any; library: 'Feather' | 'MaterialIcons' | 'Ionicons' };
  color: string;
}> = [
  { mode: 'walking', label: 'Walking', icon: { name: 'walk', library: 'Ionicons' }, color: '#10B981' },
  { mode: 'metro', label: 'Metro', icon: { name: 'subway', library: 'MaterialIcons' }, color: '#EF4444' },
  { mode: 'bus', label: 'Bus', icon: { name: 'bus', library: 'Ionicons' }, color: '#3B82F6' },
  { mode: 'taxi', label: 'Taxi', icon: { name: 'local-taxi', library: 'MaterialIcons' }, color: '#F59E0B' },
  { mode: 'car', label: 'Car', icon: { name: 'car', library: 'Ionicons' }, color: '#6B7280' },
];

const SECONDARY_TRANSPORT_MODES: Array<{
  mode: TransportationData['mode'];
  label: string;
  icon: { name: any; library: 'Feather' | 'MaterialIcons' | 'Ionicons' };
  color: string;
}> = [
  { mode: 'uber', label: 'Uber/Lyft', icon: { name: 'car', library: 'Ionicons' }, color: '#000000' },
  { mode: 'bike', label: 'Bike', icon: { name: 'bicycle', library: 'Ionicons' }, color: '#8B5CF6' },
  { mode: 'train', label: 'Train', icon: { name: 'train', library: 'Ionicons' }, color: '#059669' },
];

export default function TransportationEditModal({
  visible,
  onClose,
  onSave,
  initialData,
  fromPlace,
  toPlace,
  fromLocation,
  toLocation,
}: TransportationEditModalProps) {
  const [selectedMode, setSelectedMode] = useState<TransportationData['mode']>(
    initialData?.mode || 'walking'
  );
  const [duration, setDuration] = useState(initialData?.duration || '');
  const [distance, setDistance] = useState(initialData?.distance || '');
  const [cost, setCost] = useState(initialData?.cost?.toString() || '');
  const [route, setRoute] = useState(initialData?.route || '');
  
  // Show more options if a secondary mode is selected
  const isSecondaryMode = SECONDARY_TRANSPORT_MODES.some(m => m.mode === initialData?.mode);
  const [showMoreOptions, setShowMoreOptions] = useState(isSecondaryMode);
  
  // Transportation options from API
  const [transportOptions, setTransportOptions] = useState<TransportationOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<TransportationOption | null>(null);
  const [routeDetails, setRouteDetails] = useState<RouteDetails | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  
  // Fetch transportation options when modal opens
  useEffect(() => {
    if (visible && fromLocation && toLocation) {
      fetchOptions();
    }
  }, [visible, fromLocation, toLocation]);
  
  // Fetch route details when option is selected
  useEffect(() => {
    if (selectedOption) {
      fetchRoute(selectedOption.routeUrl);
    }
  }, [selectedOption]);
  
  const fetchOptions = async () => {
    if (!fromLocation || !toLocation) return;
    
    setIsLoadingOptions(true);
    setOptionsError(null);
    
    try {
      const options = await fetchTransportationOptions(
        fromLocation.lat,
        fromLocation.lng,
        toLocation.lat,
        toLocation.lng
      );
      
      setTransportOptions(options);
      
      // Auto-select recommended option or match initial mode
      const recommendedOption = options.find(opt => opt.recommended) || options[0];
      const matchingOption = options.find(opt => opt.mode === initialData?.mode);
      const optionToSelect = matchingOption || recommendedOption;
      
      if (optionToSelect) {
        setSelectedOption(optionToSelect);
        setSelectedMode(optionToSelect.mode);
        setDuration(optionToSelect.formattedDuration);
        setDistance(optionToSelect.formattedDistance);
        if (optionToSelect.estimatedCost !== undefined) {
          setCost(optionToSelect.estimatedCost.toString());
        }
      }
    } catch (error) {
      console.error('Failed to fetch transportation options:', error);
      setOptionsError('Failed to load transportation options');
    } finally {
      setIsLoadingOptions(false);
    }
  };
  
  const fetchRoute = async (routeUrl: string) => {
    setIsLoadingRoute(true);
    
    try {
      const details = await fetchRouteDetailsWithCache(routeUrl);
      console.log('Fetched route details for URL:', routeUrl);
      console.log('Route details:', details);
      console.log('Route geometry:', details?.geometry);
      setRouteDetails(details);
    } catch (error) {
      console.error('Failed to fetch route details:', error);
    } finally {
      setIsLoadingRoute(false);
    }
  };
  
  const handleModeSelect = (option: TransportationOption) => {
    setSelectedOption(option);
    setSelectedMode(option.mode);
    setDuration(option.formattedDuration);
    setDistance(option.formattedDistance);
    if (option.estimatedCost !== undefined) {
      setCost(option.estimatedCost.toString());
    }
    // Fetch the route details when an option is selected
    if (option.routeUrl) {
      fetchRoute(option.routeUrl);
    }
  };

  const handleSave = () => {
    const transportation: TransportationData = {
      mode: selectedMode,
      duration: duration || '5 min',
      distance: distance || undefined,
      cost: cost ? parseFloat(cost) : undefined,
      route: route || undefined,
      routeUrl: selectedOption?.routeUrl,
      routeGeometry: routeDetails?.geometry,
    };
    console.log('Saving transportation with geometry:', transportation.routeGeometry);
    console.log('Full transportation data:', transportation);
    onSave(transportation);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Transportation</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.routeInfo}>
            <View style={styles.routeRow}>
              <Text style={styles.routeLabel}>From:</Text>
              <Text style={styles.routePlaceName} numberOfLines={1}>{fromPlace}</Text>
            </View>
            <Feather name="arrow-right" size={14} color="#6B7280" style={styles.routeArrow} />
            <View style={styles.routeRow}>
              <Text style={styles.routeLabel}>To:</Text>
              <Text style={styles.routePlaceName} numberOfLines={1}>{toPlace}</Text>
            </View>
          </View>

          {fromLocation && toLocation && (
            <View style={styles.mapSection}>
              <View style={styles.mapContainer}>
                <Suspense fallback={
                  <View style={styles.mapLoading}>
                    <ActivityIndicator size="large" color="#6366F1" />
                  </View>
                }>
                  <MapView 
                    locations={[
                      {
                        id: 'from',
                        name: fromPlace,
                        lat: fromLocation.lat,
                        lng: fromLocation.lng,
                        description: 'Start',
                        colorIndex: 0,
                      },
                      {
                        id: 'to',
                        name: toPlace,
                        lat: toLocation.lat,
                        lng: toLocation.lng,
                        description: 'End',
                        colorIndex: 1,
                      }
                    ]}
                    style={{ width: '100%', height: 300 }}
                    showRoute={true}
                    routeGeometry={routeDetails?.geometry}
                    routeColor={
                      [...PRIMARY_TRANSPORT_MODES, ...SECONDARY_TRANSPORT_MODES]
                        .find(m => m.mode === selectedMode)?.color || '#6366F1'
                    }
                  />
                </Suspense>
              </View>
              
              {/* Transportation options overlay - vertical on left */}
              <ScrollView 
                style={styles.mapOverlay}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.mapOverlayContent}
              >
                  {isLoadingOptions ? (
                    <View style={styles.overlayLoadingContainer}>
                      <ActivityIndicator size="small" color="#6366F1" />
                      <Text style={styles.overlayLoadingText}>Loading...</Text>
                    </View>
                  ) : (
                    // Always show buttons - use API data if available, otherwise show default modes
                    (transportOptions.length > 0 ? transportOptions : PRIMARY_TRANSPORT_MODES.map(mode => ({
                      mode: mode.mode,
                      formattedDuration: '',
                      formattedDistance: '',
                      routeUrl: '',
                    }))).map((option) => {
                      const modeConfig = [...PRIMARY_TRANSPORT_MODES, ...SECONDARY_TRANSPORT_MODES].find(
                        m => m.mode === option.mode
                      );
                      const IconComponent = 
                        modeConfig?.icon.library === 'Feather' ? Feather : 
                        modeConfig?.icon.library === 'MaterialIcons' ? MaterialIcons : 
                        Ionicons;
                      
                      return (
                        <TouchableOpacity
                          key={option.mode}
                          style={[
                            styles.overlayCard,
                            selectedMode === option.mode && styles.overlayCardSelected,
                          ]}
                          onPress={() => {
                            if ('formattedDuration' in option && option.formattedDuration) {
                              handleModeSelect(option as any);
                            } else {
                              // Manual selection when no API data
                              setSelectedMode(option.mode);
                              setSelectedOption(null);
                              
                              // Try to fetch route for this mode
                              if (fromLocation && toLocation) {
                                const modeMapping: Record<string, string> = {
                                  walking: 'walking',
                                  metro: 'walking',
                                  bus: 'walking',
                                  taxi: 'driving',
                                  uber: 'driving',
                                  car: 'driving',
                                  bike: 'cycling',
                                  train: 'walking'
                                };
                                
                                const routeMode = modeMapping[option.mode] || 'walking';
                                const routeUrl = `/api/route?coordinates=${fromLocation.lng},${fromLocation.lat};${toLocation.lng},${toLocation.lat}&mode=${routeMode}`;
                                
                                // Fetch route geometry
                                fetchRoute(routeUrl);
                              }
                            }
                          }}
                        >
                          <View style={styles.overlayCardContent}>
                            {modeConfig && (
                              <View style={[
                                styles.overlayIcon,
                                { backgroundColor: `${modeConfig.color}15` },
                                selectedMode === option.mode && { backgroundColor: modeConfig.color },
                              ]}>
                                <IconComponent 
                                  name={modeConfig.icon.name} 
                                  size={14} 
                                  color={selectedMode === option.mode ? 'white' : modeConfig.color} 
                                />
                              </View>
                            )}
                            <View style={styles.overlayInfo}>
                              <View style={styles.overlayTextRow}>
                                <Text style={[
                                  styles.overlayLabel,
                                  selectedMode === option.mode && styles.overlayLabelSelected,
                                ]}>
                                  {modeConfig?.label || option.mode}
                                </Text>
                                {'recommended' in option && option.recommended && (
                                  <Text style={styles.overlayRecommended}> ★</Text>
                                )}
                              </View>
                              {'formattedDuration' in option && option.formattedDuration && (
                                <Text style={styles.overlayDetails}>
                                  {option.formattedDuration}
                                </Text>
                              )}
                              {'estimatedCost' in option && option.estimatedCost !== undefined && option.estimatedCost > 0 && (
                                <Text style={styles.overlayPrice}>
                                  ${option.estimatedCost.toFixed(2)}
                                </Text>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
              </ScrollView>
            </View>
          )}

          <ScrollView style={styles.scrollContent}>
            {/* Show mode selector when no locations available */}
            {(!fromLocation || !toLocation) && (
              <>
                <Text style={styles.sectionTitle}>Transportation Mode</Text>
                <View style={styles.modeGrid}>
                  {PRIMARY_TRANSPORT_MODES.map((mode) => {
                    const IconComponent = 
                      mode.icon.library === 'Feather' ? Feather :
                      mode.icon.library === 'MaterialIcons' ? MaterialIcons :
                      Ionicons;
                    
                    return (
                      <TouchableOpacity
                        key={mode.mode}
                        style={[
                          styles.modeCard,
                          selectedMode === mode.mode && styles.modeCardSelected,
                        ]}
                        onPress={() => {
                          setSelectedMode(mode.mode);
                          // Clear any existing option data when manually selecting
                          setSelectedOption(null);
                        }}
                      >
                        <View style={[
                          styles.modeIcon,
                          { backgroundColor: `${mode.color}15` },
                          selectedMode === mode.mode && { backgroundColor: mode.color },
                        ]}>
                          <IconComponent
                            name={mode.icon.name}
                            size={18}
                            color={selectedMode === mode.mode ? 'white' : mode.color}
                          />
                        </View>
                        <Text style={[
                          styles.modeLabel,
                          selectedMode === mode.mode && styles.modeLabelSelected,
                        ]}>
                          {mode.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Duration</Text>
            <TextInput
              style={styles.input}
              value={duration}
              onChangeText={setDuration}
              placeholder="e.g., 15 min"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.sectionTitle}>Distance (optional)</Text>
            <TextInput
              style={styles.input}
              value={distance}
              onChangeText={setDistance}
              placeholder="e.g., 2.5 km"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.sectionTitle}>Cost (optional)</Text>
            <TextInput
              style={styles.input}
              value={cost}
              onChangeText={setCost}
              placeholder="e.g., 5.00"
              keyboardType="decimal-pad"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.sectionTitle}>Route Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={route}
              onChangeText={setRoute}
              placeholder="e.g., Take Line 1 to Châtelet, then Line 4"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  routeInfo: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '40%',
  },
  routeLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 4,
  },
  routePlaceName: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
  routeArrow: {
    marginHorizontal: 8,
  },
  mapContainer: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  mapLoading: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    marginTop: 8,
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 16,
  },
  modeCard: {
    width: '23%',
    alignItems: 'center',
    margin: '1%',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modeCardSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  modeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modeLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  modeLabelSelected: {
    color: '#6366F1',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#374151',
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#6366F1',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
  },
  retryButtonText: {
    fontSize: 14,
    color: '#6366F1',
    fontWeight: '600',
  },
  optionsList: {
    marginBottom: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
  },
  optionCardSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  optionLabelSelected: {
    color: '#6366F1',
  },
  optionDetails: {
    fontSize: 13,
    color: '#6B7280',
  },
  recommendedBadge: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500',
  },
  mapSection: {
    position: 'relative',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  mapOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    bottom: 12,
    width: 140,
    zIndex: 10,
  },
  mapOverlayContent: {
    paddingBottom: 6,
  },
  overlayCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  overlayCardSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#F0F4FF',
  },
  overlayCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  overlayIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  overlayInfo: {
    flex: 1,
  },
  overlayTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlayLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 14,
  },
  overlayLabelSelected: {
    color: '#6366F1',
  },
  overlayDetails: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 12,
  },
  overlayPrice: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
    lineHeight: 13,
  },
  overlayRecommended: {
    color: '#F59E0B',
    fontSize: 11,
  },
  overlayLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  overlayLoadingText: {
    marginLeft: 6,
    fontSize: 11,
    color: '#6B7280',
  },
});