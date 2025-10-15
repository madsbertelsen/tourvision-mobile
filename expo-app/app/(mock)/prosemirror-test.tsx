import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import ProseMirrorNativeRenderer from '@/components/ProseMirrorNativeRenderer';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';

/**
 * Test screen for WebView + Vanilla JavaScript ProseMirror approach
 *
 * This demonstrates using ProseMirror without React-ProseMirror or Expo DOM components.
 * The editor runs in a WebView with vanilla JavaScript, and communicates with React Native
 * via message passing.
 *
 * Key benefits:
 * - Works on iOS, Android, and Web
 * - No dependency on @nytimes/react-prosemirror
 * - No dependency on Expo DOM components
 * - Direct ProseMirror control without React overhead
 * - Smooth editing experience (no React re-render issues)
 */
export default function ProseMirrorTestScreen() {
  const editorRef = useRef<ProseMirrorWebViewRef>(null);
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<any>(null);
  const [currentRevision, setCurrentRevision] = useState(0);
  const [selectionEmpty, setSelectionEmpty] = useState(true);
  const [geoMarkDataToCreate, setGeoMarkDataToCreate] = useState<any>(null);
  const lastProcessedLocationRef = useRef<string | null>(null);

  // Sample content for testing
  const sampleContent = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, id: 'heading-1' },
        content: [{ type: 'text', text: 'WebView ProseMirror Test' }]
      },
      {
        type: 'paragraph',
        attrs: { id: 'para-1' },
        content: [
          { type: 'text', text: 'This is a test of ProseMirror running in a WebView with vanilla JavaScript.' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'para-2' },
        content: [
          { type: 'text', text: 'Try editing this text! Click Edit Mode to start typing. Your changes are automatically saved!' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'para-3' },
        content: [
          { type: 'text', text: 'Visit ' },
          {
            type: 'text',
            text: 'Eiffel Tower',
            marks: [
              {
                type: 'geoMark',
                attrs: {
                  geoId: 'test-loc-1',
                  placeName: 'Eiffel Tower',
                  lat: '48.8584',
                  lng: '2.2945',
                  colorIndex: 0,
                  coordSource: 'manual'
                }
              }
            ]
          },
          { type: 'text', text: ' in Paris!' }
        ]
      }
    ]
  };

  // Initialize with sample content on mount
  useEffect(() => {
    if (!currentDoc) {
      console.log('[ProseMirrorTest] Initializing with sample content');
      setCurrentDoc(sampleContent);
      setCurrentRevision(1);
    }
  }, []);

  // Listen for location data returned from create-location modal
  useFocusEffect(
    useCallback(() => {
      if (params.savedLocation) {
        const locationStr = typeof params.savedLocation === 'string'
          ? params.savedLocation
          : JSON.stringify(params.savedLocation);

        if (lastProcessedLocationRef.current === locationStr) {
          console.log('[ProseMirrorTest] Already processed this location, skipping');
          return;
        }

        try {
          const locationData = typeof params.savedLocation === 'string'
            ? JSON.parse(params.savedLocation)
            : params.savedLocation;

          console.log('[ProseMirrorTest] Received location data from modal:', locationData);
          lastProcessedLocationRef.current = locationStr;

          // Set the data to create - this will be picked up by the WebView
          setGeoMarkDataToCreate(locationData);

          // Clear the params immediately to avoid re-processing
          router.setParams({ savedLocation: undefined });

          // Clear the data after a longer timeout to ensure component has processed it
          setTimeout(() => {
            console.log('[ProseMirrorTest] Clearing geoMarkDataToCreate');
            setGeoMarkDataToCreate(null);
          }, 1000);
        } catch (error) {
          console.error('[ProseMirrorTest] Failed to parse saved location:', error);
        }
      }
    }, [params.savedLocation, router])
  );

  const handleDocumentChange = (doc: any) => {
    console.log('[ProseMirrorTest] Document changed, saving...');
    setCurrentDoc(doc);
    // Don't increment revision for internal changes - only for external updates
  };

  const handleSelectionChange = (empty: boolean) => {
    console.log('[ProseMirrorTest] Selection empty:', empty);
    setSelectionEmpty(empty);

    // If text is selected and we're in edit mode, prepare for iOS menu action
    if (!empty && isEditMode) {
      console.log('[ProseMirrorTest] Text selected, iOS menu may appear');
      // Set a flag that iOS menu might be triggered
      // We'll handle the actual trigger via the iOS menu callback
    }
  };

  const handleGeoMarkNavigate = (attrs: any) => {
    console.log('[ProseMirrorTest] Navigate to location:', attrs);

    // Navigate to location preview screen
    router.push({
      pathname: '/(mock)/location-preview/[id]',
      params: {
        id: attrs.geoId || 'unknown',
        name: attrs.placeName || 'Location',
        lat: attrs.lat || '0',
        lng: attrs.lng || '0',
        description: attrs.description || '',
        colorIndex: attrs.colorIndex?.toString() || '0',
      },
    });
  };

  const handleShowGeoMarkEditor = (data: any, locations: any[]) => {
    console.log('[ProseMirrorTest] Show geo-mark editor:', data, locations);

    // Navigate to create-location screen
    router.push({
      pathname: '/(mock)/create-location',
      params: {
        tripId: 'prosemirror-test', // Use a test trip ID
        placeName: data.placeName || '',
        lat: data.lat || '',
        lng: data.lng || '',
      },
    });
  };

  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  const loadSampleContent = () => {
    console.log('[ProseMirrorTest] Loading sample content with new revision');
    setCurrentDoc(sampleContent);
    setCurrentRevision(prev => prev + 1); // Increment revision to trigger update
  };

  const createGeoMark = () => {
    console.log('[ProseMirrorTest] Create Location button clicked');
    console.log('[ProseMirrorTest] Selection empty:', selectionEmpty);

    if (selectionEmpty) {
      alert('Please select some text first!');
      return;
    }

    console.log('[ProseMirrorTest] Sending createGeoMark command to WebView');
    editorRef.current?.sendCommand('createGeoMark');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>WebView Test</Text>
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

        <TouchableOpacity onPress={loadSampleContent} style={styles.button}>
          <Text style={styles.buttonText}>Load Sample</Text>
        </TouchableOpacity>

        {/* Simulate iOS menu action */}
        {!selectionEmpty && isEditMode && (
          <TouchableOpacity
            onPress={() => editorRef.current?.triggerCreateLocation()}
            style={[styles.button, { backgroundColor: '#10b981' }]}
          >
            <Text style={[styles.buttonText, { color: 'white' }]}>
              📍 iOS Menu Test
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
            ref={editorRef}
            content={currentDoc}
            editable={isEditMode}
            onChange={handleDocumentChange}
            onSelectionChange={handleSelectionChange}
            onGeoMarkNavigate={handleGeoMarkNavigate}
            onShowGeoMarkEditor={handleShowGeoMarkEditor}
            geoMarkDataToCreate={geoMarkDataToCreate}
          />
        </View>

        {/* Native Renderer - Only visible in read mode */}
        {!isEditMode && (
          <View style={styles.nativeRendererContainer}>
            <ProseMirrorNativeRenderer content={currentDoc} />
          </View>
        )}

        {/* Toolbar - Only in edit mode */}
        {isEditMode && (
          <View style={styles.toolbar}>
            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('setParagraph')}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>P</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('setHeading', { level: 1 })}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>H1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('setHeading', { level: 2 })}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>H2</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('setHeading', { level: 3 })}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>H3</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('toggleBold')}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>B</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('toggleItalic')}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>I</Text>
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
            Doc nodes: {currentDoc.content?.length || 0} | Revision: {currentRevision}
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
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
