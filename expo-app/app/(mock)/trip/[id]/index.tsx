import ProseMirrorViewerWrapper from '@/components/ProseMirrorViewerWrapper';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
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

  // Cache content to prevent passing new references while editing
  const lastContentRef = React.useRef<any>(null);
  const wasEditModeRef = React.useRef(isEditMode);

  // Detect mode changes
  if (wasEditModeRef.current !== isEditMode) {
    console.log('[TripDocumentView] Edit mode changed:', wasEditModeRef.current, '->', isEditMode);

    // Only clear cache when entering edit mode (read -> edit)
    // When exiting edit mode (edit -> read), keep the cached content to preserve changes
    if (isEditMode && !wasEditModeRef.current) {
      console.log('[TripDocumentView] Entering edit mode, clearing content cache');
      lastContentRef.current = null;
    } else {
      console.log('[TripDocumentView] Exiting edit mode, keeping cached content');
    }

    wasEditModeRef.current = isEditMode;
  }

  const content = useMemo(() => {
    if (!editorState?.doc) return null;

    // While in edit mode and we have cached content, keep returning it
    // This prevents the content prop from changing during saves
    if (isEditMode && lastContentRef.current) {
      console.log('[TripDocumentView] Returning cached content (edit mode)');
      return lastContentRef.current;
    }

    // Update cache with new content
    const newContent = editorState.doc.toJSON();
    console.log('[TripDocumentView] Computing new content (cache miss or read mode)');
    lastContentRef.current = newContent;
    return newContent;
  }, [editorState?.doc, isEditMode]);

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
      {content ? (
        <ProseMirrorViewerWrapper
          ref={documentRef}
          content={content}
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
