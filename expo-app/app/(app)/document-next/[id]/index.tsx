import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, Platform, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChromeTabBar } from '@/components/ChromeTabBar';
import { ProseMirrorToolbar } from '@/components/ProseMirrorToolbar';
import { useDocumentNextContext } from './_layout';
import { testLocations, generateTestDocument } from '@/utils/test-locations';

// Web-only iframe component
const IframeWebView = ({ source, onMessage, onLoad, style }: any) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (iframeRef.current?.contentWindow === event.source) {
        console.log('[IframeWebView] Received message from iframe:', event.data);
        if (onMessage) {
          onMessage({ nativeEvent: { data: event.data } });
        }
      } else {
        // Log when we receive messages from other sources for debugging
        if (event.source && event.data) {
          console.log('[IframeWebView] Ignored message from non-iframe source');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  return (
    <iframe
      ref={iframeRef}
      src={source.uri}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        ...style
      }}
      onLoad={onLoad}
    />
  );
};

export default function AgentEditorScreen() {
  const router = useRouter();
  const {
    documentId,
    currentDoc,
    setCurrentDoc,
    locations,
    setLocations,
    geoMarkUpdate,
    setGeoMarkUpdate
  } = useDocumentNextContext();

  const webViewRef = useRef<any>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [highlightedButton, setHighlightedButton] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Build the editor URL with document ID (stable URL to avoid reload loops)
  const editorUrl = `http://localhost:5174/editor.html?doc=${encodeURIComponent(documentId)}&hideHeader=true`;

  // Handle messages from the agent editor
  const handleMessage = useCallback((event: any) => {
    try {
      const data = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;

      console.log('[AgentEditor] Received message:', data.type, data);

      switch (data.type) {
        case 'editorLog':
          // Forward logs from the WebView editor
          console.log(data.message);
          break;

        case 'openFullscreenMap':
          console.log('[AgentEditor] Opening map with locations:', data.locations);

          // Update context with locations
          if (data.locations) {
            setLocations(data.locations);
          }

          // Navigate to map
          router.push(`/document-next/${documentId}/map`);
          break;

        case 'documentChange':
          console.log('[AgentEditor] Document changed');
          if (data.doc) {
            setCurrentDoc(data.doc);
          }
          break;

        case 'locationsUpdate':
          console.log('[AgentEditor] Locations updated:', data.locations);
          if (data.locations) {
            setLocations(data.locations);
          }
          break;

        case 'ready':
          console.log('[AgentEditor] Editor ready');
          setIsEditorReady(true);
          break;

        case 'selectionUpdate':
          console.log('[AgentEditor] Selection update:', data);
          setHasTextSelection(!data.selectionEmpty);
          if (data.activeMarks) {
            // Update highlighted button based on active marks
            const marks = data.activeMarks;
            if (marks.includes('heading-2')) {
              setHighlightedButton('h2');
            } else {
              setHighlightedButton(null);
            }
          }
          break;

        case 'historyUpdate':
          console.log('[AgentEditor] History update:', data);
          setCanUndo(data.canUndo ?? false);
          setCanRedo(data.canRedo ?? false);
          break;

        case 'error':
          console.error('[AgentEditor] Editor error:', data.error);
          break;

        default:
          console.log('[AgentEditor] Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('[AgentEditor] Error handling message:', error);
    }
  }, [documentId, router, setCurrentDoc, setLocations]);

  // Send message to the WebView
  const sendMessage = useCallback((message: any) => {
    console.log('[AgentEditor.sendMessage] Called with message type:', message.type);
    console.log('[AgentEditor.sendMessage] webViewRef.current exists:', !!webViewRef.current);

    if (!webViewRef.current) {
      console.log('[AgentEditor.sendMessage] WebView not ready to send message:', message.type);
      return;
    }

    const messageString = JSON.stringify(message);
    console.log('[AgentEditor.sendMessage] Message string:', messageString);

    if (Platform.OS === 'web') {
      // For iframe, post message directly to contentWindow
      const iframe = webViewRef.current as any;
      console.log('[AgentEditor.sendMessage] Platform is web, iframe exists:', !!iframe);
      console.log('[AgentEditor.sendMessage] iframe.contentWindow exists:', !!iframe?.contentWindow);

      if (iframe?.contentWindow) {
        console.log('[AgentEditor.sendMessage] Posting message to iframe.contentWindow');
        iframe.contentWindow.postMessage(messageString, '*');
        console.log('[AgentEditor.sendMessage] Message posted successfully');
      } else {
        console.error('[AgentEditor.sendMessage] iframe.contentWindow is null! Cannot send message');
      }
    } else {
      // For React Native WebView
      console.log('[AgentEditor.sendMessage] Platform is native, using webViewRef.postMessage');
      webViewRef.current.postMessage(messageString);
      console.log('[AgentEditor.sendMessage] Message posted to native WebView');
    }
  }, []);

  // Handle toolbar commands
  const handleCommand = useCallback((command: string, params?: any) => {
    console.log('[AgentEditor] Toolbar command:', command, params);
    sendMessage({
      type: 'command',
      command,
      params
    });
  }, [sendMessage]);

  // Handle geo-mark updates from other routes (like geo-edit)
  useEffect(() => {
    console.log('[AgentEditor] useEffect triggered. geoMarkUpdate:', geoMarkUpdate);

    if (geoMarkUpdate) {
      console.log('[AgentEditor] ========== Processing geo-mark update ==========');
      console.log('[AgentEditor] geoMarkUpdate.geoId:', geoMarkUpdate.geoId);
      console.log('[AgentEditor] geoMarkUpdate.updatedAttrs:', geoMarkUpdate.updatedAttrs);
      console.log('[AgentEditor] Sending geo-mark update to editor');

      sendMessage({
        type: 'updateGeoMark',
        params: {
          geoId: geoMarkUpdate.geoId,
          updatedAttrs: geoMarkUpdate.updatedAttrs,
        }
      });

      console.log('[AgentEditor] Message sent, clearing geoMarkUpdate state');
      // Clear the update after sending
      setGeoMarkUpdate(null);
      console.log('[AgentEditor] geoMarkUpdate cleared');
    } else {
      console.log('[AgentEditor] No geoMarkUpdate to process (is null)');
    }
  }, [geoMarkUpdate, sendMessage, setGeoMarkUpdate]);

  // Initialize test locations for test-doc
  useEffect(() => {
    if (documentId === 'test-doc' && locations.length === 0) {
      console.log('[AgentEditor] Initializing test locations for test-doc');
      setLocations(testLocations);

      // Also set a test document if needed
      if (!currentDoc) {
        const testDoc = generateTestDocument();
        setCurrentDoc(testDoc);
      }
    }
  }, [documentId, locations.length, currentDoc, setLocations, setCurrentDoc]);

  // Update locations when document changes
  useEffect(() => {
    if (currentDoc) {
      // Extract locations from document if needed
      // The agent editor might handle this internally
      console.log('[AgentEditor] Document updated in context');
    }
  }, [currentDoc]);

  const WebViewComponent = Platform.OS === 'web' ? IframeWebView : WebView;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>

        <Text style={styles.title}>Document {documentId}</Text>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push(`/document-next/${documentId}/map`)}
          >
            <Ionicons name="map-outline" size={24} color="#007AFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push(`/document-next/${documentId}/options`)}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ProseMirror Toolbar */}
      <ProseMirrorToolbar
        editable={true}
        selectionEmpty={!hasTextSelection}
        highlightedButton={highlightedButton}
        canUndo={canUndo}
        canRedo={canRedo}
        onCommand={handleCommand}
      />

      {/* Agent Editor WebView */}
      <View style={styles.editorContainer}>
        {!isEditorReady && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading document...</Text>
          </View>
        )}
        <WebViewComponent
          ref={webViewRef}
          source={{ uri: editorUrl }}
          style={styles.webView}
          onMessage={handleMessage}
          onLoad={() => {
            console.log('[AgentEditor] WebView loaded');
          }}
          onError={(event: any) => {
            console.error('[AgentEditor] WebView error:', event.nativeEvent);
          }}
          // React Native WebView specific props
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          scrollEnabled={true}
          // Allow mixed content for local development
          mixedContentMode="always"
          // iOS specific
          allowsInlineMediaPlayback={true}
          // Android specific
          androidHardwareAccelerationDisabled={false}
        />
      </View>

      {/* Chrome-style Tab Bar */}
      <ChromeTabBar />
    </SafeAreaView>
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginLeft: 8,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  editorContainer: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    zIndex: 1,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});