import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useMapContext } from '@/app/(app)/document-next/[id]/map/_layout';

export default function MapDebugOverlay() {
  const { locations, routes, cameraRef } = useMapContext();
  const [cameraState, setCameraState] = useState<any>({});
  const [mapLoadTime, setMapLoadTime] = useState<number>(0);

  useEffect(() => {
    const startTime = Date.now();

    // Monitor camera state
    const interval = setInterval(() => {
      if (cameraRef.current) {
        // Get current camera state if available
        // Note: This is a simplified version, actual implementation may vary
        const loadTime = Date.now() - startTime;
        setMapLoadTime(loadTime);

        if (loadTime < 1000) {
          // Within first second - check if animation occurred
          setCameraState({
            loadedWithoutAnimation: loadTime < 100, // Should be instant
            timeToLoad: loadTime,
          });
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [cameraRef]);

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.debugPanel}>
        <Text style={styles.title}>Map Debug Info</Text>

        <Text style={styles.label}>Locations: {locations.length}</Text>
        {locations.slice(0, 3).map(loc => (
          <Text key={loc.geoId} style={styles.subtext}>
            • {loc.displayText} ({loc.colorIndex})
          </Text>
        ))}

        <Text style={styles.label}>Routes: {routes.length}</Text>
        {routes.map(route => (
          <Text key={route.id} style={styles.subtext}>
            • {route.transportMode}: {(route.distance / 1000).toFixed(1)}km
          </Text>
        ))}

        <Text style={styles.label}>
          Camera Load: {mapLoadTime}ms
        </Text>
        <Text style={[
          styles.subtext,
          cameraState.loadedWithoutAnimation ? styles.success : styles.warning
        ]}>
          {cameraState.loadedWithoutAnimation
            ? '✓ No animation detected'
            : '⚠ Animation may have occurred'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    left: 16,
    zIndex: 1000,
  },
  debugPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 12,
    borderRadius: 8,
    minWidth: 200,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: {
    color: '#fff',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  subtext: {
    color: '#ccc',
    fontSize: 11,
    marginLeft: 8,
  },
  success: {
    color: '#4ade80',
  },
  warning: {
    color: '#fbbf24',
  },
});