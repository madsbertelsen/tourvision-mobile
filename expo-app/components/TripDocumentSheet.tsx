import { BottomSheetView } from '@gorhom/bottom-sheet';
import type { EditorState } from 'prosemirror-state';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import ProseMirrorViewerWrapper from './ProseMirrorViewerWrapper';

interface TripDocumentSheetProps {
  editorState: EditorState | null;
  onNodeFocus: (nodeId: string | null) => void;
  focusedNodeId: string | null;
  isEditMode: boolean;
  onChange: (doc: any) => void;
  sheetHeight?: number;
  onShowGeoMarkEditor?: (data: any, locations: any[]) => void;
  geoMarkDataToCreate?: any;
}

export function TripDocumentSheet({
  editorState,
  onNodeFocus,
  focusedNodeId,
  isEditMode,
  onChange,
  sheetHeight,
  onShowGeoMarkEditor,
  geoMarkDataToCreate,
}: TripDocumentSheetProps) {
  const screenHeight = Dimensions.get('window').height;

  // Use provided height or calculate a reasonable default
  const visibleHeight = sheetHeight || screenHeight * 0.5;

  // Log when height changes
  useEffect(() => {
    console.log('[TripDocumentSheet] Height set to:', visibleHeight.toFixed(0));
  }, [visibleHeight]);


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
            onShowGeoMarkEditor={onShowGeoMarkEditor}
            geoMarkDataToCreate={geoMarkDataToCreate}
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