import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTripContext } from '../../_layout';
import TransportConfigView from '@/components/TransportConfigView';

type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

export default function TransportConfigRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { id: tripId, geoId } = params as { id: string; geoId: string };
  const { locationFlowState, updateLocationFlow, setLocationFlowResult, clearLocationFlow, locations } = useTripContext();

  const [selectedMode, setSelectedMode] = useState<TransportMode>(locationFlowState.transportMode || 'walking');
  const [routeGeometry, setRouteGeometry] = useState<any>(null);

  const handleBack = () => {
    router.back();
  };

  const handleClose = () => {
    clearLocationFlow();
    router.push(`/document/${tripId}`);
  };

  const handleSelectMode = (mode: TransportMode) => {
    setSelectedMode(mode);
    updateLocationFlow({ transportMode: mode });
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

  const handleAddToDocument = () => {
    if (!locationFlowState.selectedLocation) {
      console.error('No location selected');
      return;
    }

    const { selectedLocation } = locationFlowState;

    // Find the origin location if transportOriginGeoId is set
    let transportFrom = null;
    let waypoints = null;

    if (locationFlowState.transportOriginGeoId) {
      const originLoc = locations.find(loc => loc.geoId === locationFlowState.transportOriginGeoId);
      if (originLoc) {
        transportFrom = originLoc.geoId;

        // Extract waypoints from route geometry if available
        if (routeGeometry?.coordinates) {
          waypoints = routeGeometry.coordinates.map((coord: [number, number]) => ({
            lat: coord[1],
            lng: coord[0],
          }));
        }
      }
    }

    // Set the result in context
    setLocationFlowResult({
      placeName: selectedLocation.placeName,
      lat: selectedLocation.lat,
      lng: selectedLocation.lng,
      transportMode: selectedMode,
      transportFrom,
      waypoints,
    });

    // Navigate back to document
    router.push(`/document/${tripId}`);
  };

  if (!locationFlowState.selectedLocation) {
    // If no location selected, go back to search
    handleBack();
    return null;
  }

  // Find origin location if transportOriginGeoId is set
  const originLocation = locationFlowState.transportOriginGeoId
    ? locations.find(loc => loc.geoId === locationFlowState.transportOriginGeoId)
    : null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        onPress={handleClose}
        activeOpacity={1}
      />

      <View style={styles.container}>
        <TransportConfigView
          locationName={locationFlowState.selectedLocation.placeName}
          locationLat={locationFlowState.selectedLocation.lat}
          locationLng={locationFlowState.selectedLocation.lng}
          originLocation={originLocation ? {
            lat: originLocation.lat,
            lng: originLocation.lng,
            name: originLocation.placeName,
          } : null}
          allOrigins={locations}
          selectedMode={selectedMode}
          onSelectMode={handleSelectMode}
          onAddToDocument={handleAddToDocument}
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
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
});
