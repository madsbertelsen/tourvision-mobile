import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { DomComponent } from '@expo/dom-webview';

interface ItineraryViewerWrapperProps {
  content: string;
  isStreaming?: boolean;
  onLocationClick?: (location: string, lat: string, lng: string) => void;
}

export function ItineraryViewerWrapper({
  content,
  isStreaming = false,
  onLocationClick,
}: ItineraryViewerWrapperProps) {
  // Only render on web platform for now
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          Itinerary viewer is currently only available on web platform
        </Text>
      </View>
    );
  }

  // Memoize props to avoid unnecessary re-renders
  const domProps = useMemo(
    () => ({
      htmlContent: content,
      isStreaming,
      onLocationClick,
    }),
    [content, isStreaming, onLocationClick]
  );

  return (
    <View style={styles.container}>
      <DomComponent
        source={require('./dom/itinerary-viewer-dom')}
        props={domProps}
        style={styles.domComponent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 300,
    maxHeight: 500,
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  domComponent: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  fallback: {
    padding: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    marginVertical: 8,
  },
  fallbackText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
});