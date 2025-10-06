import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DeckGLMapWrapper } from '@/components/DeckGLMapWrapper';

export default function TestDeckGLScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deck.GL Map Test</Text>
      <View style={styles.mapContainer}>
        <DeckGLMapWrapper />
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
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
  },
  mapContainer: {
    flex: 1,
  },
});
