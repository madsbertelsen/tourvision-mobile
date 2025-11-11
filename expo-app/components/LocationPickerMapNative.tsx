import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Mapbox from '@rnmapbox/maps';

interface LocationPickerMapNativeProps {
  lat: number;
  lng: number;
  placeName: string;
  editable?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
}

// Set Mapbox access token
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '');

export default function LocationPickerMapNative({
  lat,
  lng,
  placeName,
  editable = false,
  onLocationChange,
}: LocationPickerMapNativeProps) {
  const cameraRef = useRef<Mapbox.Camera>(null);

  useEffect(() => {
    // Center camera on location when coordinates change
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: 14,
      animationDuration: 500,
    });
  }, [lat, lng]);

  const handleMapPress = (feature: any) => {
    if (editable && onLocationChange && feature.geometry?.coordinates) {
      const [newLng, newLat] = feature.geometry.coordinates;
      onLocationChange(newLat, newLng);
    }
  };

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        onPress={handleMapPress}
      >
        <Mapbox.Camera
          ref={cameraRef}
          zoomLevel={14}
          centerCoordinate={[lng, lat]}
        />

        <Mapbox.PointAnnotation
          id="location-marker"
          coordinate={[lng, lat]}
        >
          <View style={styles.markerContainer}>
            <Ionicons name="location" size={32} color="#3B82F6" />
          </View>
        </Mapbox.PointAnnotation>
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    width: '100%',
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
