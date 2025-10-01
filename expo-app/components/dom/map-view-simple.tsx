'use dom';

import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Map, { Marker, Source, Layer, useMap } from 'react-map-gl/dist/mapbox';
import { calculateHexagonalLabels, getHexagonPath, type HexGridData } from './hexagonal-label-layout';

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
  photoName?: string;
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
  followMode?: boolean;
}

// Inner component to access map instance
function MapContent({ locations, focusedLocation, isAnimating, viewState }: {
  locations: Location[],
  focusedLocation: FocusedLocation | null,
  isAnimating: boolean,
  viewState: { longitude: number; latitude: number; zoom: number }
}) {
  const { current: map } = useMap();
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  // Track viewport size
  useEffect(() => {
    if (!map) return;

    const updateSize = () => {
      const container = map.getContainer();
      setViewportSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    map.on('resize', updateSize);
    return () => {
      map.off('resize', updateSize);
    };
  }, [map]);

  // Calculate hexagonal grid and labels - recalculate when viewState changes
  const hexGridData = useMemo(() => {
    if (!map || !locations.length || viewportSize.width === 0) {
      return {
        labels: [],
        hexagons: [],
        hexSize: 0,
        availableHexagons: [],
        usedHexagonIds: new Set<string>(),
      };
    }

    const mapProjection = (lng: number, lat: number) => {
      try {
        const point = map.project([lng, lat]);
        return { x: point.x, y: point.y };
      } catch {
        return null;
      }
    };

    return calculateHexagonalLabels(
      locations,
      mapProjection,
      viewportSize.width,
      viewportSize.height,
      MARKER_COLORS
    );
  }, [map, locations, viewportSize, viewState.longitude, viewState.latitude, viewState.zoom]);

  return (
    <>
      {/* Location markers - small black dots */}
      {locations.map((location) => (
        <Marker
          key={location.id}
          longitude={location.lng}
          latitude={location.lat}
          anchor="center"
        >
          <div
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: 'black',
            }}
          />
        </Marker>
      ))}

      {/* Hexagonal grid, labels and connection lines - only show when not animating */}
      {!isAnimating && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <svg style={{ width: '100%', height: '100%', position: 'absolute' }}>
            {/* Render hexagonal grid */}
            {hexGridData.hexagons.map(hex => {
              const isUsed = hexGridData.usedHexagonIds.has(hex.id);
              const isAvailable = hexGridData.availableHexagons.some(h => h.id === hex.id);

              // Find the label for this hexagon if it's used
              const hexLabel = isUsed ? hexGridData.labels.find(l => l.hexagonId === hex.id) : null;

              return (
                <path
                  key={hex.id}
                  d={getHexagonPath(hex.x, hex.y, hexGridData.hexSize)}
                  fill={hexLabel ? 'white' : 'none'}
                  fillOpacity={hexLabel ? 0.9 : 0}
                  stroke={hexLabel ? hexLabel.color : (isAvailable ? '#D1D5DB' : '#EF4444')}
                  strokeWidth={hexLabel ? 2 : 1}
                  strokeOpacity={hexLabel ? 0.8 : 0.2}
                />
              );
            })}

            {/* Connection lines from labels to locations */}
            {hexGridData.labels.map(label => {
              // Calculate perpendicular offsets for tapering
              const dx = label.connectionPointX - label.locationX;
              const dy = label.connectionPointY - label.locationY;
              const length = Math.sqrt(dx * dx + dy * dy);

              // Normalize direction
              const nx = dx / length;
              const ny = dy / length;

              // Perpendicular direction (rotate 90 degrees)
              const px = -ny;
              const py = nx;

              // Width at each end
              const thinWidth = 0.5; // Thin end at location (1px total width)
              const thickWidth = 1.5; // Thick end at hexagon (3px total width)

              // Calculate polygon points for tapered line
              const x1 = label.locationX + px * thinWidth;
              const y1 = label.locationY + py * thinWidth;
              const x2 = label.locationX - px * thinWidth;
              const y2 = label.locationY - py * thinWidth;
              const x3 = label.connectionPointX - px * thickWidth;
              const y3 = label.connectionPointY - py * thickWidth;
              const x4 = label.connectionPointX + px * thickWidth;
              const y4 = label.connectionPointY + py * thickWidth;

              return (
                <polygon
                  key={`connection-${label.id}`}
                  points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
                  fill={label.color}
                  fillOpacity="0.8"
                />
              );
            })}
          </svg>

          {/* Photos on hexagons */}
          {hexGridData.labels.map(label => {
            const photoUrl = label.photoName
              ? `https://places.googleapis.com/v1/${label.photoName}/media?maxHeightPx=400&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY}`
              : null;

            // Photo size - larger to fill more of the hexagon while keeping border visible
            const photoSize = hexGridData.hexSize * 0.85;

            return photoUrl ? (
              <div
                key={`label-${label.id}`}
                style={{
                  position: 'absolute',
                  left: `${label.x}px`,
                  top: `${label.y}px`,
                  transform: 'translate(-50%, -50%)',
                  width: `${photoSize * 2}px`,
                  height: `${photoSize * 2}px`,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                }}
              >
                {/* Photo hexagon */}
                <img
                  src={photoUrl}
                  alt={label.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    clipPath: 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)',
                    display: 'block',
                  }}
                />
                {/* Name label overlaid on bottom of photo */}
                <div style={{
                  position: 'absolute',
                  bottom: '10%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '10px',
                  fontWeight: '700',
                  color: 'white',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  maxWidth: '90%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
                }}>
                  {label.name}
                </div>
              </div>
            ) : null;
          })}
        </div>
      )}
    </>
  );
}

