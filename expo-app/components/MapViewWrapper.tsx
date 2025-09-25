import React, { useMemo } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { ParsedElement } from '@/utils/html-parser';

// Dynamic import for web-only DOM component
const MapViewDOM = Platform.OS === 'web'
  ? React.lazy(() => import('./dom/map-view').then(m => ({ default: m.MapView })))
  : null;

interface MapViewWrapperProps {
  elements: ParsedElement[];
  height?: number;
}

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

// Extract all geo-marks from parsed elements
function extractLocations(elements: ParsedElement[]): Location[] {
  const locations: Location[] = [];
  let colorIndex = 0;
  const seenLocations = new Set<string>();

  const traverse = (element: ParsedElement) => {
    if (element.type === 'geo-mark' && element.attributes) {
      const { dataLat, dataLng, dataPlaceName } = element.attributes;
      const name = element.content || dataPlaceName || 'Unknown';

      // Skip if coordinates are pending or invalid
      if (!dataLat || !dataLng || dataLat === 'PENDING' || dataLng === 'PENDING') {
        return;
      }

      // Skip duplicate locations
      const locationKey = `${name}-${dataLat}-${dataLng}`;
      if (seenLocations.has(locationKey)) {
        return;
      }
      seenLocations.add(locationKey);

      const lat = parseFloat(dataLat);
      const lng = parseFloat(dataLng);

      if (!isNaN(lat) && !isNaN(lng)) {
        locations.push({
          id: `location-${locations.length}`,
          name,
          lat,
          lng,
          colorIndex: colorIndex % 10, // Cycle through 10 colors
        });
        colorIndex++;
      }
    }

    // Recursively traverse children
    if (element.children) {
      element.children.forEach(traverse);
    }
  };

  elements.forEach(traverse);
  return locations;
}

export function MapViewWrapper({ elements, height = 400 }: MapViewWrapperProps) {
  const locations = useMemo(() => extractLocations(elements), [elements]);

  // Don't render if no valid locations
  if (locations.length === 0) {
    return null;
  }

  // Only render on web platform
  if (Platform.OS !== 'web' || !MapViewDOM) {
    return null;
  }

  return (
    <View style={[styles.container, { height }]}>
      <React.Suspense fallback={<View style={styles.loading} />}>
        <MapViewDOM
          locations={locations}
          transportationRoutes={[]}
          onLocationClick={(location) => {
            console.log('Location clicked:', location);
          }}
        />
      </React.Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 16,
  },
  loading: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
});