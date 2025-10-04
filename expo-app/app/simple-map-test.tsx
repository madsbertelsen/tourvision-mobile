import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SimpleMapTestWrapper } from '@/components/SimpleMapTestWrapper';

export default function SimpleMapTestScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Simple Map Test</Text>
      <View style={styles.mapContainer}>
        <SimpleMapTestWrapper />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 16,
    backgroundColor: '#f3f4f6',
  },
  mapContainer: {
    flex: 1,
  },
});