export default function MapViewSimple({
  locations = [],
  center = { lat: 0, lng: 0 },
  zoom = 2,
  style = { width: '100%', height: '400px' },
  focusedLocation = null,
  followMode = false,
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

  // Track if map is currently animating
  const [isAnimating, setIsAnimating] = useState(false);

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

    // Set animating flag to hide edge labels during animation
    setIsAnimating(true);

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

        // Clear animating flag to show edge labels again
        setIsAnimating(false);

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

  // Track previous bounds to prevent redundant animations
  const prevBoundsRef = useRef<string | null>(null);

  // Follow mode: auto-fit bounds to visible locations
  useEffect(() => {
    // Only auto-fit if followMode is enabled, we have locations, and no focused location
    if (!followMode || locations.length === 0 || focusedLocation) {
      return;
    }

    // Calculate bounding box for all locations
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    locations.forEach(loc => {
      minLat = Math.min(minLat, loc.lat);
      maxLat = Math.max(maxLat, loc.lat);
      minLng = Math.min(minLng, loc.lng);
      maxLng = Math.max(maxLng, loc.lng);
    });

    // Calculate center and zoom to fit all locations
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Calculate zoom level to fit bounds
    // Simple heuristic: larger span = lower zoom
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    const maxSpan = Math.max(latSpan, lngSpan);

    let targetZoom = 2; // Default world view
    if (maxSpan < 0.01) targetZoom = 14; // Very close locations
    else if (maxSpan < 0.05) targetZoom = 12;
    else if (maxSpan < 0.1) targetZoom = 11;
    else if (maxSpan < 0.5) targetZoom = 9;
    else if (maxSpan < 1) targetZoom = 8;
    else if (maxSpan < 5) targetZoom = 6;
    else if (maxSpan < 10) targetZoom = 5;
    else if (maxSpan < 20) targetZoom = 4;
    else if (maxSpan < 50) targetZoom = 3;

    const targetState = {
      longitude: centerLng,
      latitude: centerLat,
      zoom: targetZoom,
    };

    // Create a stable key for the bounds to detect actual changes
    const boundsKey = `${minLat.toFixed(4)},${maxLat.toFixed(4)},${minLng.toFixed(4)},${maxLng.toFixed(4)},${targetZoom}`;

    // Only animate if bounds actually changed
    if (prevBoundsRef.current === boundsKey) {
      return;
    }

    console.log('Follow mode: fitting bounds to locations', {
      locations: locations.length,
      bounds: { minLat, maxLat, minLng, maxLng },
      target: targetState
    });

    prevBoundsRef.current = boundsKey;

    // Smoothly animate to fit bounds
    animateToLocation(targetState, false);
  }, [locations, followMode, focusedLocation]);

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

        {/* Render edge labels and markers */}
        <MapContent
          locations={locations}
          focusedLocation={focusedLocation}
          isAnimating={isAnimating}
          viewState={viewState}
        />
      </Map>
    </div>
  );
}