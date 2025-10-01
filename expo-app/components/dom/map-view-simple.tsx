'use dom';

import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/dist/mapbox';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

interface FocusedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
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
  focusedLocation?: FocusedLocation | null;
}

export default function MapViewSimple({
  locations = [],
  center = { lat: 0, lng: 0 },
  zoom = 2,
  style = { width: '100%', height: '400px' },
  focusedLocation = null,
}: MapViewSimpleProps) {

  // Simple controlled viewState - no animations
  const [viewState, setViewState] = useState({
    longitude: center.lng,
    latitude: center.lat,
    zoom: zoom,
  });

  // Saved view state for restoration when unfocusing
  const [savedViewState, setSavedViewState] = useState<{
    longitude: number;
    latitude: number;
    zoom: number;
  } | null>(null);

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
  const animateToLocation = useCallback((target: { longitude: number; latitude: number; zoom: number }, reverse = false) => {
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

      // Two-phase animation: pan first (60%), then zoom (40%)
      const panDuration = duration * 0.6;
      const zoomDuration = duration * 0.4;

      let newLongitude: number;
      let newLatitude: number;
      let newZoom: number;
      let markerLongitude: number;
      let markerLatitude: number;

      if (!reverse) {
        // Forward animation: Pan first, then zoom in
        if (elapsed < panDuration) {
          // Phase 1: Pan to target location (keep zoom constant)
          const panProgress = elapsed / panDuration;
          const panEased = easeInOutCubic(panProgress);

          // Camera pans at panEased rate
          newLongitude = startState.longitude + (target.longitude - startState.longitude) * panEased;
          newLatitude = startState.latitude + (target.latitude - startState.latitude) * panEased;
          newZoom = startState.zoom; // Keep zoom constant during pan

          // Marker moves ahead of camera by 20%
          const markerProgress = Math.min(panProgress + 0.2, 1);
          const markerEased = easeInOutCubic(markerProgress);
          markerLongitude = startState.longitude + (target.longitude - startState.longitude) * markerEased;
          markerLatitude = startState.latitude + (target.latitude - startState.latitude) * markerEased;
        } else {
          // Phase 2: Zoom in to detail view (keep position at target)
          const zoomElapsed = elapsed - panDuration;
          const zoomProgress = zoomElapsed / zoomDuration;
          const zoomEased = easeInOutCubic(zoomProgress);

          // Position stays at target
          newLongitude = target.longitude;
          newLatitude = target.latitude;

          // Zoom interpolates from start to target
          newZoom = startState.zoom + (target.zoom - startState.zoom) * zoomEased;

          // Marker stays at target location
          markerLongitude = target.longitude;
          markerLatitude = target.latitude;
        }
      } else {
        // Reverse animation: Zoom out first, then pan back
        if (elapsed < zoomDuration) {
          // Phase 1: Zoom out (keep position constant)
          const zoomProgress = elapsed / zoomDuration;
          const zoomEased = easeInOutCubic(zoomProgress);

          // Position stays at start
          newLongitude = startState.longitude;
          newLatitude = startState.latitude;

          // Zoom out
          newZoom = startState.zoom + (target.zoom - startState.zoom) * zoomEased;

          // Marker stays at start location
          markerLongitude = startState.longitude;
          markerLatitude = startState.latitude;
        } else {
          // Phase 2: Pan back to target location (keep zoom constant)
          const panElapsed = elapsed - zoomDuration;
          const panProgress = panElapsed / panDuration;
          const panEased = easeInOutCubic(panProgress);

          // Camera pans back
          newLongitude = startState.longitude + (target.longitude - startState.longitude) * panEased;
          newLatitude = startState.latitude + (target.latitude - startState.latitude) * panEased;
          newZoom = target.zoom; // Keep zoomed out during pan

          // Marker moves ahead of camera by 20%
          const markerProgress = Math.min(panProgress + 0.2, 1);
          const markerEased = easeInOutCubic(markerProgress);
          markerLongitude = startState.longitude + (target.longitude - startState.longitude) * markerEased;
          markerLatitude = startState.latitude + (target.latitude - startState.latitude) * markerEased;
        }
      }

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

  // Track previous focusedLocation to detect changes
  const prevFocusedLocationRef = useRef<FocusedLocation | null>(null);

  // Watch for focusedLocation changes
  useEffect(() => {
    const prevFocusedLocation = prevFocusedLocationRef.current;

    // Check if focusedLocation actually changed
    const focusedLocationChanged =
      (!prevFocusedLocation && focusedLocation) ||
      (prevFocusedLocation && !focusedLocation) ||
      (prevFocusedLocation && focusedLocation && prevFocusedLocation.id !== focusedLocation.id);

    if (!focusedLocationChanged) {
      return; // No change, don't animate
    }

    if (focusedLocation) {
      // Save current view state before animating to focused location
      console.log('Saving current view state before focusing:', viewState);
      setSavedViewState({ ...viewState });

      // Animate to the focused location with closer zoom (forward: pan then zoom)
      const targetState = {
        longitude: focusedLocation.lng,
        latitude: focusedLocation.lat,
        zoom: 12, // Zoom in closer for location details
      };
      console.log('Animating to focused location:', focusedLocation.name, targetState);
      animateToLocation(targetState, false);
    } else if (savedViewState) {
      // focusedLocation became null and we have a saved state - restore it (reverse: zoom out then pan)
      console.log('Restoring saved view state:', savedViewState);
      animateToLocation(savedViewState, true);
      setSavedViewState(null); // Clear after restoring
    }

    // Update the ref to track current focusedLocation
    prevFocusedLocationRef.current = focusedLocation;
  }, [focusedLocation]);

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
        onMove={(evt: any) => setViewState(evt.viewState)}
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