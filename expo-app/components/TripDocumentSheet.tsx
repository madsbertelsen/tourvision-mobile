import { BottomSheetView, useBottomSheet } from '@gorhom/bottom-sheet';
import type { EditorState } from 'prosemirror-state';
import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import ProseMirrorViewerWrapper from './ProseMirrorViewerWrapper';

interface TripDocumentSheetProps {
  editorState: EditorState | null;
  onNodeFocus: (nodeId: string | null) => void;
  focusedNodeId: string | null;
  isEditMode: boolean;
  onChange: (doc: any) => void;
}

export function TripDocumentSheet({
  editorState,
  onNodeFocus,
  focusedNodeId,
  isEditMode,
  onChange,
}: TripDocumentSheetProps) {
  const { animatedPosition } = useBottomSheet();
  const [currentPosition, setCurrentPosition] = useState(0);
  const screenHeight = Dimensions.get('window').height;

  // Safe way to observe animated position
  useAnimatedReaction(
    () => animatedPosition.value,
    (position) => {
      'worklet';
      // Update state on JS thread
      runOnJS(setCurrentPosition)(position);
    },
    []
  );

  // Calculate visible height
  const visibleHeight = Math.max(100, screenHeight - currentPosition);

  // Log when position changes
  useEffect(() => {
    console.log('[TripDocumentSheet] Position:', currentPosition.toFixed(2), 'Visible height:', visibleHeight.toFixed(0));
  }, [currentPosition, visibleHeight]);


  return (
    <BottomSheetView style={styles.bottomSheetContent}>
      <View style={{ height: visibleHeight, width: '100%' }}>
        {editorState?.doc ? (
          <ProseMirrorViewerWrapper
            content={editorState.doc.toJSON()}
            onNodeFocus={onNodeFocus}
            focusedNodeId={focusedNodeId}
            editable={isEditMode}
            onChange={onChange}
            // Don't pass height as prop to avoid re-renders
            // The DOM component will use ResizeObserver to detect container size
          />
        ) : (
          <View style={styles.centerContent}>
            <Text style={styles.loadingText}>Waiting for content...</Text>
          </View>
        )}
      </View>
    </BottomSheetView>
  );
}

const styles = StyleSheet.create({
  bottomSheetContent: {
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