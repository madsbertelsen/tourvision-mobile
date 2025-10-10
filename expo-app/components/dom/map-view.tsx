'use dom';

import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer, IconLayer } from '@deck.gl/layers';
import MapLibreMap from 'react-map-gl/maplibre';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

// Matching colors from the TipTap destination nodes
const MARKER_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];

interface Waypoint {
  lat: number;
  lng: number;
  index: number;
}

interface TransportationRoute {
  id: string;
  mode: string;
  geometry: {
    type: 'LineString';
    coordinates: number[][];
  };
  color: string;
  fromPlace: string;
  toPlace: string;
  duration: string;
  waypoints?: Waypoint[];
}

interface MapViewProps {
  locations?: Location[];
  focusedLocation?: Location | null;
  center?: { lat: number; lng: number };
  zoom?: number;
  onLocationClick?: (location: Location) => void;
  onMapClick?: (lat: number, lng: number) => void;
  style?: React.CSSProperties;
  showRoute?: boolean;
  routeGeometry?: {
    type: 'LineString';
    coordinates: number[][];
  };
  routeColor?: string;
  transportationRoutes?: TransportationRoute[];
  onRouteClick?: (routeId: string, lngLat: { lng: number; lat: number }, segmentIndex?: number) => void;
  onWaypointDrag?: (routeId: string, waypointIndex: number, newPosition: { lng: number; lat: number }) => void;
}

// Helper function to convert hex color to RGB array
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [128, 128, 128];
}

