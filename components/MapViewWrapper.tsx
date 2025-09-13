import React from 'react';
import MapViewDOM from './dom/MapViewDOM';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

interface MapViewWrapperProps {
  locations?: Location[];
  center?: { lat: number; lng: number };
  zoom?: number;
  onLocationClick?: (location: Location) => void;
  onMapClick?: (lat: number, lng: number) => void;
  height?: number;
}

export function MapViewWrapper({
  locations = [],
  center,
  zoom,
  onLocationClick,
  onMapClick,
  height = 400,
}: MapViewWrapperProps) {
  // Directly use the DOM component
  return (
    <MapViewDOM
      locations={locations}
      center={center}
      zoom={zoom}
      onLocationClick={onLocationClick}
      onMapClick={onMapClick}
      dom={{
        style: { width: '100%', height },
      }}
    />
  );
}

