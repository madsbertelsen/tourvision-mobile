'use dom';

import React, { Suspense, lazy } from 'react';

// Lazy load the map component
const DocumentMapView = lazy(() =>
  import('./DocumentMapView').then(module => ({
    default: module.DocumentMapView
  }))
);

interface DocumentMapDOMProps {
  locations: Array<{
    latitude: number;
    longitude: number;
    placeName: string;
    address?: string;
  }>;
  height?: number;
}

export default function DocumentMapDOM({ locations, height = 400 }: DocumentMapDOMProps) {
  return (
    <Suspense fallback={
      <div style={{
        width: '100%',
        height: `${height}px`,
        backgroundColor: '#f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '8px',
      }}>
        <p>Loading map...</p>
      </div>
    }>
      <DocumentMapView locations={locations} height={height} />
    </Suspense>
  );
}