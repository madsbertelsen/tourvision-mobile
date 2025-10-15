import React, { useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, KeyboardAvoidingView } from 'react-native';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import { router } from 'expo-router';

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
  const [isEditMode, setIsEditMode] = useState(false);
  const [lastSavedDoc, setLastSavedDoc] = useState<any>(null);
  const [selectionEmpty, setSelectionEmpty] = useState(true);

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
          { type: 'text', text: 'Try editing this text! Click Edit Mode to start typing.' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'para-3' },
        content: [
          { type: 'text', text: 'Visit ' },
          {
            type: 'geoMark',
            attrs: {
              geoId: 'test-loc-1',
              placeName: 'Eiffel Tower',
              lat: '48.8584',
              lng: '2.2945',
              colorIndex: 0,
              coordSource: 'manual'
            },
            content: [{ type: 'text', text: 'Eiffel Tower' }]
          },
          { type: 'text', text: ' in Paris!' }
        ]
      }
    ]
  };

  const handleDocumentChange = (doc: any) => {
    console.log('[ProseMirrorTest] Document changed:', doc);
    setLastSavedDoc(doc);
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
    alert(`Navigate to: ${attrs.placeName}\nLat: ${attrs.lat}, Lng: ${attrs.lng}`);
  };

  const handleShowGeoMarkEditor = (data: any, locations: any[]) => {
    console.log('[ProseMirrorTest] Show geo-mark editor:', data, locations);

    // For testing, just create a simple location
    const geoMarkData = {
      geoId: `test-loc-${Date.now()}`,
      placeName: data.placeName || 'New Location',
      lat: '48.8566',
      lng: '2.3522',
      colorIndex: data.colorIndex || 0,
      description: 'Test location',
      coordSource: 'manual'
    };

    // Send the geo-mark data back to the WebView
    editorRef.current?.createGeoMarkWithData(geoMarkData);
  };

  const toggleEditMode = () => {
    setIsEditMode(!isEditMode);
  };

  const loadSampleContent = () => {
    // The content will be passed via props and the WebView will handle it
    console.log('[ProseMirrorTest] Sample content loaded');
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
      <View style={styles.header}>
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

      {/* Editor with Keyboard-Aware Toolbar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.editorContainer}>
          <ProseMirrorWebView
            ref={editorRef}
            content={sampleContent}
            editable={isEditMode}
            onChange={handleDocumentChange}
            onSelectionChange={handleSelectionChange}
            onGeoMarkNavigate={handleGeoMarkNavigate}
            onShowGeoMarkEditor={handleShowGeoMarkEditor}
          />
        </View>

        {/* Keyboard Toolbar */}
        {isEditMode && (
          <View style={styles.toolbar}>
            <TouchableOpacity
              onPress={() => editorRef.current?.triggerCreateLocation()}
              style={[styles.toolbarButton, selectionEmpty && styles.toolbarButtonDisabled]}
              disabled={selectionEmpty}
            >
              <Text style={styles.toolbarButtonText}>📍 Create Location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('bold')}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>B</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('italic')}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>I</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('undo')}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>↶</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => editorRef.current?.sendCommand('redo')}
              style={styles.toolbarButton}
            >
              <Text style={styles.toolbarButtonText}>↷</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Debug Info */}
      {lastSavedDoc && (
        <View style={styles.debugInfo}>
          <Text style={styles.debugText}>
            Last saved: {new Date().toLocaleTimeString()}
          </Text>
          <Text style={styles.debugText} numberOfLines={2}>
            Doc nodes: {lastSavedDoc.content?.length || 0}
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
  keyboardAvoidingView: {
    flex: 1,
  },
  editorContainer: {
    flex: 1,
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
  toolbarButtonDisabled: {
    opacity: 0.5,
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
