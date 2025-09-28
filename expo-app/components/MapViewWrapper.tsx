import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { ParsedElement } from '@/utils/html-parser';

// Import DOM component - works on all platforms with expo-dom
const MapViewDOM = React.lazy(() => import('./dom/map-view'));

interface MapViewWrapperProps {
  elements?: ParsedElement[];
  locations?: Location[];
  focusedLocation?: Location | null;
  height?: number | string;
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

  // Pass focused location to map for centering with padding
  const mapProps = useMemo(() => {
    // If there's a focused location, center on it with higher zoom and padding
    if (focusedLocation) {
      return {
        center: { lat: focusedLocation.lat, lng: focusedLocation.lng },
        zoom: 14, // Closer zoom for focused location
        animateDuration: 500, // Smooth transition
        // Add padding to bring marker below chat overlay (75% of screen is covered by chat)
        padding: { top: 300, bottom: 50, left: 50, right: 50 }, // Top padding to account for chat overlay
      };
    }
    // If no locations, show globe view
    if (locations.length === 0) {
      return {
        center: { lat: 0, lng: 0 },
        zoom: 0.5,
      };
    }
    // Otherwise let map auto-fit to all locations
    return {};
  }, [focusedLocation, locations.length]);

  // Always render map, show globe view when no locations
  // If height is a string percentage, use flex: 1 to fill parent
  const containerStyle = height === '100%'
    ? [styles.container, styles.fullHeight]
    : [styles.container, { height }];

  return (
    <View style={containerStyle}>
      <React.Suspense fallback={<View style={styles.loading} />}>
        <MapViewDOM
          locations={locations}
          focusedLocation={focusedLocation}
          transportationRoutes={[]}
          // Pass full height style to DOM component
          style={{ width: '100%', height: '100%' }}
          {...mapProps}
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
  fullHeight: {
    flex: 1,
    height: '100%',
  },
  loading: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
});