import { BottomSheetView, useBottomSheet } from '@gorhom/bottom-sheet';
import type { EditorState } from 'prosemirror-state';
import React, { forwardRef, useImperativeHandle, useRef, useState, useCallback } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import ProseMirrorViewerWrapper from './ProseMirrorViewerWrapper';

interface TripDocumentSheetProps {
  editorState: EditorState | null;
  onNodeFocus: (nodeId: string | null) => void;
  focusedNodeId: string | null;
  isEditMode: boolean;
  onChange: (doc: any) => void;
  snapPoints: string[];
  onShowGeoMarkEditor?: (data: any, locations: any[]) => void;
  geoMarkDataToCreate?: any;
  onSelectionChange?: (empty: boolean) => void;
}

export const TripDocumentSheet = forwardRef<any, TripDocumentSheetProps>(({
  editorState,
  onNodeFocus,
  focusedNodeId,
  isEditMode,
  onChange,
  snapPoints,
  onShowGeoMarkEditor,
  geoMarkDataToCreate,
  onSelectionChange,
}, ref) => {
  const viewerRef = useRef<any>(null);
  const screenHeight = Dimensions.get('window').height;
  const { animatedIndex } = useBottomSheet();
  const [visibleHeight, setVisibleHeight] = useState(screenHeight * 0.5);

  // Update height callback (must be defined in JS scope for runOnJS)
  const updateHeight = useCallback((index: number) => {
    if (index >= 0 && index < snapPoints.length) {
      const snapPoint = snapPoints[index];
      const snapPercent = parseInt(snapPoint.replace('%', ''));
      const calculatedHeight = (screenHeight * snapPercent) / 100 - 60;
      console.log('[TripDocumentSheet] Index:', index, '→', calculatedHeight.toFixed(0), 'px');
      setVisibleHeight(calculatedHeight);
    }
  }, [snapPoints, screenHeight]);

  // Watch animated index and update height using worklet
  useAnimatedReaction(
    () => {
      return Math.round(animatedIndex.value);
    },
    (currentIndex, previousIndex) => {
      'worklet';
      if (currentIndex !== previousIndex) {
        runOnJS(updateHeight)(currentIndex);
      }
    },
    []
  );

  // Expose sendCommand to parent
  useImperativeHandle(ref, () => ({
    sendCommand: (command: string, params?: any) => {
      console.log('[TripDocumentSheet] Forwarding command to viewer:', command, params);
      viewerRef.current?.sendCommand(command, params);
    }
  }));

  return (
    <BottomSheetView  style={styles.bottomSheetContent}>
      <View style={{ height: visibleHeight, width: '100%' }}>
        {editorState?.doc ? (
          <ProseMirrorViewerWrapper
            ref={viewerRef}
            content={editorState.doc.toJSON()}
            onNodeFocus={onNodeFocus}
            focusedNodeId={focusedNodeId}
            editable={isEditMode}
            onChange={onChange}
            onShowGeoMarkEditor={onShowGeoMarkEditor}
            geoMarkDataToCreate={geoMarkDataToCreate}
            onSelectionChange={onSelectionChange}
          />
        ) : (
          <View style={styles.centerContent}>
            <Text style={styles.loadingText}>Waiting for content...</Text>
          </View>
        )}
      </View>
    </BottomSheetView>
  );
});

const styles = StyleSheet.create({
  bottomSheetContent: {
    flex: 1,
    backgroundColor: '#EBF5FF',
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