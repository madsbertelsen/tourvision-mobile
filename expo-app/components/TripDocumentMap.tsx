import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle, TouchableOpacity, Text } from 'react-native';
// @ts-ignore - react-map-gl has module resolution issues with Metro
import Map from 'react-map-gl/mapbox';
// @ts-ignore
import { ScatterplotLayer } from '@deck.gl/layers';
import { MapboxOverlay } from '@deck.gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { GeolocateControl, Marker, NavigationControl, useControl } from 'react-map-gl/mapbox';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  colorIndex: number;
}

interface TripDocumentMapProps {
  document: any; // ProseMirror document JSON
  style?: ViewStyle;
}

const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const MAP_STYLES = [
  { id: 'light', name: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
  { id: 'streets', name: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'outdoors', name: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' },
  { id: 'satellite', name: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
];

// DeckGL overlay component
function DeckGLOverlay(props: { layers: any[] }) {
  const overlay = useControl<any>(() => new MapboxOverlay({}));
  overlay.setProps({ layers: props.layers });
  return null;
}

// Extract locations (geo-marks) from ProseMirror document
function extractLocations(doc: any): Location[] {
  const locations: Location[] = [];
  const seenIds = new Set<string>();
  let uniqueIdCounter = 0;
  let totalGeoMarksFound = 0;

  function traverse(node: any) {
    if (!node) return;

    // Check if this is a geoMark node
    if (node.type === 'geoMark' && node.attrs) {
      totalGeoMarksFound++;
      const { geoId, placeName, lat, lng, colorIndex } = node.attrs;
      console.log(`[TripDocumentMap] Found geoMark #${totalGeoMarksFound}:`, { geoId, placeName, lat, lng, colorIndex });

      // Check if geoId is valid (not null, undefined, or string "null")
      const hasValidGeoId = geoId && geoId !== 'null';

      if (hasValidGeoId && lat != null && lng != null) {
        // Only add unique locations (deduplicate based on geoId)
        if (!seenIds.has(geoId)) {
          seenIds.add(geoId);
          locations.push({
            id: geoId,
            name: placeName || 'Location',
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            colorIndex: parseInt(colorIndex) || 0
          });
          console.log(`[TripDocumentMap] ✓ Added location (unique geoId):`, geoId);
        } else {
          console.log(`[TripDocumentMap] ✗ Skipped location (duplicate geoId):`, geoId);
        }
      } else if (lat != null && lng != null) {
        // Handle geo-marks without valid geoId - create unique ID based on coordinates
        const fallbackId = `loc-${placeName?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || uniqueIdCounter++}`;
        locations.push({
          id: fallbackId,
          name: placeName || 'Location',
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          colorIndex: parseInt(colorIndex) || 0
        });
        console.log(`[TripDocumentMap] ✓ Added location (no valid geoId, using fallback):`, fallbackId);
      } else {
        console.log(`[TripDocumentMap] ✗ Skipped location (missing coordinates):`, { geoId, lat, lng });
      }
    }

    // Recursively traverse children
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }

  traverse(doc);
  console.log(`[TripDocumentMap] Summary: Found ${totalGeoMarksFound} geo-marks, extracted ${locations.length} unique locations`);
  return locations;
}

export default function TripDocumentMap({ document, style }: TripDocumentMapProps) {
  const mapRef = useRef<any>(null);
  const [mapStyle, setMapStyle] = useState(MAP_STYLES[0].url); // Default to light style

  // Extract locations from document
  const locations = useMemo(() => {
    if (!document) return [];
    const locs = extractLocations(document);
    console.log('[TripDocumentMap] Extracted locations:', locs.length, locs);
    return locs;
  }, [document]);

  // Calculate center and bounds from locations
  const { center, bounds } = useMemo(() => {
    if (locations.length === 0) {
      return {
        center: { latitude: 48.8566, longitude: 2.3522 }, // Default to Paris
        bounds: null
      };
    }

    if (locations.length === 1) {
      return {
        center: { latitude: locations[0].lat, longitude: locations[0].lng },
        bounds: null
      };
    }

    const lats = locations.map(l => l.lat);
    const lngs = locations.map(l => l.lng);

    return {
      center: {
        latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
        longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2
      },
      bounds: [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)]
      ] as [[number, number], [number, number]]
    };
  }, [locations]);

  const [viewState, setViewState] = useState({
    ...center,
    zoom: locations.length <= 1 ? 12 : 10,
    pitch: 0,
    bearing: 0
  });

  // Fit bounds only on initial load
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    // Only fit bounds once when locations first load
    if (hasInitializedRef.current) return;

    if (bounds && mapRef.current && locations.length > 1) {
      hasInitializedRef.current = true;
      setTimeout(() => {
        mapRef.current?.fitBounds(bounds, {
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          duration: 1000
        });
      }, 100);
    } else if (locations.length === 1) {
      hasInitializedRef.current = true;
      setViewState(prev => ({
        ...prev,
        latitude: locations[0].lat,
        longitude: locations[0].lng,
        zoom: 12
      }));
    }
  }, [locations, bounds]);

  // Create deck.gl layers for markers
  const layers = useMemo(() => [
    new ScatterplotLayer({
      id: 'locations-layer',
      data: locations,
      pickable: true,
      opacity: 1,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 12,
      radiusMaxPixels: 24,
      lineWidthMinPixels: 2,
      getPosition: (d: Location) => [d.lng, d.lat],
      getFillColor: (d: Location) => hexToRgb(COLORS[d.colorIndex % COLORS.length]),
      getLineColor: [255, 255, 255],
      getRadius: 18
    })
  ], [locations]);

  return (
    <View style={[styles.container, style]}>
      {/* Map Style Switcher */}
      <View style={styles.styleSwitcher}>
        {MAP_STYLES.map((style) => (
          <TouchableOpacity
            key={style.id}
            style={[
              styles.styleButton,
              mapStyle === style.url && styles.styleButtonActive
            ]}
            onPress={() => setMapStyle(style.url)}
          >
            <Text style={[
              styles.styleButtonText,
              mapStyle === style.url && styles.styleButtonTextActive
            ]}>
              {style.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
        mapStyle={mapStyle}
        style={{ width: '100%', height: '100%' }}
        {...viewState}
        onMove={(evt: any) => setViewState(evt.viewState)}
      >
        {/* DeckGL overlay */}
        <DeckGLOverlay key="deckgl-overlay" layers={layers} />

        {/* Navigation controls */}
        <NavigationControl key="nav-control" position="top-right" />
        <GeolocateControl key="geolocate-control" position="top-right" />

        {/* Fallback markers */}
        {locations.map((location) => (
          <Marker
            key={location.id}
            latitude={location.lat}
            longitude={location.lng}
            anchor="center"
          >
            <View
              style={[
                styles.marker,
                { backgroundColor: COLORS[location.colorIndex % COLORS.length] }
              ]}
            />
          </Marker>
        ))}
      </Map>
    </View>
  );
}

// Helper function to convert hex to RGB
function hexToRgb(hex: string): [number, number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        220
      ]
    : [0, 0, 0, 220];
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  styleSwitcher: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  styleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  styleButtonActive: {
    backgroundColor: '#3B82F6',
  },
  styleButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  styleButtonTextActive: {
    color: '#ffffff',
  },
  marker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
