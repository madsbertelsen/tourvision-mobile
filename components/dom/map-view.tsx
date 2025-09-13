'use dom';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Map, { Marker, NavigationControl, GeolocateControl, Popup } from 'react-map-gl/dist/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

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
];

interface MapViewProps {
  locations?: Location[];
  center?: { lat: number; lng: number };
  zoom?: number;
  onLocationClick?: (location: Location) => void;
  onMapClick?: (lat: number, lng: number) => void;
  style?: React.CSSProperties;
}

export function MapView({
  locations = [],
  center = { lat: 40.7128, lng: -74.0060 },
  zoom = 10,
  onLocationClick,
  onMapClick,
  style = { width: '100%', height: '400px' }
}: MapViewProps) {
  // If we have locations, use the first one as center, otherwise use default
  const initialCenter = locations.length > 0 
    ? { lat: locations[0].lat, lng: locations[0].lng }
    : center;
    
  const [viewState, setViewState] = useState({
    longitude: initialCenter.lng,
    latitude: initialCenter.lat,
    zoom: zoom,
  });
  
  const [popupInfo, setPopupInfo] = useState<Location | null>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (locations.length > 0 && mapRef.current) {
      if (locations.length === 1) {
        // For single location, just fly to it
        mapRef.current.flyTo({
          center: [locations[0].lng, locations[0].lat],
          zoom: 12,
          duration: 1000,
        });
      } else {
        // For multiple locations, fit bounds
        const bounds: [[number, number], [number, number]] = [
          [180, 90],
          [-180, -90]
        ];
        
        locations.forEach(loc => {
          bounds[0][0] = Math.min(bounds[0][0], loc.lng);
          bounds[0][1] = Math.min(bounds[0][1], loc.lat);
          bounds[1][0] = Math.max(bounds[1][0], loc.lng);
          bounds[1][1] = Math.max(bounds[1][1], loc.lat);
        });
        
        mapRef.current.fitBounds(bounds, {
          padding: 50,
          duration: 1000,
        });
      }
    }
  }, [locations]);

  const handleMapClick = useCallback((event: any) => {
    if (onMapClick) {
      onMapClick(event.lngLat.lat, event.lngLat.lng);
    }
  }, [onMapClick]);

  const handleMarkerClick = useCallback((location: Location, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopupInfo(location);
    if (onLocationClick) {
      onLocationClick(location);
    }
  }, [onLocationClick]);

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  return (
    <div style={style}>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onClick={handleMapClick}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />
        <GeolocateControl position="top-right" />
        
        {locations.map((location, index) => {
          const colorIndex = location.colorIndex ?? index;
          const markerColor = MARKER_COLORS[colorIndex % MARKER_COLORS.length];
          
          return (
            <Marker
              key={location.id}
              longitude={location.lng}
              latitude={location.lat}
              anchor="bottom"
              onClick={(e) => handleMarkerClick(location, e)}
            >
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: markerColor,
                  border: '3px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ color: 'white', fontSize: '16px', fontWeight: 'bold' }}>
                  {index + 1}
                </span>
              </div>
            </Marker>
          );
        })}
        
        {popupInfo && (
          <Popup
            anchor="top"
            longitude={popupInfo.lng}
            latitude={popupInfo.lat}
            onClose={() => setPopupInfo(null)}
            closeButton={true}
            closeOnClick={false}
          >
            <div style={{ padding: '8px' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 'bold' }}>
                {popupInfo.name}
              </h3>
              {popupInfo.description && (
                <p style={{ margin: 0, fontSize: '12px', color: '#666' }}>
                  {popupInfo.description}
                </p>
              )}
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}