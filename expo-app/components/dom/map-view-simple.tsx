'use dom';

import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useState, useRef, useCallback } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/dist/mapbox';

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

interface MapViewSimpleProps {
  locations?: Location[];
  center?: { lat: number; lng: number };
  zoom?: number;
  style?: React.CSSProperties;
}

export default function MapViewSimple({
  locations = [],
  center = { lat: 0, lng: 0 },
  zoom = 2,
  style = { width: '100%', height: '400px' },
}: MapViewSimpleProps) {

  // Simple controlled viewState - no animations
  const [viewState, setViewState] = useState({
    longitude: center.lng,
    latitude: center.lat,
    zoom: zoom,
  });

  // Flying marker state
  const [flyingMarker, setFlyingMarker] = useState<{
    longitude: number;
    latitude: number;
    visible: boolean;
    pulseScale: number;
  } | null>(null);

  // Tail trail for the flying marker (as coordinates for line)
  const [markerTrail, setMarkerTrail] = useState<number[][]>([]);

  // Animation state
  const animationRef = useRef<{
    frameId?: number;
    startTime?: number;
    startState?: { longitude: number; latitude: number; zoom: number };
    targetState?: { longitude: number; latitude: number; zoom: number };
    duration: number;
  } | null>(null);

  // Generate random location on Earth
  const getRandomLocation = () => {
    // Random latitude between -60 and 70 (avoiding extreme poles)
    const lat = Math.random() * 130 - 60;
    // Random longitude between -180 and 180
    const lng = Math.random() * 360 - 180;
    // Keep zoom constant at 2
    const zoom = 2;

    return { latitude: lat, longitude: lng, zoom };
  };

  // Easing function for smooth animation
  const easeInOutCubic = (t: number) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Animate to a target location using requestAnimationFrame
  const animateToLocation = useCallback((target: { longitude: number; latitude: number; zoom: number }) => {
    // Cancel any existing animation
    if (animationRef.current?.frameId) {
      cancelAnimationFrame(animationRef.current.frameId);
    }

    const startTime = performance.now();
    const startState = { ...viewState };
    const duration = 2000; // 2 second animation

    animationRef.current = {
      startTime,
      startState,
      targetState: target,
      duration,
    };

    // Show the flying marker and clear trail
    setFlyingMarker({
      longitude: startState.longitude,
      latitude: startState.latitude,
      visible: true,
      pulseScale: 1,
    });
    setMarkerTrail([]);

    const animate = (timestamp: number) => {
      if (!animationRef.current) return;

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);

      // Calculate marker position (ahead of camera by 20% of remaining distance)
      const markerProgress = Math.min(eased + 0.2, 1); // Marker is 20% ahead
      const markerEased = easeInOutCubic(markerProgress);

      // Update flying marker position (ahead of camera)
      const markerLongitude = startState.longitude + (target.longitude - startState.longitude) * markerEased;
      const markerLatitude = startState.latitude + (target.latitude - startState.latitude) * markerEased;

      // Add pulsing effect
      const pulseScale = 1 + 0.2 * Math.sin(elapsed * 0.004);

      setFlyingMarker({
        longitude: markerLongitude,
        latitude: markerLatitude,
        visible: true,
        pulseScale,
      });

      // Update trail (keep last 20 positions for smooth line)
      setMarkerTrail(prevTrail => {
        const newPoint = [markerLongitude, markerLatitude];
        const newTrail = [newPoint, ...prevTrail].slice(0, 20);
        return newTrail;
      });

      // Interpolate camera values
      const newLongitude = startState.longitude + (target.longitude - startState.longitude) * eased;
      const newLatitude = startState.latitude + (target.latitude - startState.latitude) * eased;
      const newZoom = startState.zoom + (target.zoom - startState.zoom) * eased;

      // Update view state
      setViewState({
        longitude: newLongitude,
        latitude: newLatitude,
        zoom: newZoom,
      });

      // Continue animation if not complete
      if (progress < 1) {
        animationRef.current.frameId = requestAnimationFrame(animate);
      } else {
        // Animation complete - hide the marker and trail
        setFlyingMarker(null);
        setMarkerTrail([]);
        animationRef.current = null;
        console.log('Animation complete. New location:', {
          lng: newLongitude.toFixed(2),
          lat: newLatitude.toFixed(2),
          zoom: newZoom.toFixed(1)
        });
      }
    };

    // Start the animation
    animationRef.current.frameId = requestAnimationFrame(animate);
  }, [viewState]);

  // Handle map click
  const handleMapClick = useCallback(() => {
    const randomLocation = getRandomLocation();
    console.log('Animating to random location:', {
      lng: randomLocation.longitude.toFixed(2),
      lat: randomLocation.latitude.toFixed(2),
      zoom: randomLocation.zoom.toFixed(1)
    });
    animateToLocation(randomLocation);
  }, [animateToLocation]);

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  return (
    <div style={style}>
      <style>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(-10px) scale(1);
          }
          50% {
            transform: translateY(-15px) scale(1.05);
          }
        }

        .flying-marker {
          animation: float 2s ease-in-out infinite;
          position: relative;
        }

        .marker-shadow {
          position: absolute;
          width: 100%;
          height: 100%;
          background: radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%);
          transform: translateY(25px) scale(1.5, 0.5);
          border-radius: 50%;
        }
      `}</style>
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onClick={handleMapClick}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
      >
        {/* Tail trail as GeoJSON line */}
        {markerTrail.length > 1 && (
          <Source
            id="marker-trail"
            type="geojson"
            data={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: markerTrail
              }
            }}
          >
            <Layer
              id="marker-trail-line"
              type="line"
              paint={{
                'line-color': '#EF4444',
                'line-width': 4,
                'line-opacity': 0.6,
                'line-blur': 1
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round'
              }}
            />
          </Source>
        )}

        {/* Flying marker shadow as GeoJSON */}
        {flyingMarker && flyingMarker.visible && (
          <Source
            id="marker-shadow"
            type="geojson"
            data={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: [flyingMarker.longitude, flyingMarker.latitude]
              }
            }}
          >
            <Layer
              id="marker-shadow-layer"
              type="circle"
              paint={{
                'circle-radius': 15,
                'circle-color': 'rgba(0, 0, 0, 0.2)',
                'circle-blur': 0.8,
                'circle-translate': [0, 10], // Offset shadow down
                'circle-translate-anchor': 'viewport'
              }}
            />
          </Source>
        )}

        {/* Flying red marker as GeoJSON circle */}
        {flyingMarker && flyingMarker.visible && (
          <Source
            id="flying-marker"
            type="geojson"
            data={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: [flyingMarker.longitude, flyingMarker.latitude]
              }
            }}
          >
            <Layer
              id="flying-marker-layer"
              type="circle"
              paint={{
                'circle-radius': 10 * (flyingMarker?.pulseScale || 1),
                'circle-color': '#EF4444',
                'circle-stroke-color': '#FFFFFF',
                'circle-stroke-width': 3,
                'circle-stroke-opacity': 1,
                'circle-opacity': 1,
                'circle-pitch-scale': 'viewport',
                'circle-pitch-alignment': 'viewport'
              }}
            />
          </Source>
        )}

        {/* Render location markers */}
        {locations.map((location, index) => {
          const colorIndex = location.colorIndex ?? index;
          const markerColor = MARKER_COLORS[colorIndex % MARKER_COLORS.length];

          return (
            <Marker
              key={location.id}
              longitude={location.lng}
              latitude={location.lat}
              anchor="bottom"
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    backgroundColor: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    marginBottom: '4px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#333',
                    maxWidth: '120px',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {location.name}
                </div>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: markerColor,
                    border: '3px solid white',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  }}
                />
              </div>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}