import React from 'react';
import { View, StyleSheet, SafeAreaView, Text } from 'react-native';
import { MapViewSimpleWrapper } from '@/components/MapViewSimpleWrapper';

export default function TestMapCleanScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Clean Map Test</Text>
        <Text style={styles.headerSubtitle}>No animations, just a simple map</Text>
      </View>

      <View style={styles.mapContainer}>
        <MapViewSimpleWrapper
          locations={[]}
          height="100%"
          center={{ lat: 0, lng: 0 }}
          zoom={2}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
});