import React from 'react';
import { View, StyleSheet } from 'react-native';
import DocumentMapDOM from './dom/DocumentMapDOM';

interface DocumentMapWrapperProps {
  locations: Array<{
    latitude: number;
    longitude: number;
    placeName: string;
    address?: string;
  }>;
  height?: number;
}

export function DocumentMapWrapper({ locations, height = 400 }: DocumentMapWrapperProps) {
  return (
    <View style={[styles.container, { height }]}>
      <DocumentMapDOM
        locations={locations}
        height={height}
        dom={{
          style: {
            width: '100%',
            height: '100%',
          },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});