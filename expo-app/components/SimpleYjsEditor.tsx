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
    return (
      <View style={styles.container}>
        <iframe
          ref={iframeRef as any}
          src={htmlAsset.uri || '/assets/yjs-simple-editor.html'}
          style={{
            flex: 1,
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          onLoad={() => {
            console.log('[SimpleYjsEditor] iframe loaded');
          }}
          onError={(error) => {
            console.error('[SimpleYjsEditor] iframe error:', error);
          }}
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
