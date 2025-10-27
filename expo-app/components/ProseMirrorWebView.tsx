import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { PROSE_STYLES, toCSS } from '@/styles/prose-styles';
// v14 - Added animated text selection (backwards character-by-character)

// Web-only iframe component
const IframeWebView = forwardRef<any, any>(({ source, onMessage, onLoadEnd, onLoadStart, style }: any, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useImperativeHandle(ref, () => ({
    injectJavaScript: (script: string) => {
      if (iframeRef.current?.contentWindow) {
        try {
          // With sandboxed iframe, we can't use eval() directly
          // Send the script via postMessage for the iframe to execute
          const cleanScript = script.replace(/\s*true;\s*$/, '');
          iframeRef.current.contentWindow.postMessage({
            type: 'evalScript',
            script: cleanScript
          }, '*');
        } catch (error) {
          console.error('[IframeWebView] Error injecting JS:', error);
        }
      }
    },
    postMessage: (message: string) => {
      if (iframeRef.current?.contentWindow) {
        // Parse the message if it's a string, then send it
        const messageData = typeof message === 'string' ? message : JSON.stringify(message);
        iframeRef.current.contentWindow.postMessage(messageData, '*');
      }
    },
    getContentWindow: () => {
      return iframeRef.current?.contentWindow;
    }
  }));

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only process messages from our iframe
      if (event.source === iframeRef.current?.contentWindow) {
        // Ensure data is in the right format
        const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
        // Verbose logging removed - messages are frequent
        onMessage?.({ nativeEvent: { data } });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe) {
      const handleLoad = () => {
        console.log('[IframeWebView] Iframe loaded');
        onLoadEnd?.();
      };
      const handleLoadStart = () => {
        console.log('[IframeWebView] Iframe loading...');
        onLoadStart?.();
      };

      iframe.addEventListener('load', handleLoad);
      // Note: loadstart doesn't exist on iframe, using load instead
      handleLoadStart();

      return () => {
        iframe.removeEventListener('load', handleLoad);
      };
    }
  }, [onLoadEnd, onLoadStart]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={source.html}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        backgroundColor: '#ffffff',
      }}
      sandbox="allow-scripts"
    />
  );
});

IframeWebView.displayName = 'IframeWebView';

