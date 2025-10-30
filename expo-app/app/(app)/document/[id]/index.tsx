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

import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTripContext } from './_layout';
import DynamicLandingDocumentProseMirror from '@/app/(public)/components/DynamicLandingDocumentProseMirror';
import DocumentSplitMap from '@/components/DocumentSplitMap';
import DocumentChat from '@/components/DocumentChat';

export default function TripDocumentView() {
  const insets = useSafeAreaInsets();
  const { tripId, isEditMode, setIsEditMode, locations, setLocations, currentDoc, setCurrentDoc } = useTripContext();
  const [showMap, setShowMap] = useState(true);
  const [showChat, setShowChat] = useState(true);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
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
      <View style={styles.contentWrapper}>
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
            initialContent={currentDoc}
            onLocationsChange={setLocations}
            onContentChange={setCurrentDoc}
            disableAnimation={true}
          />
        </View>

        {/* Map */}
        {showMap && (
          <View style={styles.mapContainer}>
            <DocumentSplitMap locations={locations} />
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
  },
  documentContainerSplit: {
    width: 700,  // Fixed width when split
    maxWidth: 700,  // Enforce max width
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  mapContainer: {
    flex: 1,  // Let map take remaining space
    minWidth: 400,
  },
});
