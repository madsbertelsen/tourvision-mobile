'use dom';

import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Map as MapGL, Marker, Source, Layer, useMap } from 'react-map-gl/dist/mapbox';
import { calculateHexagonalLabels, getHexagonPath, type HexGridData } from './hexagonal-label-layout';
import type { RouteWithMetadata } from '@/contexts/MockContext';

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

// Route colors based on transport profile
const ROUTE_COLORS = {
  walking: '#10B981', // Green
  driving: '#3B82F6', // Blue
  cycling: '#F59E0B', // Amber/Orange
  transit: '#8B5CF6', // Purple
};

// Get route style based on profile
function getRouteStyle(profile: string) {
  return {
    color: ROUTE_COLORS[profile as keyof typeof ROUTE_COLORS] || '#6B7280',
    width: profile === 'walking' ? 3 : 4,
    dasharray: profile === 'walking' ? [2, 2] : profile === 'cycling' ? [4, 2] : undefined,
  };
}

interface MapViewSimpleProps {
  locations?: Location[];
  center?: { lat: number; lng: number };
  zoom?: number;
  style?: React.CSSProperties;
  focusedLocation?: FocusedLocation | null;
  followMode?: boolean;
  routes?: RouteWithMetadata[];
  selectedRoute?: string | null;
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

  // Animation state: track which labels have been animated and their progress
  const animatedLabelsRef = useRef(new Set<string>());
  const [labelAnimations, setLabelAnimations] = useState(() => new Map<string, number>());
  const animationTimersRef = useRef(new Map<string, NodeJS.Timeout>());

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

