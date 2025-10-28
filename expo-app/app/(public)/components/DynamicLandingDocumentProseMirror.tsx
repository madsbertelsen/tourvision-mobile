import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Text, Pressable, Platform, Modal, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import { ProseMirrorToolbar } from '@/components/ProseMirrorToolbar';
import { TypingAnimatorCommands, AnimationState, DEFAULT_TYPING_CONFIG } from '@/utils/typing-animator-commands';
import { EditorCommand } from '@/utils/command-sequence-generator';
import { Ionicons } from '@expo/vector-icons';
import { LANDING_DOCUMENT_CONTENT } from '@/utils/landing-document-content';
import LocationSearchMap from '@/components/LocationSearchMap';
import LocationMapWeb from '@/components/LocationMapWeb';

interface Location {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
}

interface DynamicLandingDocumentProseMirrorProps {
  onLocationsChange?: (locations: Location[]) => void;
}

// Use the full landing page content
const INITIAL_CONTENT = LANDING_DOCUMENT_CONTENT;

export default function DynamicLandingDocumentProseMirror({ onLocationsChange }: DynamicLandingDocumentProseMirrorProps) {
  const [animationState, setAnimationState] = useState<AnimationState | null>(null);
  const [highlightedButton, setHighlightedButton] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [animationStarted, setAnimationStarted] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationModalData, setLocationModalData] = useState<{ placeName: string; lat: number; lng: number } | null>(null);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationSearchResults, setLocationSearchResults] = useState<any[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);

  // Two-step modal flow state
  const [modalStep, setModalStep] = useState<'location' | 'transport'>('location');
  const [selectedLocation, setSelectedLocation] = useState<{ placeName: string; lat: number; lng: number } | null>(null);
  const [transportMode, setTransportMode] = useState<'walking' | 'driving' | 'transit' | 'cycling' | 'flight'>('walking');
  const [transportFrom, setTransportFrom] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<any>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [viewMode, setViewMode] = useState<'document' | 'map'>('document');
  const animatorRef = useRef<TypingAnimatorCommands | null>(null);
  const webViewRef = useRef<ProseMirrorWebViewRef>(null);
  const editorContainerRef = useRef<View>(null);
  // Use ref instead of state to avoid callback recreation
  const isAnimationCompleteRef = useRef(false);

  // Track text selection for geo-mark creation
  const pendingGeoMarkRef = useRef<{ start: number; end: number; data: any } | null>(null);

  // Initialize animator
  useEffect(() => {
    const animator = new TypingAnimatorCommands(
      DEFAULT_TYPING_CONFIG,
      (state) => {
        console.log('[Landing] Animation state update:', {
          currentIndex: state.currentIndex,
          isPaused: state.isPaused,
          isComplete: state.isComplete
        });
        setAnimationState(state);
        // Update ref when animation completes
        if (state.isComplete) {
          isAnimationCompleteRef.current = true;
        }
      },
      (command) => {
        handleCommand(command);
      }
    );

    animatorRef.current = animator;

    return () => {
      animator.pause();
    };
  }, []);

  // Start animation when editor is ready - DO NOT use timeout, start immediately
  useEffect(() => {
    if (editorReady && animatorRef.current && !animationStarted) {
      console.log('[Landing] ===== STARTING ANIMATION IMMEDIATELY =====');
      console.log('[Landing] Editor ready state:', editorReady);
      console.log('[Landing] WebView ref exists:', !!webViewRef.current);
      console.log('[Landing] sendCommand available:', typeof webViewRef.current?.sendCommand);

      setAnimationStarted(true);
      animatorRef.current?.start();
    }
  }, [editorReady, animationStarted]);

  const handleCommand = (command: EditorCommand) => {
    if (!webViewRef.current) {
      console.error('[Landing] CRITICAL: No webViewRef for command:', command.type);
      return;
    }

    // Log every 10th character, or all non-text commands
    if (command.type !== 'insertText' || Math.random() < 0.1) {
      console.log('[Landing] Executing command:', command.type, command.text ? `"${command.text}"` : '');
    }

    switch (command.type) {
      case 'insertText':
        webViewRef.current.sendCommand('insertText', { text: command.text });
        break;

      case 'insertParagraph':
        webViewRef.current.sendCommand('insertParagraph');
        break;

      case 'setHeading':
        flashButton(`heading-${command.level}`);
        webViewRef.current.sendCommand('setHeading', { level: command.level });
        break;

      case 'toggleBold':
        flashButton('bold');
        webViewRef.current.sendCommand('toggleBold');
        break;

      case 'selectText':
        console.log('[Landing] Selecting text, count:', command.count);
        // Enable location button during selection
        setHasTextSelection(true);
        // Select text by moving cursor backwards (Shift+ArrowLeft)
        webViewRef.current.sendCommand('selectText', { count: command.count });
        break;

      case 'createGeoMark':
        flashButton('location');
        // Text should already be selected by the previous selectText command
        console.log('[Landing] Creating geo-mark from selection:', {
          placeName: command.geoMarkData.placeName,
          selectedText: command.geoMarkData.selectedText
        });

        // Pause animation while modal is showing
        if (animatorRef.current) {
          animatorRef.current.pause();
        }

        // Create geo-mark IMMEDIATELY (this clears the selection)
        webViewRef.current.sendCommand('createGeoMark', {
          geoMarkData: command.geoMarkData,
        });

        // Add location to tracking array
        const newLocation: Location = {
          geoId: command.geoMarkData.geoId,
          placeName: command.geoMarkData.placeName,
          lat: command.geoMarkData.lat,
          lng: command.geoMarkData.lng,
        };

        setLocations(prev => {
          const updated = [...prev, newLocation];
          // Notify parent component after state update completes
          setTimeout(() => onLocationsChange?.(updated), 0);
          return updated;
        });

        // Fetch location data from Nominatim
        const searchQuery = command.geoMarkData.placeName || command.geoMarkData.selectedText;
        setIsLoadingLocation(true);
        setLocationSearchResults([]);
        setSelectedResultIndex(0);
        setShowLocationModal(true);

        fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=jsonv2&limit=5&addressdetails=1`,
          { headers: { 'User-Agent': 'TourVision-App' } }
        )
          .then(res => res.json())
          .then(data => {
            setLocationSearchResults(data || []);
            setIsLoadingLocation(false);
            // Set the first result as selected
            if (data && data.length > 0) {
              setLocationModalData({
                placeName: data[0].display_name,
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
              });
            }
          })
          .catch(error => {
            console.error('Error fetching location:', error);
            setIsLoadingLocation(false);
            // Fallback to provided coordinates
            setLocationModalData({
              placeName: searchQuery,
              lat: command.geoMarkData.lat || 48.8566,
              lng: command.geoMarkData.lng || 2.3522,
            });
          });

        // Auto-close modal and resume animation after 3 seconds
        setTimeout(() => {
          setShowLocationModal(false);
          setHasTextSelection(false); // Disable location button after creation

          // Resume animation
          if (animatorRef.current) {
            animatorRef.current.resume();
          }
        }, 3000);
        break;

      case 'wait':
        // Animation complete signal
        break;
    }
  };

  const flashButton = (buttonId: string) => {
    setHighlightedButton(buttonId);
    setTimeout(() => {
      setHighlightedButton(null);
    }, 300);
  };

  const handleSkip = () => {
    if (animatorRef.current) {
      animatorRef.current.skip();
    }
  };

  const handlePauseResume = () => {
    if (animatorRef.current) {
      if (animationState?.isPaused) {
        animatorRef.current.resume();
      } else {
        animatorRef.current.pause();
      }
    }
  };

  const progress = animatorRef.current?.getProgress() || 0;

  // Handle creating geo-mark from floating menu
  const handleCreateGeoMarkFromMenu = () => {
    if (!selectedText || !webViewRef.current) return;

    // Hide the floating menu
    setShowFloatingMenu(false);

    // Create the geo-mark
    const geoMarkData = {
      geoId: `manual-${Date.now()}`,
      placeName: selectedText,
      selectedText: selectedText,
      lat: 0, // Will be filled by Nominatim
      lng: 0,
      colorIndex: locations.length % 10,
      coordSource: 'manual',
    };

    webViewRef.current.sendCommand('createGeoMark', { geoMarkData });

    // Fetch location from Nominatim
    setIsLoadingLocation(true);
    setLocationSearchResults([]);
    setSelectedResultIndex(0);
    setShowLocationModal(true);

    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(selectedText)}&format=jsonv2&limit=5&addressdetails=1`,
      { headers: { 'User-Agent': 'TourVision-App' } }
    )
      .then(res => res.json())
      .then(data => {
        setLocationSearchResults(data || []);
        setIsLoadingLocation(false);
        if (data && data.length > 0) {
          const newLocation: Location = {
            geoId: geoMarkData.geoId,
            placeName: data[0].display_name,
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          };

          setLocations(prev => {
            const updated = [...prev, newLocation];
            // Notify parent component after state update completes
            setTimeout(() => onLocationsChange?.(updated), 0);
            return updated;
          });

          setLocationModalData({
            placeName: data[0].display_name,
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          });
        }
      })
      .catch(error => {
        console.error('Error fetching location:', error);
        setIsLoadingLocation(false);
      });

    // Auto-close modal after 3 seconds
    setTimeout(() => {
      setShowLocationModal(false);
    }, 3000);
  };

  // Memoize callbacks to prevent iframe recreation on every render
  // Use refs instead of state in dependencies to keep callbacks stable
  const handleContentChange = useCallback((doc: any) => {
    // Handle user edits after animation completes
    if (isAnimationCompleteRef.current) {
      console.log('[Landing] User edited document');
    }
  }, []);

  const handleSelectionChange = useCallback((empty: boolean, selectedText: string, boundingRect: any) => {
    // NOTE: Floating menu is now handled entirely inside ProseMirror WebView
    // This handler is kept for compatibility but doesn't show React Native menu anymore
    console.log('[Landing] handleSelectionChange called (no-op, using ProseMirror tooltip):', { empty, selectedText });

    // Still update hasTextSelection state for other features that might use it
    if (isAnimationCompleteRef.current) {
      setTimeout(() => {
        setHasTextSelection(!empty);
      }, 0);
    }
  }, []);

  const handleReady = useCallback(() => {
    console.log('[Landing] ===== EDITOR ONREADY CALLBACK FIRED =====');
    console.log('[Landing] Setting editorReady to TRUE');

    // Send Mapbox token to WebView
    if (webViewRef.current) {
      webViewRef.current.sendCommand('setMapboxToken', {
        token: process.env.EXPO_PUBLIC_MAPBOX_TOKEN
      });
    }

    setEditorReady(true);
    console.log('[Landing] editorReady state should now be true');
  }, []);

  const handleShowGeoMarkEditor = useCallback((data: any, locations: any[]) => {
    console.log('[Landing] handleShowGeoMarkEditor called with:', data);

    // Get the search query from selected text
    const searchQuery = data.selectedText || '';

    if (!searchQuery.trim()) {
      console.warn('[Landing] No text selected, cannot create location');
      return;
    }

    // Store selection range
    setSelectionRange({ from: data.from, to: data.to });

    // Show the modal immediately
    setShowLocationModal(true);
    setIsLoadingLocation(true);
    setLocationSearchResults([]);
    setSelectedResultIndex(0);

    // Fetch location data from Nominatim
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=jsonv2&limit=5&addressdetails=1`,
      { headers: { 'User-Agent': 'TourVision-App' } }
    )
      .then(res => res.json())
      .then(results => {
        setLocationSearchResults(results || []);
        setIsLoadingLocation(false);
        // Set the first result as selected
        if (results && results.length > 0) {
          setLocationModalData({
            placeName: results[0].display_name,
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
          });
        }
      })
      .catch(error => {
        console.error('[Landing] Error fetching location:', error);
        setIsLoadingLocation(false);
        // Fallback with default coordinates
        setLocationModalData({
          placeName: searchQuery,
          lat: 48.8566, // Paris default
          lng: 2.3522,
        });
      });
  }, []);

  // Handle moving from Step 1 (location) to Step 2 (transport)
  const handleContinueToTransport = useCallback(() => {
    if (!locationModalData) {
      console.warn('[Landing] No location selected');
      return;
    }

    // Store selected location
    setSelectedLocation(locationModalData);

    // Smart default: Set transport from to previous location if available
    if (locations.length > 0) {
      const prevLocation = locations[locations.length - 1];
      setTransportFrom({
        lat: prevLocation.lat,
        lng: prevLocation.lng,
        name: prevLocation.placeName
      });
    } else {
      // No previous location - start fresh
      setTransportFrom(null);
    }

    // Move to transport configuration step
    setModalStep('transport');
  }, [locationModalData, locations]);

  // Handle adding location to document (called from Step 2)
  const handleAddLocationToDocument = useCallback(() => {
    if (!selectedLocation || !selectionRange || !webViewRef.current) {
      console.warn('[Landing] Missing data for creating geo-mark');
      return;
    }

    // Create geo-mark data with transport information
    const geoMarkData = {
      geoId: `geo-${Date.now()}`,
      placeName: selectedLocation.placeName,
      lat: selectedLocation.lat,
      lng: selectedLocation.lng,
      colorIndex: locations.length % 10,
      coordSource: 'nominatim',
      transportFrom: transportFrom,
      transportProfile: transportMode,
      routeGeometry: routeGeometry,
      routeDistance: routeDistance,
      routeDuration: routeDuration,
      waypoints: null, // TODO: Add waypoints support later
    };

    console.log('[Landing] Creating geo-mark with data:', geoMarkData);

    // Send command to WebView to create geo-mark
    webViewRef.current.sendCommand('createGeoMark', { geoMarkData });

    // Add to locations tracking
    const newLocation: Location = {
      geoId: geoMarkData.geoId,
      placeName: geoMarkData.placeName,
      lat: geoMarkData.lat,
      lng: geoMarkData.lng,
    };

    setLocations(prev => {
      const updated = [...prev, newLocation];
      setTimeout(() => onLocationsChange?.(updated), 0);
      return updated;
    });

    // Reset modal state and close
    setShowLocationModal(false);
    setSelectionRange(null);
    setModalStep('location');
    setSelectedLocation(null);
    setTransportFrom(null);
    setRouteGeometry(null);
    setRouteDistance(null);
    setRouteDuration(null);
  }, [selectedLocation, selectionRange, locations, transportFrom, transportMode, routeGeometry, routeDistance, routeDuration, onLocationsChange]);

  // Fetch route from Mapbox Directions API when transport config changes
  useEffect(() => {
    if (modalStep !== 'transport' || !transportFrom || !selectedLocation) {
      return;
    }

    const fetchRoute = async () => {
      setIsLoadingRoute(true);

      try {
        // Map transport mode to Mapbox profile
        const profileMap = {
          walking: 'walking',
          driving: 'driving-traffic',
          transit: 'driving', // No transit profile in Directions API
          cycling: 'cycling',
          flight: 'driving', // Use straight line for flight
        };

        const profile = profileMap[transportMode];
        const coordinates = `${transportFrom.lng},${transportFrom.lat};${selectedLocation.lng},${selectedLocation.lat}`;

        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?` +
          `geometries=geojson&access_token=${process.env.EXPO_PUBLIC_MAPBOX_TOKEN}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch route');
        }

        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          setRouteGeometry(route.geometry);
          setRouteDistance(route.distance);
          setRouteDuration(route.duration);
        } else {
          console.warn('[Landing] No route found');
          setRouteGeometry(null);
          setRouteDistance(null);
          setRouteDuration(null);
        }
      } catch (error) {
        console.error('[Landing] Error fetching route:', error);
        setRouteGeometry(null);
        setRouteDistance(null);
        setRouteDuration(null);
      } finally {
        setIsLoadingRoute(false);
      }
    };

    fetchRoute();
  }, [modalStep, transportFrom, selectedLocation, transportMode]);

  // Handle modal close - reset all state
  const handleCloseModal = useCallback(() => {
    setShowLocationModal(false);
    setModalStep('location');
    setSelectedLocation(null);
    setTransportFrom(null);
    setRouteGeometry(null);
    setRouteDistance(null);
    setRouteDuration(null);
    setLocationModalData(null);
    setLocationSearchResults([]);
    setSelectedResultIndex(0);
  }, []);


  return (
    <View style={styles.container}>
      {/* Toolbar - Fixed at top */}
      <View style={styles.toolbarContainer}>
        <ProseMirrorToolbar
          editable={true}
          selectionEmpty={!hasTextSelection}
          highlightedButton={highlightedButton}
          onCommand={(command, params) => {
            console.log('[Landing] onCommand received:', command, params, Date.now());
            webViewRef.current?.sendCommand(command, params);
          }}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </View>

      {/* Location Creation Modal - Bottom sheet style */}
      <Modal
        visible={showLocationModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop */}
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleCloseModal}
          />

          {/* Bottom Sheet */}
          <View style={styles.modalContent}>
            {/* Drag handle */}
            <View style={styles.dragHandle} />

            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalStep === 'location' ? 'Add Location' : 'Configure Transport'}
              </Text>
              <TouchableOpacity onPress={handleCloseModal}>
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
                    onSelectResult={(index) => {
                      setSelectedResultIndex(index);
                      const selected = locationSearchResults[index];
                      setLocationModalData({
                        placeName: selected.display_name,
                        lat: parseFloat(selected.lat),
                        lng: parseFloat(selected.lon),
                      });
                    }}
                    existingLocations={locations}
                    routeFrom={transportFrom}
                    routeTo={selectedLocation}
                    routeGeometry={routeGeometry}
                    showRoute={modalStep === 'transport'}
                  />
                </View>
              </View>

              {/* Bottom Section - 40% height - Content changes based on step */}
              <View style={styles.resultsSection}>
                <ScrollView contentContainerStyle={styles.transportFormContent}>
                  {modalStep === 'location' && (
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
                            onPress={() => {
                              setSelectedResultIndex(index);
                              setLocationModalData({
                                placeName: result.display_name,
                                lat: parseFloat(result.lat),
                                lng: parseFloat(result.lon),
                              });
                            }}
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

                  {modalStep === 'transport' && (
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
                        {transportFrom ? (
                          <View style={styles.transportFromBox}>
                            <Ionicons name="location-outline" size={20} color="#6b7280" />
                            <Text style={styles.transportFromText}>{transportFrom.name}</Text>
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
                            style={[styles.modeButton, transportMode === 'walking' && styles.modeButtonActive]}
                            onPress={() => setTransportMode('walking')}
                          >
                            <Ionicons name="walk" size={24} color={transportMode === 'walking' ? '#fff' : '#6b7280'} />
                            <Text style={[styles.modeButtonText, transportMode === 'walking' && styles.modeButtonTextActive]}>
                              Walk
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.modeButton, transportMode === 'driving' && styles.modeButtonActive]}
                            onPress={() => setTransportMode('driving')}
                          >
                            <Ionicons name="car" size={24} color={transportMode === 'driving' ? '#fff' : '#6b7280'} />
                            <Text style={[styles.modeButtonText, transportMode === 'driving' && styles.modeButtonTextActive]}>
                              Drive
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.modeButton, transportMode === 'transit' && styles.modeButtonActive]}
                            onPress={() => setTransportMode('transit')}
                          >
                            <Ionicons name="train" size={24} color={transportMode === 'transit' ? '#fff' : '#6b7280'} />
                            <Text style={[styles.modeButtonText, transportMode === 'transit' && styles.modeButtonTextActive]}>
                              Transit
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.modeButton, transportMode === 'cycling' && styles.modeButtonActive]}
                            onPress={() => setTransportMode('cycling')}
                          >
                            <Ionicons name="bicycle" size={24} color={transportMode === 'cycling' ? '#fff' : '#6b7280'} />
                            <Text style={[styles.modeButtonText, transportMode === 'cycling' && styles.modeButtonTextActive]}>
                              Cycle
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.modeButton, transportMode === 'flight' && styles.modeButtonActive]}
                            onPress={() => setTransportMode('flight')}
                          >
                            <Ionicons name="airplane" size={24} color={transportMode === 'flight' ? '#fff' : '#6b7280'} />
                            <Text style={[styles.modeButtonText, transportMode === 'flight' && styles.modeButtonTextActive]}>
                              Flight
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Route Preview Section */}
                      {transportFrom && selectedLocation && (
                        <View style={styles.formSection}>
                          <Text style={styles.formSectionTitle}>ROUTE PREVIEW</Text>
                          {isLoadingRoute ? (
                            <View style={styles.routePreviewLoading}>
                              <ActivityIndicator size="small" color="#3b82f6" />
                              <Text style={styles.routePreviewLoadingText}>Calculating route...</Text>
                            </View>
                          ) : routeDistance && routeDuration ? (
                            <View style={styles.routeInfo}>
                              <View style={styles.routeInfoItem}>
                                <Ionicons name="navigate" size={20} color="#6b7280" />
                                <Text style={styles.routeInfoText}>
                                  {(routeDistance / 1000).toFixed(1)} km
                                </Text>
                              </View>
                              <View style={styles.routeInfoItem}>
                                <Ionicons name="time" size={20} color="#6b7280" />
                                <Text style={styles.routeInfoText}>
                                  {Math.round(routeDuration / 60)} min
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
              {modalStep === 'location' ? (
                // Step 1: Continue to transport configuration
                <TouchableOpacity
                  style={[styles.saveButton, !locationModalData && styles.saveButtonDisabled]}
                  onPress={handleContinueToTransport}
                  disabled={!locationModalData}
                >
                  <Text style={styles.saveButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>
              ) : (
                // Step 2: Add to document with transport info
                <View style={styles.footerButtons}>
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => setModalStep('location')}
                  >
                    <Ionicons name="arrow-back" size={20} color="#3b82f6" />
                    <Text style={styles.backButtonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveButton, styles.primaryButton]}
                    onPress={handleAddLocationToDocument}
                  >
                    <Ionicons name="location" size={20} color="#fff" />
                    <Text style={styles.saveButtonText}>Add to Document</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Context Menu - DISABLED: Now handled inside ProseMirror WebView */}
      {/* {showFloatingMenu && Platform.OS === 'web' && (
        <View style={[styles.floatingMenu, { top: menuPosition.y, left: menuPosition.x }]}>
          <TouchableOpacity
            style={styles.floatingMenuItem}
            onPress={handleCreateGeoMarkFromMenu}
          >
            <Ionicons name="location" size={18} color="#fff" />
            <Text style={styles.floatingMenuText}>Add Location</Text>
          </TouchableOpacity>
        </View>
      )} */}

      {/* ProseMirror Editor - Always rendered to preserve state */}
      <View
        ref={editorContainerRef}
        style={styles.editorContainer}
      >
        <ProseMirrorWebView
          ref={webViewRef}
          initialContent={INITIAL_CONTENT}
          onContentChange={handleContentChange}
          onSelectionChange={handleSelectionChange}
          onShowGeoMarkEditor={handleShowGeoMarkEditor}
          onMessage={(data) => {
            if (data.type === 'toggleViewMode') {
              setViewMode(viewMode === 'document' ? 'map' : 'document');
            }
          }}
          editable={true}
          showToolbar={false}
          onReady={handleReady}
        />
      </View>

      {/* Map View - Overlay on top of document */}
      {viewMode === 'map' && locations.length > 0 && (
        <View style={styles.fullScreenMapContainer}>
          <LocationMapWeb
            latitude={locations[0].lat}
            longitude={locations[0].lng}
            name="TourVision Demo"
            colorIndex={0}
          />
          {/* Close button to return to document mode */}
          <TouchableOpacity
            style={styles.closeMapButton}
            onPress={() => setViewMode('document')}
          >
            <View style={styles.closeMapButtonBg}>
              <Ionicons name="close" size={24} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Locations list overlay */}
          <View style={styles.mapLocationsOverlay}>
            <Text style={styles.mapOverlayTitle}>Locations</Text>
            <ScrollView style={styles.locationsList} showsVerticalScrollIndicator={false}>
              {locations.map((location, index) => (
                <View key={location.geoId} style={styles.locationItem}>
                  <View
                    style={[
                      styles.locationMarkerDot,
                      { backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 5] }
                    ]}
                  />
                  <Text style={styles.locationItemText} numberOfLines={1}>
                    {location.placeName}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  progressIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  completionBanner: {
    padding: 16,
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: '#bfdbfe',
  },
  completionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    textAlign: 'center',
  },
  toolbarContainer: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    zIndex: 1000,
    ...Platform.select({
      web: {
        transform: 'translateX(-50%)' as any,
      },
      default: {
        // For native platforms, center using marginLeft
        width: 700,
        marginLeft: -350,
      }
    }),
  },
  highlightOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  highlightText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    minHeight: 400,
    position: 'relative',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)' as any,
      },
    }),
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: '100%',
    maxHeight: '85vh',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.25)' as any,
      },
    }),
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#d1d5db',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
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
    flexDirection: 'column',
  },
  mapContainer: {
    width: '100%',
    height: '100%',
    maxWidth: '100vh',
    maxHeight: '100vw',
    aspectRatio: 1,
  },
  mapSection: {
    flex: 3, // 60% of height
  },
  resultsSection: {
    flex: 2, // 40% of height
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  coordinatesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordinateInput: {
    flex: 1,
  },
  coordinateLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 4,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    gap: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
    ...Platform.select({
      web: {
        cursor: 'not-allowed' as any,
      },
    }),
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  locationResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  locationResultText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  emptyResultsState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyResultsText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  coordinateValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
    marginTop: 4,
  },
  floatingMenu: {
    position: 'absolute',
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 1000,
    ...Platform.select({
      web: {
        pointerEvents: 'auto' as any,
      },
    }),
  },
  floatingMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  floatingMenuText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  // Transport form styles
  transportFormContent: {
    padding: 16,
    gap: 16,
  },
  selectedLocationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  selectedLocationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#1e40af',
  },
  formSection: {
    gap: 10,
  },
  formSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transportFromBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  transportFromText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  noTransportFrom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  noTransportFromText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  transportModes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modeButton: {
    flex: 1,
    minWidth: 75,
    alignItems: 'center',
    gap: 4,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  modeButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  modeButtonTextActive: {
    color: '#ffffff',
  },
  routePreviewLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  routePreviewLoadingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  routeInfo: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeInfoText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#15803d',
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3b82f6',
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  primaryButton: {
    flex: 1,
  },
  // Full-screen map view styles
  fullScreenMapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    zIndex: 10,
  },
  closeMapButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 100,
  },
  closeMapButtonBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLocationsOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    width: 280,
    maxHeight: 300,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  mapOverlayTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  locationsList: {
    maxHeight: 220,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  locationMarkerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  locationItemText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  // Location result items (Step 1 bottom sheet)
  locationResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    marginBottom: 12,
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
        transition: 'all 0.2s' as any,
      },
    }),
  },
  locationResultItemSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  locationResultNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationResultNumberSelected: {
    backgroundColor: '#3b82f6',
  },
  locationResultNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  locationResultText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    lineHeight: 20,
  },
});
