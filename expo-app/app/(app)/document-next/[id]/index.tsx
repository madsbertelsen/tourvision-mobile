import { ChromeTabBar } from '@/components/ChromeTabBar';
import { ProseMirrorToolbar } from '@/components/ProseMirrorToolbar';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useDocumentNextWebRTCContext } from './_layout';

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

export default function DocumentNextWebRTCScreen() {
  const router = useRouter();
  const {
    documentId,
    setCurrentDoc,
    setLocations,
    geoMarkUpdate,
    setGeoMarkUpdate
  } = useDocumentNextWebRTCContext();

  const webViewRef = useRef<any>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [highlightedButton] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Build the WebRTC editor URL with document ID
  // Use Mac's local IP address instead of localhost for React Native
  // Port 5173 is the webrtc-agent-poc Vite server (with --host flag for network access)
  const editorUrl = `http://192.168.1.223:5173/?doc=${encodeURIComponent(documentId)}&hideHeader=true`;

  // Handle messages from the WebRTC editor
  const handleMessage = useCallback((event: any) => {
    try {
      const data = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;

      console.log('[DocumentNextWebRTC] Received message:', data.type, data);

      switch (data.type) {
        case 'editorLog':
          // Forward logs from the WebView editor
          console.log(`[WebRTC Editor] ${data.message}`);
          break;

        case 'ready':
          console.log('[DocumentNextWebRTC] WebRTC editor is ready');
          setIsEditorReady(true);
          break;

        case 'openFullscreenMap':
          console.log('[DocumentNextWebRTC] Opening map with locations:', data.locations);

          // Update context with locations
          if (data.locations) {
            setLocations(data.locations);
          }

          // Navigate to map
          router.push(`/document-next/${documentId}/map`);
          break;

        case 'documentChange':
          console.log('[DocumentNextWebRTC] Document changed');
          if (data.doc) {
            setCurrentDoc(data.doc);
          }
          break;

        case 'selectionChange':
          setHasTextSelection(data.hasSelection || false);
          break;

        case 'undoRedoState':
          setCanUndo(data.canUndo || false);
          setCanRedo(data.canRedo || false);
          break;

        case 'geoMarkCreated':
          console.log('[DocumentNextWebRTC] Geo-mark created:', data.geoMark);
          break;

        case 'fullscreenMapOpened':
          console.log('[DocumentNextWebRTC] Fullscreen map opened');
          // Optional: Hide toolbar or adjust UI during fullscreen
          break;

        case 'fullscreenMapClosed':
          console.log('[DocumentNextWebRTC] Fullscreen map closed');
          // Optional: Show toolbar again
          break;

        case 'openLocationDetails':
          console.log('[DocumentNextWebRTC] Opening location details:', data.location);
          console.log('[DocumentNextWebRTC] All locations from WebView:', data.allLocations);

          // Update locations context with ALL locations from document
          if (data.allLocations && Array.isArray(data.allLocations)) {
            console.log('[DocumentNextWebRTC] Setting all locations:', data.allLocations.length);
            setLocations(data.allLocations);
          } else {
            // Fallback: just add the clicked location
            console.log('[DocumentNextWebRTC] No allLocations field, adding single location');
            if (data.location) {
              setLocations((prev) => {
                const existing = prev.find((loc: any) => loc.geoId === data.location.geoId);
                if (existing) return prev;
                return [...prev, data.location];
              });
            }
          }

          // Navigate to map location detail route (shows bottom sheet)
          router.replace(`/document-next/${documentId}/map/main/location/${data.location.geoId}`);
          break;

        default:
          console.log('[DocumentNextWebRTC] Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('[DocumentNextWebRTC] Error handling message:', error);
    }
  }, [documentId, router, setCurrentDoc, setLocations]);

  // Send message to WebView
  const sendMessage = useCallback((message: any) => {
    if (!isEditorReady) {
      console.warn('[DocumentNextWebRTC] Cannot send message - editor not ready');
      return;
    }

    try {
      const messageString = typeof message === 'string' ? message : JSON.stringify(message);
      console.log('[DocumentNextWebRTC] Sending message to editor:', message);

      if (Platform.OS === 'web' && webViewRef.current instanceof HTMLIFrameElement) {
        webViewRef.current.contentWindow?.postMessage(messageString, '*');
      } else if (webViewRef.current?.postMessage) {
        webViewRef.current.postMessage(messageString);
      }
    } catch (error) {
      console.error('[DocumentNextWebRTC] Error sending message:', error);
    }
  }, [isEditorReady]);

  // Handle geo-mark update from context (triggered by geo-edit modal)
  useEffect(() => {
    if (geoMarkUpdate && isEditorReady) {
      console.log('[DocumentNextWebRTC] Sending geo-mark update to editor:', geoMarkUpdate);
      sendMessage({
        type: 'updateGeoMark',
        ...geoMarkUpdate
      });
      // Clear the update after sending
      setGeoMarkUpdate(null);
    }
  }, [geoMarkUpdate, isEditorReady, sendMessage, setGeoMarkUpdate]);

  // Unified command handler for toolbar
  const handleCommand = useCallback((command: string, params?: any) => {
    console.log('[DocumentNextWebRTC] Toolbar command:', command, params);
    sendMessage({ type: command, ...params });
  }, [sendMessage]);

  const WebViewComponent = Platform.OS === 'web' ? IframeWebView : WebView;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ProseMirrorToolbar
        editable={isEditorReady}
        selectionEmpty={!hasTextSelection}
        canUndo={canUndo}
        canRedo={canRedo}
        highlightedButton={highlightedButton}
        onCommand={handleCommand}
      />

      <View style={styles.editorContainer}>
        {!isEditorReady && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        )}
        <WebViewComponent
          ref={webViewRef}
          source={{ uri: editorUrl }}
          style={styles.webview}
          onMessage={handleMessage}
          onError={(syntheticEvent: any) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[DocumentNextWebRTC] WebView error:', nativeEvent);
          }}
          onLoad={() => {
            console.log('[DocumentNextWebRTC] WebView loaded');
          }}
          // Native WebView props
          {...(Platform.OS !== 'web' && {
            javaScriptEnabled: true,
            domStorageEnabled: true,
            startInLoadingState: false,
          })}
        />
      </View>

      <ChromeTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  editorContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
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
    zIndex: 1000,
  },
});
