import ProseMirrorViewerWrapper from '@/components/ProseMirrorViewerWrapper';
import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTripContext } from './_layout';

export default function TripDocumentView() {
  console.log('[TripDocumentView] Component mounted');
  const router = useRouter();
  const {
    tripId,
    editorState,
    isEditMode,
    focusedNodeId,
    geoMarkDataToCreate,
    handleNodeFocus,
    handleDocumentChange,
    handleShowGeoMarkEditor,
    handleSelectionChange,
    documentRef,
  } = useTripContext();

  console.log('[TripDocumentView] Rendering with editorState:', !!editorState?.doc);

  // Handle geo-mark click for navigation
  const handleGeoMarkNavigate = useCallback((geoMarkAttrs: any) => {
    console.log('[TripDocumentView] Navigating to location:', geoMarkAttrs.placeName);

    // Navigate to location detail route
    router.push({
      pathname: `/(mock)/trip/${tripId}/location/${geoMarkAttrs.geoId}`,
      params: {
        id: geoMarkAttrs.geoId,
        name: geoMarkAttrs.placeName || 'Location',
        lat: geoMarkAttrs.lat,
        lng: geoMarkAttrs.lng,
        description: geoMarkAttrs.description || '',
        colorIndex: geoMarkAttrs.colorIndex?.toString() || '0',
        photoName: geoMarkAttrs.photoName || '',
      },
    });
  }, [router, tripId]);

  return (
    <View style={styles.container}>
      {editorState?.doc ? (
        <ProseMirrorViewerWrapper
          ref={documentRef}
          content={editorState.doc.toJSON()}
          onNodeFocus={handleNodeFocus}
          focusedNodeId={focusedNodeId}
          editable={isEditMode}
          onChange={handleDocumentChange}
          onShowGeoMarkEditor={handleShowGeoMarkEditor}
          geoMarkDataToCreate={geoMarkDataToCreate}
          onSelectionChange={handleSelectionChange}
          onGeoMarkNavigate={handleGeoMarkNavigate}
        />
      ) : (
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Waiting for content...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
});
