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

import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTripContext } from './_layout';
import DynamicLandingDocumentProseMirror from '@/app/(public)/components/DynamicLandingDocumentProseMirror';
import DocumentSplitMap from '@/components/DocumentSplitMap';
import DocumentChat from '@/components/DocumentChat';
import LocationSidebarPanel from '@/components/LocationSidebarPanel';
import { EMPTY_DOCUMENT_CONTENT } from '@/utils/landing-document-content';
import { useLocationModal } from '@/hooks/useLocationModal';
import { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';

export default function TripDocumentView() {
  const insets = useSafeAreaInsets();
  const { tripId, isEditMode, setIsEditMode, locations, setLocations, currentDoc, setCurrentDoc, locationModal, setLocationModal } = useTripContext();
  const [showMap, setShowMap] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [contentHeight, setContentHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(110); // Default fallback, will be measured

  // Ref for ProseMirror WebView (needed by location modal hook)
  const webViewRef = useRef<ProseMirrorWebViewRef>(null);

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
      // Clear selection coordinates when selection is empty
      setLocationModal({
        selectionTop: undefined,
        selectionLeft: undefined,
        selectionWidth: undefined,
      });
    } else {
      // Update selection coordinates for line rendering
      setLocationModal({
        selectionTop: selectionData.selectionTop,
        selectionLeft: selectionData.selectionLeft,
        selectionWidth: selectionData.selectionWidth,
      });
    }
  }, [setLocationModal]);

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

        <Text style={styles.title}>Trip Document (New)</Text>

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
        <View style={[
          styles.documentContainer,
          (showMap || showChat) && styles.documentContainerSplit
        ]}>
          <DynamicLandingDocumentProseMirror
            initialContent={currentDoc || EMPTY_DOCUMENT_CONTENT}
            onLocationsChange={setLocations}
            onContentChange={setCurrentDoc}
            disableAnimation={true}
            webViewRef={webViewRef}
            onShowGeoMarkEditor={handleShowGeoMarkEditor}
            onSelectionChange={handleSelectionChange}
          />

          {/* Horizontal line from selection - only visible when location modal is open */}
          {showMap && locationModal.visible && locationModal.selectionLeft !== undefined && locationModal.selectionTop !== undefined && (() => {
            // Calculate the right edge of the selection (end of selected text)
            const selectionRight = locationModal.selectionLeft + (locationModal.selectionWidth || 0);
            const lineStart = selectionRight;
            const lineWidth = 700 - lineStart;

            return (
              <View style={[styles.arrowSegment, {
                left: lineStart,
                top: headerHeight + locationModal.selectionTop - 1.5, // Header + midpoint - half line height
                width: lineWidth,
                height: 3,
              }]}>
                <View style={styles.arrowLine} />
              </View>
            );
          })()}
        </View>

        {/* Map */}
        {showMap && (
          <View style={styles.mapContainer}>
            <DocumentSplitMap
              locations={locations}
              searchResults={locationModal.visible ? locationModal.locationSearchResults : []}
              selectedSearchIndex={locationModal.selectedResultIndex}
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
                />
              }
              arrowContent={
                locationModal.visible && locationModal.selectionTop !== undefined && contentHeight > 0 ? (
                  <>
                    {/* Vertical segment from text midpoint to 200px from bottom */}
                    <View style={[styles.arrowSegment, {
                      left: -1.5,
                      top: headerHeight + locationModal.selectionTop - 1.5,
                      width: 3,
                      height: contentHeight - (headerHeight + locationModal.selectionTop - 1.5) - 200,
                    }]}>
                      <View style={[styles.arrowLine, { width: 3, height: '100%' }]} />
                    </View>

                    {/* Horizontal segment to sidebar with arrowhead */}
                    <View style={[styles.arrowSegment, {
                      left: 0,
                      top: contentHeight - 200,
                      width: 20,
                      height: 3,
                    }]}>
                      <View style={styles.arrowLine} />
                      <View style={styles.arrowHead} />
                    </View>

                    {/* Corner dot at the bend */}
                    <View style={[styles.cornerDot, {
                      left: -4,
                      top: contentHeight - 200 - 4,
                    }]} />
                  </>
                ) : null
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
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
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
  },
  documentContainerSplit: {
    width: 700,  // Fixed width when split
    maxWidth: 700,  // Enforce max width
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    overflow: 'hidden',  // Prevent arrow from extending outside
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