export interface ProseMirrorWebViewRef {
  sendCommand: (command: string, params?: any) => void;
  scrollToNode: (nodeId: string) => void;
  scrollToBottom: () => void;
  focusEditor: () => void;
  typeCharacter: (char: string) => void;
  insertParagraph: () => void;
  getState: () => void;
  createGeoMarkWithData: (geoMarkData: any) => void;
  triggerCreateLocation: () => void;
  startCollaboration: (serverUrl: string, documentId: string, userId: string, userName: string, token?: string, yjsState?: string) => void;
  stopCollaboration: () => void;
  applySteps: (steps: any[], version: number, clientID: string) => void;
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
  onReady?: () => void;
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
      onReady,
    },
    ref
  ) => {
    const webViewRef = useRef<WebView>(null);
    const [isReady, setIsReady] = useState(false);
    // Force Metro reload after bundle rebuild - v5 (reduced logging)
    const lastProcessedGeoMarkRef = useRef<string | null>(null);
    const lastContentHashRef = useRef<string | null>(null);
    const isInternalChangeRef = useRef(false);

    // Y.js collaboration state

    // Internal send message that doesn't check isReady (for use in ready handler)
    const sendMessageInternal = useCallback((message: any) => {
      if (!webViewRef.current) {
        console.warn('[ProseMirrorWebView] WebView ref not available');
        return;
      }

      const jsonMessage = JSON.stringify(message);
      // Verbose logging removed for frequent messages

      if (Platform.OS === 'web') {
        // On web, use postMessage (handled by IframeWebView)
        webViewRef.current.postMessage(jsonMessage);
      } else if (Platform.OS === 'ios') {
        webViewRef.current.injectJavaScript(`
          window.postMessage(${jsonMessage}, '*');
          true;
        `);
      } else {
        webViewRef.current.postMessage(jsonMessage);
      }
    }, []);

    // Public send message that checks isReady
    const sendMessage = useCallback((message: any) => {
      if (!isReady) {
        console.warn('[ProseMirrorWebView] WebView not ready yet');
        return;
      }
      sendMessageInternal(message);
    }, [isReady, sendMessageInternal]);

    // Handle messages from WebView
    const handleMessage = useCallback(
      (event: any) => {
        // Verbose logging removed - RAW messages are very large and frequent
        try {
          const data =
            typeof event.nativeEvent.data === 'string'
              ? JSON.parse(event.nativeEvent.data)
              : event.nativeEvent.data;

          // Verbose logging removed for frequent events
          // console.log('[ProseMirrorWebView] Parsed message type:', data.type);

          switch (data.type) {
            case 'ready':
              console.log('[ProseMirrorWebView] WebView is ready');

              // Reset hash to force content update
              lastContentHashRef.current = null;
              setIsReady(true);

              // Notify parent that WebView is ready
              if (onReady) {
                onReady();
              }

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

              // Send initial content once ready (use internal to avoid isReady check)
              if (content) {
                console.log('[ProseMirrorWebView] Sending initial content on ready');
                // Update the hash to prevent duplicate sends from useEffect
                lastContentHashRef.current = JSON.stringify(content);
                sendMessageInternal({ type: 'setContent', content });
              }
              // Send initial editable state
              sendMessageInternal({ type: 'setEditable', editable });
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

            case 'debug':
              console.log('[ProseMirrorWebView]', data.message);
              break;

            case 'info':
              console.log('[ProseMirrorWebView]', data.message);
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
              // Verbose logging removed - happens frequently during collaboration
              if (onChange) {
                // Save to AsyncStorage via onChange callback
                isInternalChangeRef.current = true;
                const docHash = JSON.stringify(data.state);
                lastContentHashRef.current = docHash;
                onChange(data.state);
                setTimeout(() => {
                  isInternalChangeRef.current = false;
                }, 100);
              }
              break;

            case 'saveYjsState':
              console.log('[ProseMirrorWebView] Save Y.js state request received');
              // Forward to global handler to save to AsyncStorage
              if ((global as any).handleSaveYjsState) {
                (global as any).handleSaveYjsState(data.state);
              }
              break;

            // Collaboration message handlers
            case 'collaborationStarted':
            case 'collaborationStopped':
            case 'collaborationStatus':
            case 'collaborationUsers':
              console.log('[ProseMirrorWebView] Collaboration message:', data.type);
              // Forward to global handler if it exists
              if ((global as any).handleCollaborationMessage) {
                (global as any).handleCollaborationMessage(data);
              }
              break;

            // Y.js message handlers
            default:
              console.warn('[ProseMirrorWebView] Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('[ProseMirrorWebView] Error handling message:', error);
        }
      },
      [onChange, onSelectionChange, onToolbarStateChange, onShowGeoMarkEditor, onGeoMarkNavigate, onShowCommentEditor, onCommentClick, content, editable, sendMessageInternal]
    );

    // Update content when it changes externally
    useEffect(() => {
      if (!isReady) {
        console.log('[ProseMirrorWebView] WebView not ready, skipping content update');
        return;
      }

      if (!content) {
        console.log('[ProseMirrorWebView] No content to send');
        return;
      }

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

    // Reset internal state when component unmounts
    useEffect(() => {
      return () => {
        // Cleanup on unmount
        console.log('[ProseMirrorWebView] Component unmounting - resetting refs');

        setIsReady(false);
        isInternalChangeRef.current = false;
        lastContentHashRef.current = null;
        lastProcessedGeoMarkRef.current = null;
      };
    }, []);

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
                // Use instant scroll since we're already throttling on React side
                window.scrollTo(0, document.body.scrollHeight);

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
        focusEditor: () => {
          console.log('[ProseMirrorWebView] Calling focusEditor');
          sendMessage({ type: 'command', command: 'focusEditor' });
        },
        typeCharacter: (char: string) => {
          console.log('[ProseMirrorWebView] Calling typeCharacter:', char);
          sendMessage({ type: 'command', command: 'insertText', params: { text: char } });
        },
        insertParagraph: () => {
          console.log('[ProseMirrorWebView] Calling insertParagraph');
          sendMessage({ type: 'command', command: 'insertParagraph' });
        },
        getState: () => {
          // Verbose logging removed - state requests are frequent
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
        startCollaboration: async (serverUrl: string, documentId: string, userId: string, userName: string, token?: string, yjsState?: string) => {
          console.log('[ProseMirrorWebView] Starting collaboration:', { serverUrl, documentId, userId, userName, hasToken: !!token, hasYjsState: !!yjsState });

          try {
            // Tell WebView to initialize Y.js with Tiptap Cloud connection
            sendMessage({
              type: 'startCollaboration',
              serverUrl, // Pass the Tiptap Cloud URL
              documentId,
              userId,
              userName,
              token: token || null,
              yjsState: yjsState || null
            });

            console.log('[ProseMirrorWebView] Collaboration request sent to WebView');
          } catch (error) {
            console.error('[ProseMirrorWebView] Failed to start collaboration:', error);
            throw error;
          }
        },
        stopCollaboration: async () => {
          console.log('[ProseMirrorWebView] Stopping Y.js collaboration');

          try {
            // Tell WebView to stop (it will handle provider cleanup)
            sendMessage({ type: 'stopCollaboration' });

            console.log('[ProseMirrorWebView] Y.js collaboration stop request sent to WebView');
          } catch (error) {
            console.error('[ProseMirrorWebView] Error stopping Y.js collaboration:', error);
          }
        },
        applySteps: (steps: any[], version: number, clientID: string) => {
          console.log('[ProseMirrorWebView] Applying steps from', clientID, '- version:', version, '- steps:', steps.length);
          sendMessage({
            type: 'applySteps',
            steps,
            version,
            clientID
          });
        },
      }),
      [sendMessage]
    );

    // Load HTML inline (works on all platforms)
    // Import HTML with inlined ProseMirror (no CDN dependencies)
    // Rebuilt bundle v7: iframe + hoisting + TDZ fix + full-height editor
    let htmlContent;

    // Try loading the esbuild-bundled ProseMirror editor
    try {
      htmlContent = require('../assets/prosemirror-editor-bundled-final.js').default;
      console.log('[ProseMirrorWebView] HTML content loaded (with bundled Hocuspocus!), length:', htmlContent?.length);
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

    // Memoize source object to prevent iframe reloads on every render
    // Add cache buster to prevent browser from caching iframe content across page reloads
    const source = useMemo(() => {
      // Add timestamp to force fresh load on each app load (not on every render)
      const cacheBuster = `<!-- Cache buster: ${Date.now()} -->`;
      return {
        html: htmlContent + cacheBuster,
        baseUrl: baseUrl
      };
    }, [htmlContent, baseUrl]);

    // Use platform-specific component
    const WebViewComponent = Platform.OS === 'web' ? IframeWebView : WebView;

    return (
      <View style={styles.container}>
        <WebViewComponent
          ref={webViewRef}
          source={source}
          originWhitelist={['*']}
          onMessage={handleMessage}
          style={styles.webview}
          scrollEnabled={true}
          // iOS-specific props (ignored on web)
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          allowsBackForwardNavigationGestures={false}
          // Android-specific props (ignored on web)
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
