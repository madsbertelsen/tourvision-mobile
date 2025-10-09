import React, { Suspense, useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import type { ProseMirrorViewerRef } from './dom/prosemirror-viewer';

// Lazy load the DOM component
const ProseMirrorViewerDOM = React.lazy(() => import('./dom/prosemirror-viewer'));

interface ProseMirrorViewerWrapperProps {
  content?: any; // ProseMirror JSON document
  onNodeFocus?: (nodeId: string | null) => void;
  focusedNodeId?: string | null;
  editable?: boolean;
  onChange?: (doc: any) => void;
  onShowGeoMarkEditor?: (data: any, locations: any[]) => void;
  geoMarkDataToCreate?: any;
  onSelectionChange?: (empty: boolean) => void;
}

export const ProseMirrorViewerWrapper = forwardRef<any, ProseMirrorViewerWrapperProps>(({
  content,
  onNodeFocus,
  focusedNodeId,
  editable = false,
  onChange,
  onShowGeoMarkEditor,
  geoMarkDataToCreate,
  onSelectionChange
}, ref) => {
  const viewerRef = useRef<ProseMirrorViewerRef>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [parentDimensions, setParentDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isDOMReady, setIsDOMReady] = useState(false);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    sendCommand: (command: string, params?: any) => {
      console.log('[ProseMirrorWrapper] Sending command to DOM:', command, params);
      if (!viewerRef.current) {
        console.warn('[ProseMirrorWrapper] DOM component not ready yet');
        return;
      }
      if (typeof viewerRef.current.sendCommand !== 'function') {
        console.error('[ProseMirrorWrapper] sendCommand is not a function on DOM component', viewerRef.current);
        return;
      }
      viewerRef.current.sendCommand(command, params);
    },
    scrollToNode: (nodeId: string) => {
      if (!viewerRef.current) {
        console.warn('[ProseMirrorWrapper] DOM component not ready yet');
        return;
      }
      viewerRef.current.scrollToNode(nodeId);
    },
    getState: () => {
      if (!viewerRef.current) {
        console.warn('[ProseMirrorWrapper] DOM component not ready yet');
        return null;
      }
      return viewerRef.current.getState();
    }
  }), []);

  // Pass through to parent callback if provided
  const handleShowGeoMarkEditor = useCallback((data: any, locations: any[]) => {
    console.log('[ProseMirrorWrapper] handleShowGeoMarkEditor called with:', data);
    if (onShowGeoMarkEditor) {
      onShowGeoMarkEditor(data, locations);
    }
  }, [onShowGeoMarkEditor]);

  // Handle selection changes from DOM
  const handleSelectionChange = useCallback((empty: boolean) => {
    console.log('[ProseMirrorWrapper] Selection changed, empty:', empty);
    if (onSelectionChange) {
      onSelectionChange(empty);
    }
  }, [onSelectionChange]);

  // Handle loading state
  useEffect(() => {
    if (content) {
      setIsLoading(false);
    }
  }, [content]);

  // Handle messages from DOM component
  const handleMessage = (event: any) => {
    try {
      const data = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;

      console.log('[ProseMirrorWrapper] Received message:', data);

      if (data.type === 'showGeoMarkEditor' && onShowGeoMarkEditor) {
        // Pass to parent to show bottom sheet
        onShowGeoMarkEditor(data.data, data.existingLocations || []);
      } else if (data.type === 'selectionChange' && onSelectionChange) {
        // Handle selection change
        onSelectionChange(data.empty);
      }
    } catch (error) {
      console.error('[ProseMirrorWrapper] Error handling message:', error);
    }
  };

  // Simple flex-based styling

  return (
    <View
      style={{ flex: 1, width: '100%' }}
      onLayout={(event) => {
        const { height: h, width: w } = event.nativeEvent.layout;
        console.log('[ProseMirrorWrapper] Container measured:', w, 'x', h, 'px');
        setParentDimensions({ width: w, height: h });
      }}
    >
      {parentDimensions && parentDimensions.height > 50 ? (
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
            onShowGeoMarkEditor={handleShowGeoMarkEditor}
            geoMarkDataToCreate={geoMarkDataToCreate}
            onSelectionChange={handleSelectionChange}
            dom={{
              style: {
                height: '100%',
                width: '100%'
              }
            }}
          />
        </Suspense>
      ) : (
        <View style={styles.loadingContainer}>
          <Text>Waiting for layout...</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EBF5FF',
  },
});

export default ProseMirrorViewerWrapper;