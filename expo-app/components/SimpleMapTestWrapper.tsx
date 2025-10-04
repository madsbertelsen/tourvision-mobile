import React from 'react';
import { View, StyleSheet } from 'react-native';

const SimpleMapTestDOM = React.lazy(() => import('./dom/simple-map-test'));

export function SimpleMapTestWrapper() {
  return (
    <View style={styles.container}>
      <React.Suspense fallback={<View style={styles.fallback} />}>
        <SimpleMapTestDOM />
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
    backgroundColor: '#f3f4f6',
  },
});
