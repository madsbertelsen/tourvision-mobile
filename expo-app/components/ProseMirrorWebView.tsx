import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { PROSE_STYLES, toCSS } from '@/styles/prose-styles';

export interface ProseMirrorWebViewRef {
  sendCommand: (command: string, params?: any) => void;
  scrollToNode: (nodeId: string) => void;
  scrollToBottom: () => void;
  getState: () => void;
  createGeoMarkWithData: (geoMarkData: any) => void;
  triggerCreateLocation: () => void;
}

interface ProseMirrorWebViewProps {
  content?: any; // ProseMirror JSON document
  onNodeFocus?: (nodeId: string | null) => void;
  focusedNodeId?: string | null;
  editable?: boolean;
  onChange?: (doc: any) => void;
  onShowGeoMarkEditor?: (data: any, locations: any[]) => void;
  geoMarkDataToCreate?: any;
  onSelectionChange?: (empty: boolean) => void;
  onGeoMarkNavigate?: (geoMarkAttrs: any) => void;
  onToolbarStateChange?: (state: any) => void;
  onShowCommentEditor?: (data: { selectedText: string; from: number; to: number }) => void;
  onCommentClick?: (commentAttrs: any) => void;
}

// We'll load the HTML from the assets folder
// For now, we'll use inline HTML that will be loaded via source={{ html: ... }}

