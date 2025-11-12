/**
 * SimpleYjsEditor - Minimal Y.js + ProseMirror WebView component
 *
 * This is a simplified version hardcoded to sync with document ID:
 * 1b6d8dd9-e031-42b6-b554-5eb194c01526
 *
 * Purpose: Test basic Y.js collaboration without complex editor features
 */

import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';

export default function SimpleYjsEditor() {
  const webViewRef = useRef<WebView>(null);

  // Load the simple editor HTML
  const htmlAsset = Asset.fromModule(require('@/assets/yjs-simple-editor.html'));

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
