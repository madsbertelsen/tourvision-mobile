import { BottomSheetView } from '@gorhom/bottom-sheet';
import type { EditorState } from 'prosemirror-state';
import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ProseMirrorViewerWrapper from './ProseMirrorViewerWrapper';

interface TripDocumentSheetProps {
  editorState: EditorState | null;
  onNodeFocus: (nodeId: string | null) => void;
  focusedNodeId: string | null;
  isEditMode: boolean;
  onChange: (doc: any) => void;
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
  onShowGeoMarkEditor,
  geoMarkDataToCreate,
  onSelectionChange,
}, ref) => {
  const viewerRef = useRef<any>(null);

  // Expose sendCommand to parent
  useImperativeHandle(ref, () => ({
    sendCommand: (command: string, params?: any) => {
      console.log('[TripDocumentSheet] Forwarding command to viewer:', command, params);
      viewerRef.current?.sendCommand(command, params);
    }
  }));

  return (
    <BottomSheetView style={styles.bottomSheetContent}>
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
    </BottomSheetView>
  );
});

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