import React from 'react';
import { View, StyleSheet } from 'react-native';

const DeckGLMapDOM = React.lazy(() => import('./dom/deckgl-map'));

export function DeckGLMapWrapper() {
  return (
    <View style={styles.container}>
      <React.Suspense fallback={<View style={styles.fallback} />}>
        <DeckGLMapDOM />
      </React.Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
});
