'use dom';

import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useState } from 'react';
import { Map as MapGL } from 'react-map-gl/dist/mapbox';

export default function SimpleMapTest() {
  const [viewState, setViewState] = useState({
    longitude: -100,
    latitude: 40,
    zoom: 3.5
  });

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  console.log('[SimpleMapTest] Rendering with token:', mapboxToken ? 'present' : 'missing');

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <MapGL
        {...viewState}
        onMove={(evt: any) => setViewState(evt.viewState)}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
