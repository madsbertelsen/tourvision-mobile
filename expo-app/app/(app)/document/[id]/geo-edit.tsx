import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTripContext } from './_layout';
import TransportConfigView from '@/components/TransportConfigView';

type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

export default function GeoEdit() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { locations } = useTripContext();

  // Extract query parameters
  const geoId = params.geoId as string;
  const placeName = params.placeName as string;
  const lat = parseFloat(params.lat as string);
  const lng = parseFloat(params.lng as string);

  const [selectedMode, setSelectedMode] = useState<TransportMode>('walking');
  const [routeGeometry, setRouteGeometry] = useState<any>(null);

  const handleBack = () => {
    router.back();
  };

  const handleClose = () => {
    router.back();
  };

  const handleSelectMode = (mode: TransportMode) => {
    setSelectedMode(mode);
  };

  const handleRouteChange = (route: {
    origin: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number };
    geometry?: any;
  } | null) => {
    if (route?.geometry) {
      setRouteGeometry(route.geometry);
    }
  };

  const handleSave = () => {
    // TODO: Send update command to ProseMirror editor to update the geo-mark's transport config
    // For now, just close the modal
    router.back();
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        onPress={handleClose}
        activeOpacity={1}
      />

      <View style={styles.container}>
        <TransportConfigView
          locationName={placeName}
          locationLat={lat}
          locationLng={lng}
          originLocation={null} // TODO: Extract from existing geo-mark attrs
          allOrigins={locations}
          selectedMode={selectedMode}
          onSelectMode={handleSelectMode}
          onAddToDocument={handleSave}
          onBack={handleBack}
          onRouteChange={handleRouteChange}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 32,
    paddingBottom: 48,
    maxHeight: '80%',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  infoContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    color: '#111827',
  },
  text: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
