import { BottomSheetView } from '@gorhom/bottom-sheet';
import type { EditorState } from 'prosemirror-state';
import React, { useEffect, useState, useRef } from 'react';
import { Dimensions, StyleSheet, Text, View, KeyboardAvoidingView, Platform } from 'react-native';
import ProseMirrorViewerWrapper from './ProseMirrorViewerWrapper';
import { ProseMirrorToolbar } from './ProseMirrorToolbar';

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
  const viewerRef = useRef<any>(null);
  const [selectionEmpty, setSelectionEmpty] = useState(true);

  // Use provided height or calculate a reasonable default
  const visibleHeight = sheetHeight || screenHeight * 0.5;

  // Log when height changes
  useEffect(() => {
    console.log('[TripDocumentSheet] Height set to:', visibleHeight.toFixed(0));
  }, [visibleHeight]);

  const handleToolbarCommand = (command: string, params?: any) => {
    console.log('[TripDocumentSheet] Toolbar command:', command, params);
    viewerRef.current?.sendCommand(command, params);
  };

  const handleSelectionChange = (empty: boolean) => {
    setSelectionEmpty(empty);
  };

  // Calculate toolbar height (44px toolbar + safe area)
  const toolbarHeight = isEditMode ? 44 : 0;
  const contentHeight = visibleHeight - toolbarHeight;

  return (
    <BottomSheetView style={styles.bottomSheetContent}>
      <KeyboardAvoidingView
        style={{ height: visibleHeight, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          <View style={{ height: contentHeight, width: '100%' }}>
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
                onSelectionChange={handleSelectionChange}
              />
            ) : (
              <View style={styles.centerContent}>
                <Text style={styles.loadingText}>Waiting for content...</Text>
              </View>
            )}
          </View>
          <ProseMirrorToolbar
            editable={isEditMode}
            selectionEmpty={selectionEmpty}
            onCommand={handleToolbarCommand}
          />
        </View>
      </KeyboardAvoidingView>
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