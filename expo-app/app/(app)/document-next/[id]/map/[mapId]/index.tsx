import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Transparent map view - the WebView renders the actual map
 * This route exists to:
 * 1. Provide MapContext via _layout.tsx
 * 2. Allow bottom sheet routes (location/transport) to render
 * 3. WebView fullscreen map shows through this transparent view
 */
export default function MapIndexRoute() {
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
