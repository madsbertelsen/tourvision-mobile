/**
 * NEW DOCUMENT ROUTE - Based on Landing Page Demo
 *
 * This is a recreation of the document route using the superior landing page implementation.
 * The landing page evolved with better features and UX.
 *
 * STATUS: Initial implementation - Basic structure in place
 *
 * TODO: Complete migration
 * - [ ] Load document from database (currently uses demo content)
 * - [ ] Integrate Y.js collaboration
 * - [ ] Add save functionality
 * - [ ] Port AI assistant modal
 * - [ ] Port comment system
 * - [ ] Port share functionality
 * - [ ] Test all features
 *
 * See legacy implementation at: app/(app)/document-legacy/[id]/index.tsx
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Path, Defs, Marker, Polygon, Circle } from 'react-native-svg';
import { useTripContext } from './_layout';
import DynamicLandingDocumentProseMirror from '../../../(public)/components/DynamicLandingDocumentProseMirror';
import DocumentSplitMap from '@/components/DocumentSplitMap';
import DocumentChat from '@/components/DocumentChat';
import LocationSidebarPanel from '@/components/LocationSidebarPanel';
import ToolPickerBottomSheet from '@/components/ToolPickerBottomSheet';
import { EMPTY_DOCUMENT_CONTENT } from '@/utils/landing-document-content';
import { useLocationModal } from '@/hooks/useLocationModal';
import { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import { supabase } from '@/lib/supabase/client';

export default function TripDocumentView() {
  const insets = useSafeAreaInsets();
  const { tripId, isEditMode, setIsEditMode, locations, setLocations, currentDoc, setCurrentDoc, locationModal, setLocationModal } = useTripContext();
  const [showMap, setShowMap] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [contentHeight, setContentHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(110); // Default fallback, will be measured
  const [documentWidth, setDocumentWidth] = useState(700); // Track actual document container width
  const [isCollabEnabled, setIsCollabEnabled] = useState(false);
  const [isEnablingCollab, setIsEnablingCollab] = useState(false);

  // Tool picker state
  const [toolPickerVisible, setToolPickerVisible] = useState(false);
  const [toolPickerData, setToolPickerData] = useState<{
    selectedText: string;
    from?: number;
    to?: number;
    markType?: 'location' | 'comment';
    isEditing?: boolean;
    existingMarkAttrs?: any;
  } | null>(null);

  // Search results state (for map preview)
  const [toolPickerSearchResults, setToolPickerSearchResults] = useState<any[]>([]);
  const [toolPickerSelectedIndex, setToolPickerSelectedIndex] = useState(0);

  // Ref for ProseMirror WebView (needed by location modal hook)
  const webViewRef = useRef<ProseMirrorWebViewRef>(null);

  // Collaboration disabled - Edge Function doesn't exist
  // Y.js collaboration will be re-enabled once Cloudflare Worker persistence is set up
  useEffect(() => {
    console.log('[TripDocument] Collaboration disabled - using localStorage persistence only');
    console.log('[TripDocument] Cloudflare Worker URL:', process.env.EXPO_PUBLIC_COLLAB_URL);
    // TODO: Set up Cloudflare Worker to persist Y.js document state
    // TODO: Create button to manually enable collaboration when needed
  }, [tripId]);

  // Location modal handlers
  const {
    handleShowGeoMarkEditor,
    handleSelectResult,
    handleContinue,
    handleTransportModeChange,
    handleWaypointsChange,
    handleAddLocation,
    handleClose,
  } = useLocationModal({ webViewRef });

  // Handle selection changes to update line position immediately
  const handleSelectionChange = useCallback((empty: boolean, selectedText?: string, selectionData?: any) => {
    if (empty || !selectionData) {
      // Selection cleared - close modal if it's open
      if (locationModal.visible) {
        console.log('[TripDocument] Selection cleared, closing location modal');
        handleClose();
      } else {
        // Just clear coordinates if modal wasn't visible
        setLocationModal({
          selectionTop: undefined,
          selectionLeft: undefined,
          selectionWidth: undefined,
        });
      }
    } else {
      // Update selection coordinates for line rendering
      // Only store coordinates if modal is already visible
      // This prevents the line from appearing on text selection
      if (locationModal.visible) {
        setLocationModal({
          selectionTop: selectionData.selectionTop,
          selectionLeft: selectionData.selectionLeft,
          selectionWidth: selectionData.selectionWidth,
        });
      }
    }
  }, [locationModal.visible, handleClose, setLocationModal]);

  // Handle location click - select result and immediately create geomark
  const handleLocationClick = useCallback((index: number) => {
    console.log('[TripDocument] Location clicked, index:', index);
    // First select the result to update the selected location state
    handleSelectResult(index);
    // Then immediately create the geomark
    // Use setTimeout to ensure state update has completed
    setTimeout(() => {
      handleAddLocation();
    }, 100);
  }, [handleSelectResult, handleAddLocation]);

  // Tool picker handlers
  const handleToolPickerMessage = useCallback((data: any) => {
    if (data.type === 'showToolPicker') {
      console.log('[TripDocument] Showing tool picker with data:', data.data);
      setToolPickerData({
        selectedText: data.data.selectedText,
        from: data.data.from,
        to: data.data.to,
        markType: data.data.markType,
        isEditing: data.data.isEditing || false,
        existingMarkAttrs: data.data.existingMarkAttrs,
      });
      setToolPickerVisible(true);
    }
  }, []);

  const handleSelectLocation = useCallback(() => {
    console.log('[TripDocument] Tool picker - Location selected');
    setToolPickerVisible(false);

    // Trigger the location modal with the stored selection data
    if (toolPickerData) {
      handleShowGeoMarkEditor({
        selectedText: toolPickerData.selectedText,
        from: toolPickerData.from,
        to: toolPickerData.to,
      }, locations);
    }
  }, [toolPickerData, handleShowGeoMarkEditor, locations]);

  const handleSelectComment = useCallback(() => {
    console.log('[TripDocument] Tool picker - Comment selected');
    setToolPickerVisible(false);

    // Send command to WebView to add comment mark
    if (toolPickerData && webViewRef.current) {
      webViewRef.current.sendCommand('addComment', {
        from: toolPickerData.from,
        to: toolPickerData.to,
        text: toolPickerData.selectedText,
      });
    }
  }, [toolPickerData]);

  const handleToolPickerClose = useCallback(() => {
    console.log('[TripDocument] Tool picker closed');
    setToolPickerVisible(false);
    setToolPickerData(null);
  }, []);

  // Handle geo-mark creation from tool picker
  const handleCreateGeoMark = useCallback((data: {
    placeName: string;
    lat: number;
    lng: number;
    transportMode?: string;
  }) => {
    console.log('[TripDocument] Creating geo-mark from tool picker:', data);

    if (!toolPickerData || !webViewRef.current) {
      console.error('[TripDocument] Missing data for geo-mark creation');
      return;
    }

    // Create geo-mark data
    const geoMarkData = {
      geoId: `loc-${Date.now()}`,
      placeName: data.placeName,
      lat: data.lat.toString(),
      lng: data.lng.toString(),
      colorIndex: 0, // Will be auto-assigned by ProseMirror
      coordSource: 'nominatim',
      transportProfile: data.transportMode || 'walking',
    };

    // Send command to WebView to create the geo-mark
    webViewRef.current.sendCommand('createGeoMark', {
      from: toolPickerData.from,
      to: toolPickerData.to,
      geoMarkData,
    });

    // Close tool picker
    setToolPickerVisible(false);
    setToolPickerData(null);
  }, [toolPickerData]);

  // Handle search results changes from tool picker
  const handleSearchResultsChange = useCallback((results: any[], selectedIndex: number) => {
    console.log('[TripDocument] Search results changed:', { numResults: results.length, selectedIndex });
    setToolPickerSearchResults(results);
    setToolPickerSelectedIndex(selectedIndex);
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View
        style={[styles.header, { paddingTop: insets.top + 8 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3B82F6" />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>Trip Document (New)</Text>
          {isCollabEnabled && (
            <View style={styles.collabIndicator}>
              <Ionicons name="people" size={14} color="#10B981" />
              <Text style={styles.collabText}>Live</Text>
            </View>
          )}
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setShowChat(!showChat)}
            style={[styles.iconButton, showChat && styles.iconButtonActive]}
          >
            <Ionicons
              name={showChat ? "chatbubbles" : "chatbubbles-outline"}
              size={22}
              color={showChat ? "#fff" : "#6B7280"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowMap(!showMap)}
            style={[styles.iconButton, showMap && styles.iconButtonActive]}
          >
            <Ionicons
              name={showMap ? "map" : "map-outline"}
              size={22}
              color={showMap ? "#fff" : "#6B7280"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsEditMode(!isEditMode)}
            style={[styles.iconButton, isEditMode && styles.iconButtonActive]}
          >
            <Ionicons
              name={isEditMode ? "book" : "create-outline"}
              size={22}
              color={isEditMode ? "#fff" : "#6B7280"}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content - Split View */}
      <View
        style={styles.contentWrapper}
        onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
      >
        {/* Chat Panel */}
        {showChat && (
          <View style={styles.chatContainer}>
            <DocumentChat documentId={tripId} />
          </View>
        )}

        {/* Document */}
        <View
          style={[
            styles.documentContainer,
            (showMap || showChat) && styles.documentContainerSplit
          ]}
          onLayout={(e) => setDocumentWidth(e.nativeEvent.layout.width)}
        >
          <DynamicLandingDocumentProseMirror
            initialContent={currentDoc || EMPTY_DOCUMENT_CONTENT}
            onLocationsChange={setLocations}
            onContentChange={setCurrentDoc}
            disableAnimation={true}
            webViewRef={webViewRef}
            onShowGeoMarkEditor={handleShowGeoMarkEditor}
            onSelectionChange={handleSelectionChange}
            onMessage={handleToolPickerMessage}
          />

          {/* Tool Picker Bottom Sheet - overlays only document panel */}
          <ToolPickerBottomSheet
            visible={toolPickerVisible}
            selectedText={toolPickerData?.selectedText || ''}
            onSelectLocation={handleSelectLocation}
            onSelectComment={handleSelectComment}
            onClose={handleToolPickerClose}
            isEditing={toolPickerData?.isEditing}
            markType={toolPickerData?.markType}
            existingMarkAttrs={toolPickerData?.existingMarkAttrs}
            onCreateGeoMark={handleCreateGeoMark}
            onSearchResultsChange={handleSearchResultsChange}
          />

          {/* Smooth curved line from selection - only visible when location modal is open */}
          {showMap && locationModal.visible && locationModal.selectionLeft !== undefined && locationModal.selectionTop !== undefined && contentHeight > 0 && documentWidth > 0 && (() => {
            // Calculate positions for curved path
            const selectionRight = locationModal.selectionLeft + (locationModal.selectionWidth || 0);

            // Calculate the available horizontal space from selection end to document edge
            const availableSpace = documentWidth - selectionRight;

            // Position vertical line at midpoint of available space
            const horizontalWidth = availableSpace / 2;

            // Total width from selection end to document edge (for SVG container)
            const totalWidth = availableSpace;

            // Vertical segment height (from selection top to arrow connection point)
            const verticalStartY = headerHeight + locationModal.selectionTop;
            const verticalEndY = contentHeight - 200; // Connect to where arrow ends
            const verticalHeight = verticalEndY - verticalStartY;

            // Curve radius for smooth corners (proportional to available space, max 50px)
            const curveRadius = Math.min(50, horizontalWidth * 0.3, verticalHeight * 0.15);

            // Build smooth path with cubic Bézier curves
            const pathData = [
              // Start point
              `M 0 1.5`,
              // Horizontal line to first curve
              `L ${horizontalWidth - curveRadius} 1.5`,
              // First curve: horizontal → vertical (top-right corner)
              `C ${horizontalWidth - curveRadius / 3} 1.5, ${horizontalWidth} ${1.5 + curveRadius / 3}, ${horizontalWidth} ${1.5 + curveRadius}`,
              // Vertical line segment
              `L ${horizontalWidth} ${verticalHeight + 1.5 - curveRadius}`,
              // Second curve: vertical → horizontal (bottom-left corner)
              `C ${horizontalWidth} ${verticalHeight + 1.5 - curveRadius / 3}, ${horizontalWidth + curveRadius / 3} ${verticalHeight + 1.5}, ${horizontalWidth + curveRadius} ${verticalHeight + 1.5}`,
              // Final horizontal segment to end
              `L ${totalWidth} ${verticalHeight + 1.5}`
            ].join(' ');

            return (
              <Svg
                style={{
                  position: 'absolute',
                  left: selectionRight,
                  top: verticalStartY - 1.5,
                  width: totalWidth + 3,
                  height: verticalHeight + 3,
                  zIndex: 1000,
                  pointerEvents: 'none',
                }}
              >
                {/* Smooth curved path with Bézier curves */}
                <Path
                  d={pathData}
                  stroke="#3B82F6"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            );
          })()}
        </View>

        {/* Map */}
        {showMap && (
          <View style={styles.mapContainer}>
            <DocumentSplitMap
              locations={locations}
              searchResults={
                toolPickerVisible && toolPickerSearchResults.length > 0
                  ? toolPickerSearchResults
                  : locationModal.visible
                    ? locationModal.locationSearchResults
                    : []
              }
              selectedSearchIndex={
                toolPickerVisible && toolPickerSearchResults.length > 0
                  ? toolPickerSelectedIndex
                  : locationModal.selectedResultIndex
              }
              onSearchResultSelect={handleSelectResult}
              sidebarContent={
                <LocationSidebarPanel
                  visible={locationModal.visible}
                  onClose={handleClose}
                  step={locationModal.step}
                  onStepChange={(step) => {}}  // Handled by hook
                  locationSearchResults={locationModal.locationSearchResults}
                  selectedResultIndex={locationModal.selectedResultIndex}
                  onSelectResult={handleSelectResult}
                  isLoadingLocation={locationModal.isLoadingLocation}
                  selectedLocation={locationModal.selectedLocation}
                  transportConfig={locationModal.transportConfig}
                  onTransportModeChange={handleTransportModeChange}
                  onWaypointsChange={handleWaypointsChange}
                  isLoadingRoute={locationModal.isLoadingRoute}
                  selectionTop={locationModal.selectionTop}
                  arrowEndY={contentHeight > 0 ? contentHeight - 200 : undefined}
                  onContinue={handleContinue}
                  onAddLocation={handleAddLocation}
                  onFocusChange={handleSelectResult} // Update map when focus changes
                  onLocationClick={handleLocationClick} // Handle location click to create geomark
                />
              }
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  backButton: {
    padding: 8,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  collabIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
  },
  collabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  iconButtonActive: {
    backgroundColor: '#3B82F6',
  },
  contentWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  chatContainer: {
    flex: 1,
    minWidth: 350,
    maxWidth: 500,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  documentContainer: {
    flex: 1,
    maxWidth: 700,  // Set max width for document
    overflow: 'hidden',  // Prevent arrow from extending outside
    position: 'relative',  // Positioning context for tool picker
  },
  documentContainerSplit: {
    width: 700,  // Fixed width when split
    maxWidth: 700,  // Enforce max width
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    overflow: 'hidden',  // Prevent arrow from extending outside
    position: 'relative',  // Positioning context for tool picker
  },
  mapContainer: {
    flex: 1,  // Let map take remaining space
    minWidth: 400,
  },
  arrowSegment: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  arrowLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#3B82F6',
    borderRadius: 1.5,
  },
  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderLeftColor: '#3B82F6',
    borderTopWidth: 7,
    borderTopColor: 'transparent',
    borderBottomWidth: 7,
    borderBottomColor: 'transparent',
  },
  cornerDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    zIndex: 1001,
    pointerEvents: 'none',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
});
