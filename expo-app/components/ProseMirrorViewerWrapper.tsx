import React, { Suspense, useRef, useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import type { ProseMirrorViewerRef } from './dom/prosemirror-viewer';

// Lazy load the DOM component
const ProseMirrorViewerDOM = React.lazy(() => import('./dom/prosemirror-viewer'));

interface ProseMirrorViewerWrapperProps {
  content?: any; // ProseMirror JSON document
  onNodeFocus?: (nodeId: string | null) => void;
  focusedNodeId?: string | null;
  height?: number | string;
  editable?: boolean;
}

export function ProseMirrorViewerWrapper({
  content,
  onNodeFocus,
  focusedNodeId,
  height = '100%',
  editable = false
}: ProseMirrorViewerWrapperProps) {
  const viewerRef = useRef<ProseMirrorViewerRef>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  // Style for container
  const containerStyle = height === '100%'
    ? [styles.container, styles.fullHeight]
    : [styles.container, { height }];

  return (
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
        />
      </Suspense>
    </View>
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
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
});

export default ProseMirrorViewerWrapper;