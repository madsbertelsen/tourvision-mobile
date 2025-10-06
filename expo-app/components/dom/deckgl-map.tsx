'use dom';

import React, { useState } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import MapGL from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

const INITIAL_VIEW_STATE = {
  longitude: -122.4,
  latitude: 37.8,
  zoom: 11,
  pitch: 0,
  bearing: 0
};

// Sample data
const DATA = [
  { position: [-122.4, 37.8], color: [255, 0, 0], radius: 100 },
  { position: [-122.45, 37.75], color: [0, 255, 0], radius: 100 },
  { position: [-122.35, 37.85], color: [0, 0, 255], radius: 100 },
];

export default function DeckGLMap() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

  const layers = [
    new ScatterplotLayer({
      id: 'scatterplot-layer',
      data: DATA,
      pickable: true,
      opacity: 0.8,
      stroked: true,
      filled: true,
      radiusScale: 6,
      radiusMinPixels: 10,
      radiusMaxPixels: 100,
      lineWidthMinPixels: 1,
      getPosition: (d: any) => d.position,
      getRadius: (d: any) => d.radius,
      getFillColor: (d: any) => d.color,
      getLineColor: [0, 0, 0]
    })
  ];

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        onViewStateChange={({ viewState }: any) => setViewState(viewState)}
      >
        <MapGL
          mapboxAccessToken={mapboxToken}
          mapStyle="mapbox://styles/mapbox/dark-v10"
        />
      </DeckGL>
    </div>
  );
}