const ProseMirrorWebView = forwardRef<ProseMirrorWebViewRef, ProseMirrorWebViewProps>(
  (
    {
      content,
      onNodeFocus,
      focusedNodeId,
      editable = false,
      onChange,
      onShowGeoMarkEditor,
      geoMarkDataToCreate,
      onSelectionChange,
      onGeoMarkNavigate,
      onToolbarStateChange,
      onShowCommentEditor,
      onCommentClick,
    },
    ref
  ) => {
    const webViewRef = useRef<WebView>(null);
    const [isReady, setIsReady] = useState(false);
    const lastProcessedGeoMarkRef = useRef<string | null>(null);
    const lastContentHashRef = useRef<string | null>(null);
    const isInternalChangeRef = useRef(false);

    // Send message to WebView
    const sendMessage = useCallback((message: any) => {
      if (!webViewRef.current || !isReady) {
        console.warn('[ProseMirrorWebView] WebView not ready yet');
        return;
      }

      const jsonMessage = JSON.stringify(message);
      console.log('[ProseMirrorWebView] Sending message to WebView:', message.type);

      if (Platform.OS === 'ios') {
        webViewRef.current.injectJavaScript(`
          window.postMessage(${jsonMessage}, '*');
          true;
        `);
      } else {
        webViewRef.current.postMessage(jsonMessage);
      }
    }, [isReady]);

    // Handle messages from WebView
    const handleMessage = useCallback(
      (event: any) => {
        console.log('[ProseMirrorWebView] RAW message received:', event.nativeEvent.data);
        try {
          const data =
            typeof event.nativeEvent.data === 'string'
              ? JSON.parse(event.nativeEvent.data)
              : event.nativeEvent.data;

          console.log('[ProseMirrorWebView] Parsed message type:', data.type);

          switch (data.type) {
            case 'ready':
              console.log('[ProseMirrorWebView] WebView is ready');
              setIsReady(true);

              // Inject shared CSS styles with consistent padding
              const sharedCSS = toCSS(PROSE_STYLES);
              const cssInjection = `
                (function() {
                  // Find or create shared styles element
                  let styleEl = document.getElementById('shared-prose-styles');
                  if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'shared-prose-styles';
                    document.head.appendChild(styleEl);
                  }
                  styleEl.textContent = ${JSON.stringify(sharedCSS)} +
                    '\\n#editor-container { padding: 0 !important; }' +
                    '\\n.ProseMirror { padding: 16px !important; }';
                  console.log('[WebView] Injected shared CSS styles with 16px padding');
                })();
              `;
              webViewRef.current?.injectJavaScript(cssInjection);

              // Send initial content once ready
              if (content) {
                sendMessage({ type: 'setContent', content });
              }
              // Send initial editable state
              sendMessage({ type: 'setEditable', editable });
              break;

            case 'test':
              console.log('[ProseMirrorWebView] Test message:', data.message);
              console.log('[ProseMirrorWebView] ProseMirror loaded:', data.prosemirrorLoaded);
              console.log('[ProseMirrorWebView] window.PM type:', data.windowPM);
              break;

            case 'error':
              console.error('[ProseMirrorWebView] WebView error:', data.message);
              console.error('[ProseMirrorWebView] Error location:', data.filename, 'line', data.lineno);
              break;

            case 'documentChange':
              if (onChange) {
                // Mark this as an internal change to prevent circular updates
                isInternalChangeRef.current = true;
                const docHash = JSON.stringify(data.doc);
                lastContentHashRef.current = docHash;
                onChange(data.doc);
                // Reset flag after a short delay
                setTimeout(() => {
                  isInternalChangeRef.current = false;
                }, 100);
              }
              break;

            case 'selectionChange':
              if (onSelectionChange) {
                onSelectionChange(data.empty);
              }
              break;

            case 'toolbarStateChange':
              if (onToolbarStateChange) {
                onToolbarStateChange(data.state);
              }
              break;

            case 'showGeoMarkEditor':
              if (onShowGeoMarkEditor) {
                onShowGeoMarkEditor(data.data, data.existingLocations || []);
              }
              break;

            case 'geoMarkNavigate':
              if (onGeoMarkNavigate) {
                onGeoMarkNavigate(data.attrs);
              }
              break;

            case 'showCommentEditor':
              if (onShowCommentEditor) {
                onShowCommentEditor(data.data);
              }
              break;

            case 'commentClick':
              if (onCommentClick) {
                onCommentClick(data.attrs);
              }
              break;

            case 'stateResponse':
              console.log('[ProseMirrorWebView] State response:', data.state);
              break;

            default:
              console.warn('[ProseMirrorWebView] Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('[ProseMirrorWebView] Error handling message:', error);
        }
      },
      [onChange, onSelectionChange, onToolbarStateChange, onShowGeoMarkEditor, onGeoMarkNavigate, onShowCommentEditor, onCommentClick, content, editable, sendMessage]
    );

    // Update content when it changes externally
    useEffect(() => {
      if (!isReady || !content) return;

      // Skip if this is from our own onChange callback
      if (isInternalChangeRef.current) {
        console.log('[ProseMirrorWebView] Skipping content update (internal change)');
        return;
      }

      // Check if content actually changed
      const contentHash = JSON.stringify(content);
      if (contentHash === lastContentHashRef.current) {
        console.log('[ProseMirrorWebView] Skipping content update (unchanged)');
        return;
      }

      console.log('[ProseMirrorWebView] Sending external content update to WebView');
      lastContentHashRef.current = contentHash;
      sendMessage({ type: 'setContent', content });
    }, [content, isReady, sendMessage]);

    // Update editable state when it changes
    useEffect(() => {
      if (isReady) {
        console.log('[ProseMirrorWebView] Sending editable update to WebView:', editable);
        sendMessage({ type: 'setEditable', editable });
      }
    }, [editable, isReady, sendMessage]);

    // Handle geo-mark creation
    useEffect(() => {
      console.log('[ProseMirrorWebView] geoMarkDataToCreate changed:', geoMarkDataToCreate);

      if (!geoMarkDataToCreate || !isReady) {
        return;
      }

      // Use JSON serialization for deep equality check
      const dataKey = JSON.stringify(geoMarkDataToCreate);

      if (dataKey !== lastProcessedGeoMarkRef.current) {
        console.log('[ProseMirrorWebView] NEW geo-mark data detected, sending to WebView');
        lastProcessedGeoMarkRef.current = dataKey;
        sendMessage({ type: 'createGeoMark', geoMarkData: geoMarkDataToCreate });
      } else {
        console.log('[ProseMirrorWebView] Skipping duplicate geo-mark creation');
      }
    }, [geoMarkDataToCreate, isReady, sendMessage]);

    // Expose methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        sendCommand: (command: string, params?: any) => {
          console.log('[ProseMirrorWebView] Sending command:', command, params);
          sendMessage({ type: 'command', command, params });
        },
        scrollToNode: (nodeId: string) => {
          console.log('[ProseMirrorWebView] Scrolling to node:', nodeId);
          sendMessage({ type: 'scrollToNode', nodeId });
        },
        scrollToBottom: () => {
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
              (function() {
                console.log('[WebView] Attempting to scroll to bottom...');

                // Try multiple scroll targets to ensure we scroll the right element
                const prosemirror = document.querySelector('.ProseMirror');
                const editorContainer = document.getElementById('editor-container');

                // Log what we found
                console.log('[WebView] ProseMirror element:', prosemirror);
                console.log('[WebView] Editor container:', editorContainer);
                console.log('[WebView] Body scrollHeight:', document.body.scrollHeight);
                console.log('[WebView] Window innerHeight:', window.innerHeight);

                // Scroll window (main scroll container for WebView)
                window.scrollTo({
                  top: document.body.scrollHeight,
                  behavior: 'smooth'
                });

                // Also scroll ProseMirror if it's a scrollable container
                if (prosemirror && prosemirror.scrollHeight > prosemirror.clientHeight) {
                  prosemirror.scrollTop = prosemirror.scrollHeight;
                  console.log('[WebView] Scrolled ProseMirror to:', prosemirror.scrollTop);
                }

                // Also scroll editor container if it exists
                if (editorContainer && editorContainer.scrollHeight > editorContainer.clientHeight) {
                  editorContainer.scrollTop = editorContainer.scrollHeight;
                  console.log('[WebView] Scrolled editor-container to:', editorContainer.scrollTop);
                }

                console.log('[WebView] Scroll complete');
              })();
              true;
            `);
          }
        },
        getState: () => {
          console.log('[ProseMirrorWebView] Requesting state');
          sendMessage({ type: 'getState' });
        },
        createGeoMarkWithData: (geoMarkData: any) => {
          console.log('[ProseMirrorWebView] Creating geo-mark with data:', geoMarkData);
          sendMessage({ type: 'createGeoMark', geoMarkData });
        },
        triggerCreateLocation: () => {
          console.log('[ProseMirrorWebView] Triggering create location from iOS menu');
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
              (function() {
                if (window.createLocationFromSelection) {
                  window.createLocationFromSelection();
                } else {
                  console.warn('[WebView] createLocationFromSelection not found');
                }
              })();
              true;
            `);
          }
        },
      }),
      [sendMessage]
    );

    // Load HTML inline (works on all platforms)
    // Import HTML with inlined ProseMirror (no CDN dependencies)
    // Rebuilt bundle includes geo-mark message handler - v2
    let htmlContent;

    // Try loading the esbuild-bundled ProseMirror editor
    try {
      htmlContent = require('../assets/prosemirror-editor-bundled-final.js').default;
      console.log('[ProseMirrorWebView] HTML content loaded (with visitDocument!), length:', htmlContent?.length);
    } catch (error) {
      console.error('[ProseMirrorWebView] Failed to load esbuild bundle:', error);

      // Fallback to minimal test if bundle fails
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: -apple-system, sans-serif;
              background: #f44336;
              color: white;
            }
          </style>
        </head>
        <body>
          <h1>Error Loading Editor</h1>
          <p>Failed to load ProseMirror bundle.</p>
          <pre>${error}</pre>
        </body>
        </html>
      `;
    }

    // For iOS, we need a baseUrl to allow loading CDN scripts
    const baseUrl = Platform.select({
      ios: 'about:blank',
      android: 'file:///android_asset/',
      default: undefined
    });

    return (
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{
            html: htmlContent,
            baseUrl: baseUrl
          }}
          originWhitelist={['*']}
          onMessage={handleMessage}
          style={styles.webview}
          scrollEnabled={true}
          // iOS-specific props
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures={false}
          // Android-specific props
          domStorageEnabled={true}
          javaScriptEnabled={true}
          mixedContentMode="always"
          // Disable zoom
          scalesPageToFit={false}
          // Enable debugging
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[ProseMirrorWebView] WebView error:', nativeEvent);
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.error('[ProseMirrorWebView] HTTP error:', nativeEvent);
          }}
          onLoadStart={() => {
            console.log('[ProseMirrorWebView] WebView load started');
          }}
          onLoadEnd={() => {
            console.log('[ProseMirrorWebView] WebView load ended');
          }}
        />
      </View>
    );
  }
);

ProseMirrorWebView.displayName = 'ProseMirrorWebView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
});

export default ProseMirrorWebView;
