import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Text, Pressable, Platform, Modal, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import { ProseMirrorToolbar } from '@/components/ProseMirrorToolbar';
import { TypingAnimatorCommands, AnimationState, DEFAULT_TYPING_CONFIG } from '@/utils/typing-animator-commands';
import { EditorCommand } from '@/utils/command-sequence-generator';
import { Ionicons } from '@expo/vector-icons';
import { LANDING_DOCUMENT_CONTENT } from '@/utils/landing-document-content';
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
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
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

  // Handle adding location to document
  const handleAddLocationToDocument = useCallback(() => {
    if (!locationModalData || !selectionRange || !webViewRef.current) {
      console.warn('[Landing] Missing data for creating geo-mark');
      return;
    }

    // Create geo-mark data
    const geoMarkData = {
      geoId: `geo-${Date.now()}`,
      placeName: locationModalData.placeName,
      lat: locationModalData.lat,
      lng: locationModalData.lng,
      colorIndex: locations.length % 10,
      coordSource: 'nominatim',
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

    // Close modal
    setShowLocationModal(false);
    setSelectionRange(null);
  }, [locationModalData, selectionRange, locations, onLocationsChange]);

  // Handle clicks outside toolbar to hide it
  const handleClickOutside = useCallback(() => {
    if (Platform.OS === 'web') {
      setShowFloatingToolbar(false);
    }
  }, []);

  // Add keyboard handler for Tab key (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setShowFloatingToolbar(prev => !prev);
      } else if (e.key === 'Escape') {
        setShowFloatingToolbar(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <View
      style={styles.container}
      // @ts-ignore - onClick is web-only
      onClick={(e: any) => {
        // Only hide toolbar if clicking outside the toolbar and editor
        const target = e.target as HTMLElement;
        if (!target.closest('.ProseMirror') && !target.closest('[style*="floatingToolbarContainer"]')) {
          setShowFloatingToolbar(false);
        }
      }}
    >
      {/* Floating Toolbar - Shows on click or Tab key */}
      {showFloatingToolbar && (
        <View style={styles.floatingToolbarContainer}>
          <ProseMirrorToolbar
            editable={true}
            selectionEmpty={!hasTextSelection}
            highlightedButton={highlightedButton}
            onCommand={(command, params) => {
              webViewRef.current?.sendCommand(command, params);
            }}
          />
        </View>
      )}

      {/* Location Creation Modal - Shows real UI for adding locations */}
      <Modal
        visible={showLocationModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Location</Text>
              <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {isLoadingLocation ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>🔍 Searching for location...</Text>
                </View>
              ) : (
                <>
                  {/* Map */}
                  {locationModalData && (
                    <View style={styles.mapContainer}>
                      <LocationMapWeb
                        latitude={locationModalData.lat}
                        longitude={locationModalData.lng}
                        name={locationModalData.placeName}
                        colorIndex={0}
                      />
                    </View>
                  )}

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Location Found</Text>
                    <View style={styles.locationResultBox}>
                      <Ionicons name="location" size={20} color="#3b82f6" />
                      <Text style={styles.locationResultText} numberOfLines={2}>
                        {locationModalData?.placeName || 'Searching...'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Coordinates</Text>
                    <View style={styles.coordinatesRow}>
                      <View style={styles.coordinateInput}>
                        <Text style={styles.coordinateLabel}>Latitude</Text>
                        <Text style={styles.coordinateValue}>
                          {locationModalData?.lat.toFixed(4) || '-'}
                        </Text>
                      </View>
                      <View style={styles.coordinateInput}>
                        <Text style={styles.coordinateLabel}>Longitude</Text>
                        <Text style={styles.coordinateValue}>
                          {locationModalData?.lng.toFixed(4) || '-'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {locationSearchResults.length > 1 && (
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>
                        {locationSearchResults.length} results found (showing first)
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.saveButton, !locationModalData && styles.saveButtonDisabled]}
                onPress={handleAddLocationToDocument}
                disabled={!locationModalData}
              >
                <Ionicons name="location" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Add to Document</Text>
              </TouchableOpacity>
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

      {/* ProseMirror Editor */}
      <View
        ref={editorContainerRef}
        style={styles.editorContainer}
        onClick={() => {
          if (Platform.OS === 'web') {
            setShowFloatingToolbar(true);
          }
        }}
      >
        <ProseMirrorWebView
          ref={webViewRef}
          initialContent={INITIAL_CONTENT}
          onContentChange={handleContentChange}
          onSelectionChange={handleSelectionChange}
          onShowGeoMarkEditor={handleShowGeoMarkEditor}
          editable={true}
          showToolbar={false}
          onReady={handleReady}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    gap: 12,
    backgroundColor: '#f9fafb',
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
    backgroundColor: '#dbeafe',
    borderBottomWidth: 1,
    borderBottomColor: '#93c5fd',
  },
  completionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    textAlign: 'center',
  },
  floatingToolbarContainer: {
    position: 'absolute',
    top: 20,
    left: '50%',
    transform: [{ translateX: -200 }],
    zIndex: 1000,
    width: 400,
    maxWidth: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  toolbarContainer: {
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90vh',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
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
    padding: 20,
  },
  mapContainer: {
    width: '100%',
    height: 300,
    marginBottom: 20,
    borderRadius: 8,
    overflow: 'hidden',
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
});