export default function MapView({
  locations = [],
  focusedLocation = null,
  center = { lat: 40.7128, lng: -74.0060 },
  zoom = 10,
  onLocationClick,
  onMapClick,
  style = { width: '100%', height: '400px' },
  showRoute = false,
  routeGeometry,
  routeColor = '#6366F1',
  transportationRoutes = [],
  onRouteClick,
  onWaypointDrag
}: MapViewProps) {

  // Use provided center, or first location, or default
  const initialCenter = center || (locations.length > 0
    ? { lat: locations[0].lat, lng: locations[0].lng }
    : { lat: 40.7128, lng: -74.0060 });

  const [viewState, setViewState] = useState({
    longitude: initialCenter.lng,
    latitude: initialCenter.lat,
    zoom: zoom,
    pitch: 0,
    bearing: 0,
  });

  const [hoveredObject, setHoveredObject] = useState<any>(null);
  const deckRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Focus on a specific location when it changes
  useEffect(() => {
    if (focusedLocation && mapLoaded) {
      setViewState({
        ...viewState,
        longitude: focusedLocation.lng,
        latitude: focusedLocation.lat,
        zoom: 14,
        transitionDuration: 800,
        transitionInterpolator: undefined,
      });
    }
  }, [focusedLocation, mapLoaded]);

  useEffect(() => {
    // Initial auto-fit bounds when locations are first loaded
    if (locations.length > 0 && mapLoaded && !focusedLocation) {
      if (locations.length === 1) {
        // For single location, just fly to it
        setViewState({
          ...viewState,
          longitude: locations[0].lng,
          latitude: locations[0].lat,
          zoom: 12,
          transitionDuration: 1000,
        });
      } else {
        // For multiple locations, calculate bounds
        const lngs = locations.map(loc => loc.lng);
        const lats = locations.map(loc => loc.lat);

        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);

        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;

        // Calculate appropriate zoom level (simplified)
        const lngDiff = maxLng - minLng;
        const latDiff = maxLat - minLat;
        const maxDiff = Math.max(lngDiff, latDiff);

        let calculatedZoom = 10;
        if (maxDiff < 0.01) calculatedZoom = 15;
        else if (maxDiff < 0.05) calculatedZoom = 13;
        else if (maxDiff < 0.1) calculatedZoom = 12;
        else if (maxDiff < 0.5) calculatedZoom = 10;
        else if (maxDiff < 1) calculatedZoom = 9;
        else if (maxDiff < 5) calculatedZoom = 7;
        else calculatedZoom = 5;

        setViewState({
          ...viewState,
          longitude: centerLng,
          latitude: centerLat,
          zoom: calculatedZoom,
          transitionDuration: 1000,
        });
      }
    }
  }, [locations.length, mapLoaded]);

  const handleClick = useCallback((info: any) => {
    if (info.object) {
      // Clicked on a layer object
      if (info.layer?.id === 'location-markers' && onLocationClick) {
        onLocationClick(info.object);
      } else if (info.layer?.id?.startsWith('route-') && onRouteClick) {
        const routeId = info.layer.id.replace('route-', '');
        onRouteClick(routeId, { lng: info.coordinate[0], lat: info.coordinate[1] });
      }
    } else if (onMapClick) {
      // Clicked on empty map
      onMapClick(info.coordinate[1], info.coordinate[0]);
    }
  }, [onLocationClick, onMapClick, onRouteClick]);

  // Create location markers layer
  const locationMarkersLayer = new ScatterplotLayer({
    id: 'location-markers',
    data: locations,
    getPosition: (d: Location) => [d.lng, d.lat],
    getFillColor: (d: Location) => {
      const colorIndex = d.colorIndex ?? locations.indexOf(d);
      const color = MARKER_COLORS[colorIndex % MARKER_COLORS.length];
      return [...hexToRgb(color), 255];
    },
    getRadius: 12,
    radiusScale: 1,
    radiusMinPixels: 8,
    radiusMaxPixels: 20,
    pickable: true,
    stroked: true,
    filled: true,
    lineWidthMinPixels: 3,
    getLineColor: [255, 255, 255],
    onHover: (info: any) => {
      if (info.object) {
        setHoveredObject(info.object);
      } else {
        setHoveredObject(null);
      }
    },
  });

  // Create location labels layer
  const locationLabelsLayer = new TextLayer({
    id: 'location-labels',
    data: locations,
    getPosition: (d: Location) => [d.lng, d.lat],
    getText: (d: Location) => d.name,
    getSize: 12,
    getColor: [51, 51, 51, 255],
    getAngle: 0,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    getPixelOffset: [0, -20],
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: 600,
    background: true,
    backgroundPadding: [4, 2],
    getBackgroundColor: [255, 255, 255, 230],
    getBorderColor: [0, 0, 0, 0],
    getBorderWidth: 0,
  });

  // Create route layers
  const routeLayers: any[] = [];

  if (showRoute && routeGeometry) {
    routeLayers.push(new PathLayer({
      id: 'main-route',
      data: [{ path: routeGeometry.coordinates }],
      getPath: (d: any) => d.path,
      getColor: [...hexToRgb(routeColor), 191], // 0.75 opacity
      getWidth: 4,
      widthMinPixels: 2,
      pickable: false,
      capRounded: true,
      jointRounded: true,
    }));
  }

  transportationRoutes.forEach((route) => {
    const routeStyle = {
      color: route.color || '#6B7280',
      width: 3,
      dasharray: route.mode === 'walking' ? true : false,
    };

    routeLayers.push(new PathLayer({
      id: `route-${route.id}`,
      data: [{ path: route.geometry.coordinates, ...route }],
      getPath: (d: any) => d.path,
      getColor: [...hexToRgb(routeStyle.color), 153], // 0.6 opacity
      getWidth: routeStyle.width,
      widthMinPixels: 2,
      pickable: true,
      capRounded: true,
      jointRounded: true,
      getDashArray: routeStyle.dasharray ? [2, 2] : undefined,
    }));

    // Add waypoint markers
    if (route.waypoints && route.waypoints.length > 0) {
      routeLayers.push(new ScatterplotLayer({
        id: `waypoints-${route.id}`,
        data: route.waypoints,
        getPosition: (d: Waypoint) => [d.lng, d.lat],
        getFillColor: [...hexToRgb(route.color || '#6B7280'), 255],
        getRadius: 6,
        radiusMinPixels: 6,
        radiusMaxPixels: 12,
        pickable: true,
        stroked: true,
        filled: true,
        lineWidthMinPixels: 2,
        getLineColor: [255, 255, 255],
      }));
    }
  });

  const layers = [
    ...routeLayers,
    locationMarkersLayer,
    locationLabelsLayer,
  ];

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  return (
    <div ref={containerRef} style={style}>
      <DeckGL
        ref={deckRef}
        viewState={viewState}
        onViewStateChange={({ viewState }: any) => setViewState(viewState)}
        controller={true}
        layers={layers}
        onClick={handleClick}
        getCursor={({ isHovering }: any) => isHovering ? 'pointer' : 'grab'}
      >
        <MapLibreMap
          mapStyle="https://demotiles.maplibre.org/style.json"
          projection={{ type: 'globe' }}
          onLoad={() => setMapLoaded(true)}
        />
      </DeckGL>

      {/* Popup for hovered location */}
      {hoveredObject && (
        <div
          style={{
            position: 'absolute',
            zIndex: 1,
            pointerEvents: 'none',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -120px)',
            background: 'white',
            padding: '8px 12px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            maxWidth: '200px',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
            {hoveredObject.name}
          </div>
          {hoveredObject.description && (
            <div style={{ fontSize: '12px', color: '#666' }}>
              {hoveredObject.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
