import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
// @ts-ignore
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Marker } from 'react-map-gl/mapbox';

interface LocationPickerMapProps {
  lat: number;
  lng: number;
  placeName: string;
  editable?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
}

export default function LocationPickerMap({
  lat,
  lng,
  placeName,
  editable = false,
  onLocationChange,
}: LocationPickerMapProps) {
  const [markerPosition, setMarkerPosition] = useState({ lat, lng });
  const [viewState, setViewState] = useState({
    longitude: lng,
    latitude: lat,
    zoom: 12,
  });

  const handleMarkerDragEnd = (event: any) => {
    const newLat = event.lngLat.lat;
    const newLng = event.lngLat.lng;
    setMarkerPosition({ lat: newLat, lng: newLng });
    onLocationChange?.(newLat, newLng);
  };

  return (
    <View style={styles.container}>
      <Map
        {...viewState}
        onMove={(evt: any) => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
      >
        <Marker
          longitude={markerPosition.lng}
          latitude={markerPosition.lat}
          draggable={editable}
          onDragEnd={handleMarkerDragEnd}
        >
          <View style={styles.marker}>
            <View style={styles.markerDot} />
          </View>
        </Marker>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 200,
    backgroundColor: '#F3F4F6',
  },
  marker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
