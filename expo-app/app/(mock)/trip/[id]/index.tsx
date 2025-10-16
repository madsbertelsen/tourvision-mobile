import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import ProseMirrorNativeRenderer from '@/components/ProseMirrorNativeRenderer';
import { router } from 'expo-router';
import { useTripContext } from './_layout';

export default function TripDocumentView() {
  console.log('[TripDocumentView] Component mounted');
  const insets = useSafeAreaInsets();
  const {
    tripId,
    currentTrip,
    currentDoc,
    isEditMode,
    setIsEditMode,
    selectionEmpty,
    setSelectionEmpty,
    geoMarkDataToCreate,
    handleDocumentChange,
    handleShowGeoMarkEditor,
    documentRef,
  } = useTripContext();

  const [toolbarState, setToolbarState] = useState({
    paragraph: false,
    h1: false,
    h2: false,
    h3: false,
    bold: false,
    italic: false,
  });

  const handleSelectionChange = useCallback((empty: boolean) => {
    console.log('[TripDocumentView] Selection empty:', empty);
    setSelectionEmpty(empty);
  }, [setSelectionEmpty]);

  const handleToolbarStateChange = useCallback((state: any) => {
    console.log('[TripDocumentView] Toolbar state changed:', state);
    setToolbarState(state);
  }, []);

  const handleGeoMarkNavigate = useCallback((attrs: any) => {
    console.log('[TripDocumentView] Navigate to location:', attrs);

    // Navigate to location screen (Stack-nested for slide transition)
    const params: any = {
      locationId: attrs.geoId || 'unknown',
      id: attrs.geoId || 'unknown',
      name: attrs.placeName || 'Location',
      lat: attrs.lat || '0',
      lng: attrs.lng || '0',
      description: attrs.description || '',
      colorIndex: attrs.colorIndex?.toString() || '0',
      tripId: tripId, // Pass tripId so location screen can load trip data
    };

    // Pass contextDocument if it exists
    if (attrs.contextDocument) {
      params.contextDocument = JSON.stringify(attrs.contextDocument);
    }

    router.push({
      pathname: 'location/[locationId]',
      params,
    });
  }, [tripId]);

  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  const createGeoMark = () => {
    console.log('[TripDocumentView] Create Location button clicked');
    console.log('[TripDocumentView] Selection empty:', selectionEmpty);

    if (selectionEmpty) {
      alert('Please select some text first!');
      return;
    }

    console.log('[TripDocumentView] Sending createGeoMark command to WebView');
    (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('createGeoMark');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {currentTrip?.title || 'Trip'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={toggleEditMode}
          style={[styles.button, isEditMode && styles.buttonActive]}
        >
          <Text style={[styles.buttonText, isEditMode && styles.buttonTextActive]}>
            {isEditMode ? 'Read Mode' : 'Edit Mode'}
          </Text>
        </TouchableOpacity>

        {isEditMode && (
          <TouchableOpacity
            onPress={createGeoMark}
            style={[styles.button, selectionEmpty && styles.buttonDisabled]}
            disabled={selectionEmpty}
          >
            <Text style={[styles.buttonText, selectionEmpty && styles.buttonTextDisabled]}>
              Create Location
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoText}>
          Platform: {Platform.OS} | Edit: {isEditMode ? 'ON' : 'OFF'} |
          Selection: {selectionEmpty ? 'Empty' : 'Has text'}
        </Text>
      </View>

      {/* Editor - Keep WebView mounted but hidden in read mode */}
      <KeyboardAvoidingView
        style={styles.editorWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* WebView - Always mounted, hidden in read mode */}
        <View style={[styles.editorContainer, !isEditMode && styles.hidden]}>
          <ProseMirrorWebView
            ref={documentRef}
            content={currentDoc}
            editable={isEditMode}
            onChange={handleDocumentChange}
            onSelectionChange={handleSelectionChange}
            onToolbarStateChange={handleToolbarStateChange}
            onGeoMarkNavigate={handleGeoMarkNavigate}
            onShowGeoMarkEditor={handleShowGeoMarkEditor}
            geoMarkDataToCreate={geoMarkDataToCreate}
          />
        </View>

        {/* Native Renderer - Only visible in read mode */}
        {!isEditMode && (
          <View style={styles.nativeRendererContainer}>
            <ProseMirrorNativeRenderer content={currentDoc} tripId={tripId} />
          </View>
        )}

        {/* Toolbar - Only in edit mode */}
        {isEditMode && (
          <View style={styles.toolbar}>
            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('setParagraph')}
              style={[styles.toolbarButton, toolbarState.paragraph && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.paragraph && styles.toolbarButtonTextActive]}>P</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('setHeading', { level: 1 })}
              style={[styles.toolbarButton, toolbarState.h1 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h1 && styles.toolbarButtonTextActive]}>H1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('setHeading', { level: 2 })}
              style={[styles.toolbarButton, toolbarState.h2 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h2 && styles.toolbarButtonTextActive]}>H2</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('setHeading', { level: 3 })}
              style={[styles.toolbarButton, toolbarState.h3 && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.h3 && styles.toolbarButtonTextActive]}>H3</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('toggleBold')}
              style={[styles.toolbarButton, toolbarState.bold && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.bold && styles.toolbarButtonTextActive]}>B</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => (documentRef as React.MutableRefObject<ProseMirrorWebViewRef>).current?.sendCommand('toggleItalic')}
              style={[styles.toolbarButton, toolbarState.italic && styles.toolbarButtonActive]}
            >
              <Text style={[styles.toolbarButtonText, toolbarState.italic && styles.toolbarButtonTextActive]}>I</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Debug Info */}
      {currentDoc && (
        <View style={styles.debugInfo}>
          <Text style={styles.debugText}>
            Last saved: {new Date().toLocaleTimeString()}
          </Text>
          <Text style={styles.debugText} numberOfLines={2}>
            Doc nodes: {currentDoc.content?.length || 0} | Trip: {currentTrip?.title || 'N/A'}
          </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  buttonTextActive: {
    color: '#ffffff',
  },
  buttonTextDisabled: {
    color: '#9ca3af',
  },
  infoBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fbbf24',
  },
  infoText: {
    fontSize: 12,
    color: '#92400e',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  editorWrapper: {
    flex: 1,
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  nativeRendererContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 8,
    alignItems: 'center',
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    minWidth: 40,
    alignItems: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  toolbarButtonTextActive: {
    color: '#ffffff',
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
  debugInfo: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  debugText: {
    fontSize: 11,
    color: '#6b7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
