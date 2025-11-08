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

import DocumentChat from '@/components/DocumentChat';
import DocumentSplitMap from '@/components/DocumentSplitMap';
import type { GeoMark } from '@/utils/parse-geo-marks';
import LocationSidebarPanel from '@/components/LocationSidebarPanel';
import PresentationOverlay from '@/components/PresentationOverlay';
import { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import ToolPickerBottomSheet from '@/components/ToolPickerBottomSheet';
import { usePresentation } from '@/contexts/presentation-context';
import { useLocationModal } from '@/hooks/useLocationModal';
import { supabase } from '@/lib/supabase/client';
import { EMPTY_DOCUMENT_CONTENT } from '@/utils/landing-document-content';
import { parsePresentationBlocks } from '@/utils/parse-presentation-blocks';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import DocumentEditorWithMap from '@/components/DocumentEditorWithMap';
import { useTripContext } from './_layout';

// Helper function to get the next color index that avoids recent colors
function getNextColorIndex(locations: any[]): number {
  const TOTAL_COLORS = 10; // We have 10 colors in our palette

  // If no locations yet, start with 0
  if (!locations || locations.length === 0) {
    return 0;
  }

  // Get the last few color indices used (up to 3)
  const recentColors = locations
    .slice(-3)
    .map(loc => loc.colorIndex ?? 0);

  // Find a color that hasn't been used recently
  for (let i = 0; i < TOTAL_COLORS; i++) {
    const candidateColor = (locations.length + i) % TOTAL_COLORS;
    if (!recentColors.includes(candidateColor)) {
      return candidateColor;
    }
  }

  // Fallback: if all colors were recently used (shouldn't happen with 10 colors and checking last 3)
  // Just use the next sequential color
  return locations.length % TOTAL_COLORS;
}

export default function TripDocumentView() {
  const insets = useSafeAreaInsets();
  const { tripId, isEditMode, setIsEditMode, locations, setLocations, currentDoc, setCurrentDoc, locationModal, setLocationModal, locationFlowState, startLocationFlow, clearLocationFlow, geoMarkUpdate, setGeoMarkUpdate } = useTripContext();
  const { startPresentation, isPresenting } = usePresentation();
  const [showMap, setShowMap] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(110); // Default fallback, will be measured
  const [documentWidth, setDocumentWidth] = useState(700); // Track actual document container width
  const [isCollabEnabled, setIsCollabEnabled] = useState(false);
  const [isEnablingCollab, setIsEnablingCollab] = useState(false);

  // Chat geo-marks state
  const [chatGeoMarks, setChatGeoMarks] = useState<GeoMark[]>([]);

  // Convert chat geo-marks to location format for the map
  const chatLocations = useMemo(() => {
    return chatGeoMarks.map(mark => ({
      geoId: mark.geoId || mark.id, // Use data-geo-id if available, fallback to generated id
      placeName: mark.placeName,
      lat: mark.lat,
      lng: mark.lng,
      colorIndex: mark.colorIndex,
      transportFrom: mark.transportFrom || null,
      transportProfile: mark.transportProfile || null,
      waypoints: null, // Will be calculated by the map if needed
    }));
  }, [chatGeoMarks]);

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

  // Preview route state (for transportation configuration)
  const [previewRoute, setPreviewRoute] = useState<{
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number };
    geometry?: {
      type: 'LineString';
      coordinates: number[][];
    };
  } | null>(null);

  // Ref for ProseMirror WebView (needed by location modal hook)
  const webViewRef = useRef<ProseMirrorWebViewRef>(null);

  // Extract geo-marks from locations (already parsed by DocumentEditorWithMap)
  const existingGeoMarks = useMemo(() => {
    // Use locations directly - they're already parsed and updated by DocumentEditorWithMap
    return locations.map(loc => ({
      geoId: loc.geoId,
      placeName: loc.placeName,
      lat: loc.lat,
      lng: loc.lng,
    }));
  }, [locations]);

  // Handle collaboration toggle
  const handleToggleCollaboration = useCallback(async () => {
    if (isCollabEnabled) {
      // Disable collaboration
      console.log('[TripDocument] Disabling collaboration...');
      webViewRef.current?.stopCollaboration();
      setIsCollabEnabled(false);
      return;
    }

    // Enable collaboration
    setIsEnablingCollab(true);
    try {
      console.log('[TripDocument] Enabling collaboration...');

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[TripDocument] No user found');
        alert('You must be logged in to enable collaboration');
        return;
      }

      // Get Cloudflare Worker URL from env (must use wss:// protocol for WebSocket)
      let collabUrl = process.env.EXPO_PUBLIC_COLLAB_URL || 'wss://tourvision-collab.mads-9b9.workers.dev';

      // Ensure we're using wss:// protocol (convert https:// to wss:// if needed)
      if (collabUrl.startsWith('https://')) {
        collabUrl = collabUrl.replace('https://', 'wss://');
      } else if (collabUrl.startsWith('http://')) {
        collabUrl = collabUrl.replace('http://', 'ws://');
      }

      console.log('[TripDocument] Using collaboration URL:', collabUrl);

      // Use a simple token (room name) for authentication
      // In production, you'd generate a JWT here
      const token = tripId;

      // Start collaboration via WebView ref
      webViewRef.current?.startCollaboration(
        collabUrl,
        tripId,
        user.id,
        user.email || 'Anonymous',
        token
      );

      setIsCollabEnabled(true);
      console.log('[TripDocument] Collaboration enabled successfully');
    } catch (error) {
      console.error('[TripDocument] Failed to enable collaboration:', error);
      alert('Failed to enable collaboration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsEnablingCollab(false);
    }
  }, [isCollabEnabled, tripId]);

  // Location modal handlers
  const {
    handleShowGeoMarkEditor: _handleShowGeoMarkEditor,
    handleSelectResult,
    handleContinue,
    handleTransportModeChange,
    handleWaypointsChange,
    handleAddLocation,
    handleClose,
  } = useLocationModal({ webViewRef });

  // TEST: Override to navigate to test modal instead
  const handleShowGeoMarkEditor = useCallback((data: any, locations: any[]) => {
    console.log('[TripDocument] Geo-mark clicked, navigating to test modal');
    router.push(`/document/${tripId}/test-modal`);
  }, [tripId]);

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

      const pickerData = {
        selectedText: data.data.selectedText,
        from: data.data.from,
        to: data.data.to,
        markType: data.data.markType,
        isEditing: data.data.isEditing || false,
        existingMarkAttrs: data.data.existingMarkAttrs,
      };

      // Store the data for potential fallback to old flow
      setToolPickerData(pickerData);

      console.log('[TripDocument] Showing tool picker with data:', pickerData);

      if (pickerData.isEditing && pickerData.existingMarkAttrs) {
        // Editing existing geo-mark - navigate to geo-edit
        const attrs = pickerData.existingMarkAttrs;
        router.push({
          pathname: `/document/${tripId}/geo-edit` as any,
          params: {
            isEditing: 'true',
            geoId: attrs.geoId || '',
            placeName: attrs.placeName || '',
            selectedText: pickerData.selectedText || '',
            lat: attrs.lat || '',
            lng: attrs.lng || '',
            colorIndex: attrs.colorIndex?.toString() || '0',
          }
        });
      } else {
        // Creating new geo-mark from selection - generate geoId and start location flow
        const geoId = startLocationFlow(
          pickerData.selectedText,
          pickerData.from,
          pickerData.to
        );

        // Navigate to geo-search with dynamic geoId
        router.push(`/document/${tripId}/geo-search/${geoId}` as any);
      }
    }
  }, [existingGeoMarks, startLocationFlow, tripId, router]);

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
    transportFrom?: string;  // geoId of origin location
    waypoints?: Array<{ lat: number; lng: number }>;  // route coordinates
  }) => {
    console.log('[TripDocument] Creating geo-mark from tool picker:', data);

    if (!toolPickerData || !webViewRef.current) {
      console.error('[TripDocument] Missing data for geo-mark creation');
      return;
    }

    // Create geo-mark data
    const geoMarkData = {
      geoId: `loc-${Date.now()}-msb`,
      placeName: data.placeName,
      lat: data.lat.toString(),
      lng: data.lng.toString(),
      colorIndex: getNextColorIndex(locations), // Assign color that avoids recent ones
      coordSource: 'nominatim',
      transportProfile: data.transportMode || 'walking',
      transportFrom: data.transportFrom || null,
      waypoints: data.waypoints || null,
    };

    // Send command to WebView to create the geo-mark
    webViewRef.current.sendCommand('createGeoMark', {
      from: toolPickerData.from,
      to: toolPickerData.to,
      geoMarkData,
    });

    // Add the new location to the locations array
    const newLocation = {
      geoId: geoMarkData.geoId,
      placeName: geoMarkData.placeName,
      lat: parseFloat(geoMarkData.lat),
      lng: parseFloat(geoMarkData.lng),
      colorIndex: geoMarkData.colorIndex,
      transportFrom: geoMarkData.transportFrom,
      transportProfile: geoMarkData.transportProfile,
      waypoints: geoMarkData.waypoints,
    };
    setLocations([...locations, newLocation]);

    // Close tool picker
    setToolPickerVisible(false);
    setToolPickerData(null);

    // Focus editor after modal closes (with delay for animation)
    setTimeout(() => {
      webViewRef.current?.focusEditor();
    }, 300);
  }, [toolPickerData, locations, setLocations]);

  // Handle search results changes from tool picker
  const handleSearchResultsChange = useCallback((results: any[], selectedIndex: number) => {
    console.log('[TripDocument] Search results changed:', { numResults: results.length, selectedIndex });
    setToolPickerSearchResults(results);
    setToolPickerSelectedIndex(selectedIndex);
  }, []);

  // Handle waypoints change from map editing
  const handleMapWaypointsChange = useCallback((geoId: string, waypoints: Array<{ lat: number; lng: number }>) => {
    console.log('[TripDocument] Map waypoints changed for geo-mark:', geoId, 'waypoints:', waypoints);
    console.log('[TripDocument] webViewRef.current:', webViewRef.current);

    // Send command to WebView to update the geo-mark's waypoints
    if (webViewRef.current) {
      console.log('[TripDocument] Sending updateGeoMarkWaypoints command to WebView');
      webViewRef.current.sendCommand('updateGeoMarkWaypoints', {
        geoId,
        waypoints
      });
    } else {
      console.error('[TripDocument] webViewRef.current is null, cannot update waypoints');
    }
  }, []);

  // Handle play button click - start presentation of document content
  const handlePlayDocument = useCallback(() => {
    if (!currentDoc) {
      console.warn('[TripDocument] No document content to present');
      return;
    }

    try {
      console.log('[TripDocument] Starting document presentation...');

      // Parse document content (string or object) to ProseMirror format
      const pmDoc = typeof currentDoc === 'string'
        ? JSON.parse(currentDoc)
        : currentDoc;

      console.log('[TripDocument] Parsed PM doc:', JSON.stringify(pmDoc, null, 2).substring(0, 300));

      // Parse into presentation blocks
      const blocks = parsePresentationBlocks(pmDoc);
      console.log('[TripDocument] Starting presentation with blocks:', blocks);

      // Start the presentation
      startPresentation(blocks);
    } catch (error) {
      console.error('[TripDocument] Failed to start presentation:', error);
      alert('Failed to start presentation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }, [currentDoc, startPresentation]);

  // Watch for locationFlowResult and create geo-mark when available
  useEffect(() => {
    if (locationFlowState.result && locationFlowState.geoId && webViewRef.current) {
      console.log('[TripDocument] Creating geo-mark from locationFlowResult:', locationFlowState.result);

      const { placeName, lat, lng, transportMode, transportFrom, waypoints } = locationFlowState.result;

      // Use the geoId that was generated when the flow started
      const geoId = locationFlowState.geoId;

      // Prepare geo-mark data
      const geoMarkData = {
        geoId,
        placeName,
        lat,
        lng,
        colorIndex: 0, // Will be recalculated in functional update
        coordSource: 'manual' as const,
        description: null,
        visitDocument: null,
        transportFrom: transportFrom || null,
        transportProfile: transportMode || 'walking',
        waypoints: waypoints || null,
        photoName: null,
      };

      // Send createGeoMark command to WebView using sendCommand
      webViewRef.current.sendCommand('createGeoMark', {
        geoMarkData: {
          ...geoMarkData,
          colorIndex: getNextColorIndex(locations), // Get color index before update
        },
        selectionFrom: locationFlowState.selectionFrom,
        selectionTo: locationFlowState.selectionTo,
      });

      // Add to locations list using functional update to avoid circular dependency
      setLocations(prev => {
        const colorIndex = getNextColorIndex(prev);
        return [...prev, {
          geoId,
          placeName,
          lat,
          lng,
          colorIndex,
        }];
      });

      console.log('[TripDocument] Geo-mark created successfully');

      // Clear the flow result to prevent re-triggering this effect
      clearLocationFlow();
    }
  }, [locationFlowState.result, locationFlowState.geoId, locationFlowState.selectionFrom, locationFlowState.selectionTo, locations, setLocations, clearLocationFlow]);

  // Watch for geoMarkUpdate and send update command to WebView
  useEffect(() => {
    if (geoMarkUpdate && webViewRef.current) {
      console.log('[TripDocument] Updating geo-mark:', geoMarkUpdate);

      // Send updateGeoMark command to WebView
      webViewRef.current.sendCommand('updateGeoMark', {
        geoId: geoMarkUpdate.geoId,
        updatedAttrs: geoMarkUpdate.updatedAttrs,
      });

      console.log('[TripDocument] Geo-mark update command sent');

      // Clear the update to prevent re-triggering this effect
      setGeoMarkUpdate(null);
    }
  }, [geoMarkUpdate, setGeoMarkUpdate]);

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
            onPress={handlePlayDocument}
            style={[styles.iconButton, isPresenting && styles.iconButtonActive]}
            disabled={!currentDoc}
          >
            <Ionicons
              name={isPresenting ? "pause" : "play"}
              size={22}
              color={isPresenting ? "#fff" : "#6B7280"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleToggleCollaboration}
            style={[styles.iconButton, isCollabEnabled && styles.iconButtonActive]}
            disabled={isEnablingCollab}
          >
            <Ionicons
              name={isCollabEnabled ? "people" : "people-outline"}
              size={22}
              color={isCollabEnabled ? "#fff" : "#6B7280"}
            />
          </TouchableOpacity>

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

          {/* Test Nested Dynamic Route Button */}
          <TouchableOpacity
            onPress={() => {
              const randomId = `test-${Date.now()}`;
              router.push(`/document/${tripId}/test-nested/${randomId}` as any);
            }}
            style={[styles.iconButton, { backgroundColor: '#10B981' }]}
          >
            <Ionicons
              name="flask"
              size={22}
              color="#fff"
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
            <DocumentChat
              documentId={tripId}
              onGeoMarksChange={setChatGeoMarks}
            />
          </View>
        )}

        {/* Map - Always mounted but hidden when not shown to preserve state */}
        <View style={[styles.mapContainer, { display: showMap ? 'flex' : 'none' }]}>
          <DocumentSplitMap
              locations={[...locations, ...chatLocations]}
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
              previewRoute={previewRoute}
              onWaypointsChange={handleMapWaypointsChange}
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

        {/* Document */}
        <View
          style={[
            styles.documentContainer,
            (showMap || showChat) && styles.documentContainerSplit
          ]}
          onLayout={(e) => setDocumentWidth(e.nativeEvent.layout.width)}
        >
          <DocumentEditorWithMap
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
            existingGeoMarks={existingGeoMarks}
            onRouteChange={setPreviewRoute}
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
      </View>

      {/* Presentation Overlay - shows controls when presentation is active */}
      <PresentationOverlay />
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
