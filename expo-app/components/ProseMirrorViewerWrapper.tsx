import React, { Suspense, useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GeoMarkBottomSheet } from './GeoMarkBottomSheet';
import type { ProseMirrorViewerRef } from './dom/prosemirror-viewer';

// Lazy load the DOM component
const ProseMirrorViewerDOM = React.lazy(() => import('./dom/prosemirror-viewer'));

interface ProseMirrorViewerWrapperProps {
  content?: any; // ProseMirror JSON document
  onNodeFocus?: (nodeId: string | null) => void;
  focusedNodeId?: string | null;
  height?: number | string;
  editable?: boolean;
  onChange?: (doc: any) => void;
}

export function ProseMirrorViewerWrapper({
  content,
  onNodeFocus,
  focusedNodeId,
  height = '100%',
  editable = false,
  onChange
}: ProseMirrorViewerWrapperProps) {
  const viewerRef = useRef<ProseMirrorViewerRef>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showGeoMarkSheet, setShowGeoMarkSheet] = useState(false);
  const [geoMarkData, setGeoMarkData] = useState<any>(null);
  const [existingLocations, setExistingLocations] = useState<Array<{ geoId: string; placeName: string }>>([]);
  const [geoMarkDataToCreate, setGeoMarkDataToCreate] = useState<any>(null);

  // Callback to show geo-mark editor
  const handleShowGeoMarkEditor = useCallback((data: any, locations: any[]) => {
    console.log('[ProseMirrorWrapper] handleShowGeoMarkEditor called with:', data);
    setGeoMarkData(data);
    setExistingLocations(locations || []);
    setShowGeoMarkSheet(true);
  }, []);

  // Handle loading state
  useEffect(() => {
    if (content) {
      setIsLoading(false);
    }
  }, [content]);

  // Helper method to scroll to a specific node
  const scrollToNode = (nodeId: string) => {
    viewerRef.current?.scrollToNode(nodeId);
  };

  // Get the current editor state
  const getState = () => {
    return viewerRef.current?.getState();
  };

  // Handle messages from DOM component
  const handleMessage = (event: any) => {
    try {
      const data = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;

      console.log('[ProseMirrorWrapper] Received message:', data);

      if (data.type === 'showGeoMarkEditor') {
        // Show bottom sheet with geo-mark data
        setGeoMarkData(data.data);
        setExistingLocations(data.existingLocations || []);
        setShowGeoMarkSheet(true);
      }
    } catch (error) {
      console.error('[ProseMirrorWrapper] Error handling message:', error);
    }
  };

  // Handle saving geo-mark from bottom sheet
  const handleGeoMarkSave = (data: any) => {
    console.log('[ProseMirrorWrapper] Saving geo-mark:', data);

    // Trigger geo-mark creation by updating the prop
    setGeoMarkDataToCreate(data);

    setShowGeoMarkSheet(false);

    // Reset after a small delay to allow DOM component to process
    setTimeout(() => {
      setGeoMarkDataToCreate(null);
    }, 100);
  };

  // Handle canceling geo-mark creation
  const handleGeoMarkCancel = () => {
    console.log('[ProseMirrorWrapper] Cancelled geo-mark creation');
    setShowGeoMarkSheet(false);
    setGeoMarkDataToCreate(null);
  };

  // Style for container
  const containerStyle = height === '100%'
    ? [styles.container, styles.fullHeight]
    : [styles.container, { height }];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={containerStyle}>
        <Suspense fallback={
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        }>
          <ProseMirrorViewerDOM
            ref={viewerRef}
            content={content}
            onNodeFocus={onNodeFocus}
            focusedNodeId={focusedNodeId}
            editable={editable}
            onChange={onChange}
            height={height}
            onShowGeoMarkEditor={handleShowGeoMarkEditor}
            geoMarkDataToCreate={geoMarkDataToCreate}
          />
        </Suspense>
      </View>

      {/* Geo-mark Bottom Sheet */}
      <GeoMarkBottomSheet
        isVisible={showGeoMarkSheet}
        initialData={geoMarkData}
        existingLocations={existingLocations}
        onSave={handleGeoMarkSave}
        onCancel={handleGeoMarkCancel}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  fullHeight: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
});

export default ProseMirrorViewerWrapper;