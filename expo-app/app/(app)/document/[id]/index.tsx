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

import React from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTripContext } from './_layout';
import DynamicLandingDocumentProseMirror from '@/app/(public)/components/DynamicLandingDocumentProseMirror';

export default function TripDocumentView() {
  const insets = useSafeAreaInsets();
  const { tripId, isEditMode, setIsEditMode, setLocations } = useTripContext();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3B82F6" />
        </TouchableOpacity>

        <Text style={styles.title}>Trip Document (New)</Text>

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

      {/* Main Content - Landing Page Component */}
      <DynamicLandingDocumentProseMirror
        onLocationsChange={setLocations}
      />

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#3B82F6" />
        <Text style={styles.infoText}>
          New document route - Based on landing page demo. Work in progress.
        </Text>
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
  iconButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  iconButtonActive: {
    backgroundColor: '#3B82F6',
  },
  infoBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#DBEAFE',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1E40AF',
  },
});
