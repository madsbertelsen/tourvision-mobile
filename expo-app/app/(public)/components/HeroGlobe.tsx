import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
// @ts-ignore - react-map-gl has module resolution issues with Metro
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

// Only render on web
if (Platform.OS !== 'web') {
  throw new Error('HeroGlobe is only supported on web platform');
}

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1,
  pitch: 0,
  bearing: 0
};

export default function HeroGlobe() {
  const mapRef = useRef<any>(null);

  // Auto-rotation animation - rotate like a real globe spinning on its axis
  useEffect(() => {
    let animationFrameId: number;
    let currentLongitude = 0;

    const animate = () => {
      if (!mapRef.current) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const rotationSpeed = 5; // degrees per second
      currentLongitude += rotationSpeed / 60; // 60fps

      // Wrap longitude between -180 and 180
      if (currentLongitude > 180) {
        currentLongitude -= 360;
      }

      mapRef.current.setCenter([currentLongitude, 20]);
      animationFrameId = requestAnimationFrame(animate);
    };

    // Wait for map to load before starting animation
    const interval = setInterval(() => {
      if (mapRef.current) {
        clearInterval(interval);
        animationFrameId = requestAnimationFrame(animate);
      }
    }, 100);

    return () => {
      clearInterval(interval);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // Remove labels and borders after map loads
  useEffect(() => {
    const interval = setInterval(() => {
      if (mapRef.current) {
        const map = mapRef.current.getMap();
        if (map && map.isStyleLoaded()) {
          clearInterval(interval);

          // Remove all label layers and border layers
          const layers = map.getStyle().layers;
          layers.forEach((layer: any) => {
            // Remove text labels
            if (layer.type === 'symbol') {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
            }
            // Remove borders/boundaries (line layers with admin or boundary in the name)
            if (layer.type === 'line' && (
              layer.id.includes('admin') ||
              layer.id.includes('boundary') ||
              layer.id.includes('border')
            )) {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
            }
          });
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
        initialViewState={INITIAL_VIEW_STATE}
        dragPan={false}
        dragRotate={false}
        scrollZoom={false}
        doubleClickZoom={false}
        touchZoomRotate={false}
        keyboard={false}
        attributionControl={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
});
