import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { ParsedElement } from '@/utils/html-parser';

// Import DOM component - works on all platforms with expo-dom
const MapViewDOM = React.lazy(() => import('./dom/map-view'));

interface MapViewWrapperProps {
  elements?: ParsedElement[];
  locations?: Location[];
  focusedLocation?: Location | null;
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

export function MapViewWrapper({ elements = [], locations: providedLocations, focusedLocation, height = 400 }: MapViewWrapperProps) {
  // Use provided locations if available, otherwise extract from elements
  const locations = useMemo(() => {
    if (providedLocations && providedLocations.length > 0) {
      return providedLocations;
    }
    return extractLocations(elements);
  }, [elements, providedLocations]);

  console.log('MapViewWrapper - focusedLocation:', focusedLocation);

  // Always render map, show globe view when no locations
  return (
    <View style={[styles.container, { height }]}>
      <React.Suspense fallback={<View style={styles.loading} />}>
        <MapViewDOM
          locations={locations}
          focusedLocation={focusedLocation}
          transportationRoutes={[]}
          // Only provide center/zoom for empty globe view, let map auto-fit when locations exist
          {...(locations.length === 0 ? {
            center: { lat: 0, lng: 0 },
            zoom: 0.5
          } : {})}
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
    overflow: 'hidden',
  },
  loading: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
});