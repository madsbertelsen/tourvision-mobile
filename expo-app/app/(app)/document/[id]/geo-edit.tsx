import React, { useState, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTripContext } from './_layout';
import LocationConfigView from '@/components/LocationConfigView';

type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

export default function GeoEdit() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { locations, currentDoc, setGeoMarkUpdate } = useTripContext();

  // Extract query parameters
  const geoId = params.geoId as string;
  const placeName = params.placeName as string;
  const selectedText = params.selectedText as string;
  const lat = parseFloat(params.lat as string);
  const lng = parseFloat(params.lng as string);

  // Extract existing geo-mark data from currentDoc
  const geoMarkData = useMemo(() => {
    if (!currentDoc || !geoId) return null;

    // Traverse document to find geo-mark with matching geoId
    let foundMark: any = null;

    const traverse = (node: any) => {
      // Check if node has marks
      if (node.marks && Array.isArray(node.marks)) {
        const mark = node.marks.find((m: any) =>
          m.type === 'geoMark' && m.attrs?.geoId === geoId
        );
        if (mark && mark.attrs) {
          foundMark = mark.attrs;
          return;
        }
      }

      // Recursively traverse child nodes
      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          traverse(child);
          if (foundMark) return; // Stop if found
        }
      }
    };

    traverse(currentDoc);
    return foundMark;
  }, [currentDoc, geoId]);

  // Find origin location from transportFrom
  const originLocation = useMemo(() => {
    if (!geoMarkData?.transportFrom) return null;
    const origin = locations.find(loc => loc.geoId === geoMarkData.transportFrom);
    if (!origin) return null;
    return {
      lat: origin.lat,
      lng: origin.lng,
      name: origin.placeName,
    };
  }, [geoMarkData, locations]);

  // Initialize state with existing values or defaults
  const [selectedMode, setSelectedMode] = useState<TransportMode>(
    (geoMarkData?.transportProfile as TransportMode) || 'walking'
  );
  const [routeGeometry, setRouteGeometry] = useState<any>(
    geoMarkData?.waypoints ? {
      type: 'LineString',
      coordinates: geoMarkData.waypoints.map((wp: any) => [wp.lng, wp.lat])
    } : null
  );

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
    // Prepare updated attributes
    const updatedAttrs: any = {
      transportProfile: selectedMode,
    };

    // Find origin location from routeGeometry or originLocation
    if (originLocation) {
      // Find the geoId of the origin location
      const originGeoMark = locations.find(
        loc => loc.lat === originLocation.lat && loc.lng === originLocation.lng
      );
      updatedAttrs.transportFrom = originGeoMark?.geoId || null;
    } else {
      updatedAttrs.transportFrom = null;
    }

    // Extract waypoints from routeGeometry
    if (routeGeometry && routeGeometry.coordinates) {
      updatedAttrs.waypoints = routeGeometry.coordinates.map((coord: [number, number]) => ({
        lat: coord[1],
        lng: coord[0],
      }));
    } else {
      updatedAttrs.waypoints = null;
    }

    console.log('[GeoEdit] Updating geo-mark with attrs:', updatedAttrs);

    // Send update to context
    setGeoMarkUpdate({
      geoId,
      updatedAttrs,
    });

    // Close the modal
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
        <LocationConfigView
          selectedText={selectedText}
          locationName={placeName}
          locationLat={lat}
          locationLng={lng}
          originLocation={originLocation}
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