  // Detect labels that are visible in viewport and haven't been animated yet
  useEffect(() => {
    if (!viewportSize.width || !viewportSize.height) return;

    // Check which labels are currently visible in viewport
    const visibleLabels = hexGridData.labels.filter(label => {
      // Check if label is within viewport bounds
      const inViewport =
        label.x >= 0 &&
        label.x <= viewportSize.width &&
        label.y >= 0 &&
        label.y <= viewportSize.height;

      // Only animate if visible and not yet animated
      return inViewport && !animatedLabelsRef.current.has(label.id);
    });

    if (visibleLabels.length === 0) return;

    // console.log('[Animation] Visible labels to animate:', visibleLabels.map(l => l.id));

    // Animate each visible label with stagger delay
    visibleLabels.forEach((label, index) => {
      const delay = index * 150; // 150ms stagger between animations

      const timer = setTimeout(() => {
        // console.log(`[Animation] Starting animation for label: ${label.id}`);

        // Mark as animated
        animatedLabelsRef.current.add(label.id);

        // Start animation by setting progress to 0
        setLabelAnimations(prev => new Map(prev).set(label.id, 0));

        // Animate progress from 0 to 1 over 3000ms (3 seconds)
        const startTime = Date.now();
        const duration = 3000;

        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);

          // console.log(`[Animation] ${label.id} progress: ${progress.toFixed(3)}`);
          setLabelAnimations(prev => new Map(prev).set(label.id, progress));

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            // console.log(`[Animation] Completed animation for label: ${label.id}`);
          }
        };

        requestAnimationFrame(animate);
      }, delay);

      animationTimersRef.current.set(label.id, timer);
    });

    // Cleanup timers on unmount
    return () => {
      animationTimersRef.current.forEach(timer => clearTimeout(timer));
      animationTimersRef.current.clear();
    };
  }, [hexGridData.labels, viewportSize, viewState.longitude, viewState.latitude, viewState.zoom]);

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
            {/* Define shadow filter for hexagons */}
            <defs>
              <filter id="hexagon-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3"/>
              </filter>
              <filter id="hexagon-shadow-strong" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.4"/>
              </filter>
            </defs>
            {/* Render hexagonal grid */}
            {hexGridData.hexagons.map(hex => {
              const isUsed = hexGridData.usedHexagonIds.has(hex.id);
              const isAvailable = hexGridData.availableHexagons.some(h => h.id === hex.id);

              // Find the label for this hexagon if it's used
              const hexLabel = isUsed ? hexGridData.labels.find(l => l.hexagonId === hex.id) : null;

              let hexScale = 1;
              let hexOpacity = hexLabel ? 0.8 : 0.2;

              if (hexLabel) {
                // Get animation progress - don't render if not animated yet
                const progress = labelAnimations.get(hexLabel.id);

                // Skip rendering if animation hasn't started yet
                if (progress === undefined) {
                  return null;
                }

                // console.log(`[Render] Hexagon ${hexLabel.id} progress: ${progress}`);

                // Hexagon explosion phase: 0.3-0.5 (900-1500ms of 3000ms)
                const hexProgress = Math.max(0, Math.min((progress - 0.3) / 0.2, 1));

                // Scale from 0.2 to 1.0 with bounce easing
                const t = hexProgress;
                const bounce = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                hexScale = 0.2 + bounce * 0.8;

                hexOpacity = hexProgress > 0 ? 0.8 : 0;
              }

              return (
                <g key={hex.id} transform={`translate(${hex.x}, ${hex.y})`}>
                  <path
                    d={getHexagonPath(0, 0, hexGridData.hexSize * hexScale)}
                    fill={hexLabel ? 'white' : 'none'}
                    fillOpacity={hexLabel ? 0.95 : 0}
                    stroke={hexLabel ? hexLabel.color : (isAvailable ? '#D1D5DB' : '#EF4444')}
                    strokeWidth={hexLabel ? 2.5 : 1}
                    strokeOpacity={hexOpacity}
                    filter={hexLabel ? 'url(#hexagon-shadow-strong)' : undefined}
                  />
                </g>
              );
            })}

            {/* Connection lines from labels to locations */}
            {hexGridData.labels.map(label => {
              // Get animation progress (0 = start, 1 = complete)
              const progress = labelAnimations.get(label.id);

              // Skip rendering if animation hasn't started yet
              if (progress === undefined) {
                return null;
              }

              // Line growth phase: 0-0.3 (0-900ms of 3000ms)
              const lineProgress = Math.min(progress / 0.3, 1);

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

              // Animated connection point (grows from location to hexagon)
              const currentX = label.locationX + (label.connectionPointX - label.locationX) * lineProgress;
              const currentY = label.locationY + (label.connectionPointY - label.locationY) * lineProgress;

              // Calculate polygon points for tapered line
              const x1 = label.locationX + px * thinWidth;
              const y1 = label.locationY + py * thinWidth;
              const x2 = label.locationX - px * thinWidth;
              const y2 = label.locationY - py * thinWidth;
              const x3 = currentX - px * (thinWidth + (thickWidth - thinWidth) * lineProgress);
              const y3 = currentY - py * (thinWidth + (thickWidth - thinWidth) * lineProgress);
              const x4 = currentX + px * (thinWidth + (thickWidth - thinWidth) * lineProgress);
              const y4 = currentY + py * (thinWidth + (thickWidth - thinWidth) * lineProgress);

              return (
                <polygon
                  key={`connection-${label.id}`}
                  points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
                  fill={label.color}
                  fillOpacity={lineProgress > 0 ? "0.8" : "0"}
                />
              );
            })}
          </svg>

          {/* Text labels on hexagons */}
          {hexGridData.labels.map(label => {
            // Get animation progress - skip if not animated yet
            const progress = labelAnimations.get(label.id);

            // Skip rendering if animation hasn't started yet
            if (progress === undefined) {
              return null;
            }

            // Text reveal phase: 0.5-0.8 (1500-2400ms of 3000ms)
            const textProgress = Math.max(0, Math.min((progress - 0.5) / 0.3, 1));

            // Scale from 0.8 to 1.0 and opacity from 0 to 1
            const textOpacity = textProgress;
            const textScale = 0.8 + textProgress * 0.2;

            return (
              <div
                key={`label-${label.id}`}
                style={{
                  position: 'absolute',
                  left: `${label.x}px`,
                  top: `${label.y}px`,
                  transform: `translate(-50%, -50%) scale(${textScale})`,
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  opacity: textOpacity,
                  transition: 'opacity 300ms ease-out, transform 300ms ease-out',
                }}
              >
                {/* Name label centered in hexagon */}
                <div style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#1f2937',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  padding: '4px 8px',
                  maxWidth: `${hexGridData.hexSize * 1.6}px`,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)',
                }}>
                  {label.name}
                </div>
              </div>
            );
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
  routes = [],
  selectedRoute = null,
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
      <MapGL
        {...viewState}
        onMove={(evt: any) => setViewState(evt.viewState)}
        onClick={handleMapClick}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
      >
        {/* Render route layers */}
        {routes.map((route) => {
          if (!route.geometry || !route.geometry.coordinates) return null;

          const routeStyle = getRouteStyle(route.profile);
          const isSelected = selectedRoute === route.id;

          return (
            <Source
              key={`route-${route.id}`}
              id={`route-${route.id}`}
              type="geojson"
              data={{
                type: 'Feature',
                properties: {
                  profile: route.profile,
                  distance: route.distance,
                  duration: route.duration,
                },
                geometry: route.geometry
              }}
            >
              <Layer
                id={`route-line-${route.id}`}
                type="line"
                paint={{
                  'line-color': routeStyle.color,
                  'line-width': isSelected ? routeStyle.width + 2 : routeStyle.width,
                  'line-opacity': isSelected ? 1 : 0.7,
                  'line-dasharray': routeStyle.dasharray || [1, 0],
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
            </Source>
          );
        })}

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
      </MapGL>
    </div>
  );
}