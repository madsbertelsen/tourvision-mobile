import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

// Props interface - simplified compared to full ProseMirrorWebView
interface ProseMirrorWebViewSimpleProps {
  documentId: string;
  content?: any; // ProseMirror document JSON
  editable?: boolean;
  onChange?: (doc: any) => void;
  onReady?: () => void;
  onMessage?: (data: any) => void;
  style?: any;
}

// Ref interface - minimal imperative API
export interface ProseMirrorWebViewSimpleRef {
  getState: () => void;
  scrollToBottom: () => void;
  focusEditor: () => void;
  postMessage: (message: any) => void;
}

// Web-only iframe component
const IframeWebView = forwardRef<any, any>(({ source, onMessage, onLoad, style }: any, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useImperativeHandle(ref, () => ({
    postMessage: (message: string) => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(message, '*');
      }
    }
  }));

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (iframeRef.current?.contentWindow === event.source) {
        if (onMessage) {
          onMessage({ nativeEvent: { data: event.data } });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  const handleLoad = () => {
    setIsLoaded(true);
    if (onLoad) {
      onLoad();
    }
  };

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
      onLoad={handleLoad}
    />
  );
});

const ProseMirrorWebViewSimple = forwardRef<ProseMirrorWebViewSimpleRef, ProseMirrorWebViewSimpleProps>((props, ref) => {
  const {
    documentId,
    content,
    editable = true,
    onChange,
    onReady,
    onMessage: onMessageProp,
    style
  } = props;

  const webViewRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  const isInternalChangeRef = useRef(false);
  const lastContentHashRef = useRef<string>('');

  // Build the editor URL with query parameters
  const editorUrl = `http://localhost:5174/editor.html?doc=${encodeURIComponent(documentId)}&hideHeader=true`;

  // Helper to send messages to the WebView
  const sendMessage = useCallback((message: any) => {
    if (!isReady || !webViewRef.current) {
      console.log('[ProseMirrorWebViewSimple] Not ready to send message:', message.type);
      return;
    }

    const messageString = JSON.stringify(message);

    if (Platform.OS === 'web') {
      webViewRef.current.postMessage(messageString);
    } else {
      webViewRef.current.postMessage(messageString);
    }
  }, [isReady]);

  // Handle messages from the WebView
  const handleMessage = useCallback((event: any) => {
    try {
      const data = typeof event.nativeEvent.data === 'string'
        ? JSON.parse(event.nativeEvent.data)
        : event.nativeEvent.data;

      console.log('[ProseMirrorWebViewSimple] Received message:', data.type);

      switch (data.type) {
        case 'ready':
          console.log('[ProseMirrorWebViewSimple] Editor ready');
          setIsReady(true);
          if (onReady) {
            onReady();
          }
          break;

        case 'documentChange':
          if (onChange && data.doc) {
            isInternalChangeRef.current = true;
            onChange(data.doc);
            // Update hash to track this version
            lastContentHashRef.current = JSON.stringify(data.doc);
          }
          break;

        case 'stateResponse':
          if (onChange && data.doc) {
            onChange(data.doc);
          }
          break;

        case 'error':
          console.error('[ProseMirrorWebViewSimple] Editor error:', data.error);
          break;

        case 'openFullscreenMap':
          console.log('[ProseMirrorWebViewSimple] Fullscreen map requested with locations:', data.locations);
          // Pass to parent via onMessage for custom handling
          if (onMessageProp) {
            onMessageProp(data);
          }
          break;

        default:
          // Pass unknown messages to parent
          if (onMessageProp) {
            onMessageProp(data);
          }
      }
    } catch (error) {
      console.error('[ProseMirrorWebViewSimple] Error handling message:', error);
    }
  }, [onChange, onReady, onMessageProp]);

  // Expose imperative API
  useImperativeHandle(ref, () => ({
    getState: () => {
      sendMessage({ type: 'getState' });
    },
    scrollToBottom: () => {
      sendMessage({ type: 'scrollToBottom' });
    },
    focusEditor: () => {
      sendMessage({ type: 'focusEditor' });
    },
    postMessage: (message: any) => {
      sendMessage(message);
    }
  }), [sendMessage]);

  // Send initial content when ready
  useEffect(() => {
    if (isReady && content) {
      // Only send if content has changed (avoid circular updates)
      const contentHash = JSON.stringify(content);
      if (contentHash !== lastContentHashRef.current) {
        if (!isInternalChangeRef.current) {
          console.log('[ProseMirrorWebViewSimple] Sending initial/updated content');
          sendMessage({ type: 'setContent', content });
          lastContentHashRef.current = contentHash;
        } else {
          // Reset internal change flag
          isInternalChangeRef.current = false;
        }
      }
    }
  }, [isReady, content, sendMessage]);

  // Send editable state when ready or when it changes
  useEffect(() => {
    if (isReady) {
      console.log('[ProseMirrorWebViewSimple] Setting editable:', editable);
      sendMessage({ type: 'setEditable', editable });
    }
  }, [isReady, editable, sendMessage]);

  const WebViewComponent = Platform.OS === 'web' ? IframeWebView : WebView;

  return (
    <View style={[styles.container, style]}>
      <WebViewComponent
        ref={webViewRef}
        source={{ uri: editorUrl }}
        onMessage={handleMessage}
        onLoad={() => {
          console.log('[ProseMirrorWebViewSimple] WebView loaded');
        }}
        onError={(event: any) => {
          console.error('[ProseMirrorWebViewSimple] WebView error:', event.nativeEvent);
        }}
        style={styles.webView}
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
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default ProseMirrorWebViewSimple;