/**
 * SimpleYjsEditor - Minimal Y.js + ProseMirror WebView component
 *
 * This is a simplified version hardcoded to sync with document ID:
 * 1b6d8dd9-e031-42b6-b554-5eb194c01526
 *
 * Purpose: Test basic Y.js collaboration without complex editor features
 */

import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';

export default function SimpleYjsEditor() {
  const webViewRef = useRef<WebView>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load the simple editor HTML
  const htmlAsset = Asset.fromModule(require('@/assets/yjs-simple-editor.html'));

  // On web, set up iframe message listener
  useEffect(() => {
    if (Platform.OS === 'web' && iframeRef.current) {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SimpleYjsEditor] Message from iframe:', data);
        } catch (e) {
          console.log('[SimpleYjsEditor] iframe message:', event.data);
        }
      };

      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, []);

  // On web, use iframe instead of WebView
  if (Platform.OS === 'web') {
    // Use blob URL to avoid CORS issues
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simple Y.js ProseMirror Editor</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #editor {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      min-height: 400px;
      outline: none;
    }

    #status {
      padding: 8px;
      margin-bottom: 16px;
      border-radius: 4px;
      font-size: 14px;
    }

    #status.connected {
      background: #10B981;
      color: white;
    }

    #status.disconnected {
      background: #EF4444;
      color: white;
    }

    .ProseMirror {
      outline: none;
    }

    .ProseMirror p {
      margin: 1em 0;
    }

    .ProseMirror-yjs-cursor {
      position: relative;
      margin-left: -1px;
      margin-right: -1px;
      border-left: 2px solid;
      border-right: 2px solid;
      word-break: normal;
      pointer-events: none;
      height: 1.2em;
      display: inline-block;
    }

    .ProseMirror-yjs-cursor > div {
      position: absolute;
      top: -1.4em;
      left: -1px;
      font-size: 11px;
      color: white;
      padding: 2px 6px;
      border-radius: 3px;
      white-space: nowrap;
      font-weight: 500;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  </style>
</head>
<body>
  <div id="status" class="disconnected">Disconnected</div>
  <div id="editor"></div>

  <script type="importmap">
    {
      "imports": {
        "yjs": "https://cdn.jsdelivr.net/npm/yjs@13/+esm",
        "y-websocket": "https://cdn.jsdelivr.net/npm/y-websocket@2/+esm",
        "y-prosemirror": "https://cdn.jsdelivr.net/npm/y-prosemirror@1/+esm",
        "prosemirror-model": "https://cdn.jsdelivr.net/npm/prosemirror-model@1/+esm",
        "prosemirror-state": "https://cdn.jsdelivr.net/npm/prosemirror-state@1/+esm",
        "prosemirror-view": "https://cdn.jsdelivr.net/npm/prosemirror-view@1/+esm",
        "prosemirror-schema-basic": "https://cdn.jsdelivr.net/npm/prosemirror-schema-basic@1/+esm",
        "prosemirror-keymap": "https://cdn.jsdelivr.net/npm/prosemirror-keymap@1/+esm",
        "prosemirror-commands": "https://cdn.jsdelivr.net/npm/prosemirror-commands@1/+esm",
        "prosemirror-history": "https://cdn.jsdelivr.net/npm/prosemirror-history@1/+esm"
      }
    }
  </script>

  <script type="module">
    import * as Y from 'yjs';
    import { WebsocketProvider } from 'y-websocket';
    import { EditorState } from 'prosemirror-state';
    import { EditorView } from 'prosemirror-view';
    import { schema } from 'prosemirror-schema-basic';
    import { keymap } from 'prosemirror-keymap';
    import { baseKeymap } from 'prosemirror-commands';
    import { history, undo as pmUndo, redo as pmRedo } from 'prosemirror-history';
    import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror';

    console.log('[Editor] Starting simple Y.js ProseMirror editor');

    const DOCUMENT_ID = '1b6d8dd9-e031-42b6-b554-5eb194c01526';
    const WS_URL = 'wss://tourvision-collab.mads-9b9.workers.dev';
    const ROOM_NAME = 'yjs-room';

    try {
      const ydoc = new Y.Doc();
      const type = ydoc.getXmlFragment('prosemirror');

      const wsUrl = \`\${WS_URL}/parties/\${ROOM_NAME}/\${DOCUMENT_ID}\`;
      console.log('[Editor] Connecting to:', wsUrl);

      // Create provider first - it creates its own awareness
      const provider = new WebsocketProvider(wsUrl, DOCUMENT_ID, ydoc, {
        connect: true
      });

      // Wait for initial sync, then clear document if it has incompatible content
      provider.on('synced', ({ synced }) => {
        if (synced) {
          console.log('[Editor] Initial sync complete');
          // Check if document has content
          if (type.length > 0) {
            console.log('[Editor] Document has existing content, clearing for fresh start...');
            ydoc.transact(() => {
              type.delete(0, type.length);
            });
            console.log('[Editor] Document cleared');
          }
        }
      });

      // Get awareness from provider
      const awareness = provider.awareness;
      awareness.setLocalStateField('user', {
        id: 'test-user',
        name: 'Test User',
        color: '#3B82F6'
      });

      const statusEl = document.getElementById('status');

      provider.on('status', ({ status }) => {
        console.log('[Editor] Status:', status);
        if (status === 'connected') {
          statusEl.textContent = 'Connected to Y.js server';
          statusEl.className = 'connected';
        } else {
          statusEl.textContent = 'Disconnected';
          statusEl.className = 'disconnected';
        }
      });

      provider.on('sync', (synced) => {
        console.log('[Editor] Synced:', synced);
      });

      const editorContainer = document.getElementById('editor');

      const state = EditorState.create({
        schema: schema,
        plugins: [
          ySyncPlugin(type),
          yCursorPlugin(awareness),
          yUndoPlugin(),
          keymap({
            'Mod-z': undo,
            'Mod-y': redo,
            'Mod-Shift-z': redo
          }),
          keymap(baseKeymap),
          history()
        ]
      });

      const view = new EditorView(editorContainer, {
        state
      });

      console.log('[Editor] ProseMirror editor created');
      console.log('[Editor] Document ID:', DOCUMENT_ID);
      console.log('[Editor] Ready for collaboration');

      awareness.on('change', ({ added, updated, removed }) => {
        console.log('[Editor] Awareness changed:', {
          added,
          updated,
          removed,
          states: Array.from(awareness.getStates().entries())
        });
      });

      window.addEventListener('beforeunload', () => {
        provider.destroy();
        view.destroy();
      });
    } catch (error) {
      console.error('[Editor] Error:', error);
      document.getElementById('status').textContent = 'Error: ' + error.message;
    }
  </script>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef as any}
          src={blobUrl}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          onLoad={() => {
            console.log('[SimpleYjsEditor] iframe loaded');
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      </View>
    );
  }

  // On native, use WebView
  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: htmlAsset.localUri || htmlAsset.uri }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log('[SimpleYjsEditor] Message from WebView:', data);
          } catch (e) {
            console.log('[SimpleYjsEditor] WebView message:', event.nativeEvent.data);
          }
        }}
        onError={(error) => {
          console.error('[SimpleYjsEditor] WebView error:', error);
        }}
        onLoadStart={() => {
          console.log('[SimpleYjsEditor] WebView loading...');
        }}
        onLoadEnd={() => {
          console.log('[SimpleYjsEditor] WebView loaded');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
});
