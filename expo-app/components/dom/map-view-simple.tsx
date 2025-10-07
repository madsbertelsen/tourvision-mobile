'use dom';

import type { RouteWithMetadata } from '@/contexts/MockContext';
import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import MapGL from 'react-map-gl/mapbox';
import { calculateEdgeLabels, type EdgeGridData } from './edge-label-layout';
import HexGridOverlay from './hex-grid-overlay';

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

// Helper function to convert hex color to RGB array
function hexToRgb(hex: string, alpha: number = 1): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, alpha * 255];
}

// Get route style based on profile
function getRouteStyle(profile: string) {
  return {
    color: ROUTE_COLORS[profile as keyof typeof ROUTE_COLORS] || '#6B7280',
    width: profile === 'walking' ? 3 : 4,
    dasharray: profile === 'walking' ? [2, 2] : profile === 'cycling' ? [4, 2] : undefined,
  };
}


// Easing function for smooth animations
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
  showItinerary?: boolean;
  selectedLocationModal?: Location | null;
  onCloseModal?: () => void;
}

// Inner component to handle edge labels and itinerary overlay
function MapContent({
  locations,
  focusedLocation,
  isAnimating,
  viewState,
  routes,
  selectedAlternatives,
  setSelectedAlternatives,
  showItinerary,
  deckRef,
  selectedLocationModal,
}: {
  locations: Location[],
  focusedLocation: FocusedLocation | null,
  isAnimating: boolean,
  viewState: { longitude: number; latitude: number; zoom: number },
  routes: RouteWithMetadata[],
  selectedAlternatives: Map<string, string>,
  setSelectedAlternatives: React.Dispatch<React.SetStateAction<Map<string, string>>>,
  showItinerary: boolean,
  deckRef: React.RefObject<any>,
  selectedLocationModal: Location | null,
}) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  // Expanded groups state (selectedAlternatives is now passed as prop from parent)
  const [expandedGroups, setExpandedGroups] = useState(() => new Set<string>());

  // Edge-based grid state
  const [edgeGridData, setEdgeGridData] = useState<EdgeGridData>({
    labels: [],
    edgePositions: [],
    availableEdgePositions: [],
    usedEdgeIds: new Set(),
  });

  // Grid translation state for smooth panning
  const [gridTranslate, setGridTranslate] = useState({ x: 0, y: 0 });
  const prevCenterRef = useRef<{ lng: number; lat: number } | null>(null);
  const prevZoomRef = useRef<number>(viewState.zoom);

  // Zoom animation state
  const [isZoomAnimating, setIsZoomAnimating] = useState(false);
  const zoomAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track if we're waiting for grid recalculation
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Track previous grid data for smooth transitions
  const prevEdgeGridDataRef = useRef<EdgeGridData | null>(null);
  const [shouldAnimateLabels, setShouldAnimateLabels] = useState(false);

  // Track viewport size
  useEffect(() => {
    if (!deckRef.current) return;

    const updateSize = () => {
      const deck = deckRef.current?.deck;
      if (deck) {
        const canvas = deck.canvas;
        if (canvas) {
          setViewportSize({
            width: canvas.width,
            height: canvas.height,
          });
        }
      }
    };

    updateSize();

    // Update on window resize
    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
    };
  }, [deckRef]);

  // Update grid translation during panning for smooth movement
  useEffect(() => {
    if (!deckRef.current) return;

    const currentCenter = { lng: viewState.longitude, lat: viewState.latitude };
    const currentZoom = viewState.zoom;

    // If zoom changed, trigger animation and reset translation
    if (prevZoomRef.current !== currentZoom) {
      setGridTranslate({ x: 0, y: 0 });
      prevCenterRef.current = currentCenter;
      prevZoomRef.current = currentZoom;

      // Start zoom animation
      setIsZoomAnimating(true);

      // Clear any existing timeout
      if (zoomAnimationTimeoutRef.current) {
        clearTimeout(zoomAnimationTimeoutRef.current);
      }

      // End animation after transition duration
      zoomAnimationTimeoutRef.current = setTimeout(() => {
        setIsZoomAnimating(false);
      }, 300); // Match CSS transition duration

      return;
    }

    // Skip panning updates during zoom animation
    if (isZoomAnimating) {
      return;
    }

    // If we have a previous center, calculate the pixel delta (panning only)
    if (prevCenterRef.current && deckRef.current?.deck) {
      const viewport = deckRef.current.deck.getViewports()[0];

      const prevPoint = viewport.project([prevCenterRef.current.lng, prevCenterRef.current.lat]);
      const currentPoint = viewport.project([currentCenter.lng, currentCenter.lat]);

      // Invert delta: when map center moves right, grid should move left (and vice versa)
      const deltaX = prevPoint[0] - currentPoint[0];
      const deltaY = prevPoint[1] - currentPoint[1];

      // Update translation offset
      setGridTranslate(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
    }

    prevCenterRef.current = currentCenter;
  }, [deckRef, viewState.longitude, viewState.latitude, viewState.zoom, isZoomAnimating]);

  // Calculate edge-based labels - recalculate when viewport, locations, or zoom changes
  useEffect(() => {
    if (!deckRef.current || !locations.length || viewportSize.width === 0) {
      setEdgeGridData({
        labels: [],
        edgePositions: [],
        availableEdgePositions: [],
        usedEdgeIds: new Set(),
      });
      setIsRecalculating(false);
      return;
    }

    // Store current grid data before recalculating
    prevEdgeGridDataRef.current = edgeGridData.labels.length > 0 ? edgeGridData : null;

    // Mark as recalculating
    setIsRecalculating(true);

    const recalculate = () => {
      const deck = deckRef.current?.deck;
      if (!deck) return;

      const viewport = deck.getViewports()[0];

      const mapProjection = (lng: number, lat: number) => {
        try {
          const point = viewport.project([lng, lat]);
          return { x: point[0], y: point[1] };
        } catch {
          return null;
        }
      };

      const newGridData = calculateEdgeLabels(
        locations,
        mapProjection,
        viewportSize.width,
        viewportSize.height,
        MARKER_COLORS,
        routes
      );

      setEdgeGridData(newGridData);

      // Reset translation after recalculation
      setGridTranslate({ x: 0, y: 0 });
      prevCenterRef.current = { lng: viewState.longitude, lat: viewState.latitude };

      // Mark recalculation complete and trigger animation
      setIsRecalculating(false);
      setShouldAnimateLabels(true);

      // Reset animation flag after transition completes
      setTimeout(() => {
        setShouldAnimateLabels(false);
      }, 300);
    };

    // Recalculate immediately on zoom change
    const timeoutId = setTimeout(recalculate, 0);

    return () => clearTimeout(timeoutId);
  }, [deckRef, locations, routes, viewportSize, viewState.zoom]);

  // Cleanup zoom animation timeout on unmount
  useEffect(() => {
    return () => {
      if (zoomAnimationTimeoutRef.current) {
        clearTimeout(zoomAnimationTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Itinerary Overlay - Top Left */}
      {showItinerary && locations.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          padding: '12px',
          maxHeight: '300px',
          overflowY: 'auto',
          minWidth: '200px',
          maxWidth: '280px',
          pointerEvents: 'auto',
          zIndex: 10,
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#1f2937',
            marginBottom: '8px',
            borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
            paddingBottom: '6px',
          }}>
            Itinerary
          </div>

          {(() => {
            // Detect alternative destinations
            // Build groups: locations with routes from same origin are alternatives
            const processedIndices = new Set<number>();
            const renderItems: JSX.Element[] = [];
            let sequentialNumber = 1;

            locations.forEach((location, index) => {
              if (processedIndices.has(index)) return;

              // Check if there are multiple locations with routes from this location
              const routesFromHere = routes.filter(r => r.fromId === location.id);
              const alternativeLocationIds = routesFromHere.map(r => r.toId);

              // Find which of the next locations are alternatives (have route from current location)
              const alternatives: Array<{ location: Location; index: number; route: RouteWithMetadata }> = [];
              for (let i = index + 1; i < locations.length; i++) {
                if (processedIndices.has(i)) continue;
                const loc = locations[i];
                const routeToLoc = routesFromHere.find(r => r.toId === loc.id);
                if (routeToLoc) {
                  alternatives.push({ location: loc, index: i, route: routeToLoc });
                }
              }

              // Find route to next location (for non-alternatives)
              const nextLocation = locations[index + 1];
              const routeToNext = nextLocation && !alternativeLocationIds.includes(nextLocation.id)
                ? routes.find(r => r.fromId === location.id && r.toId === nextLocation.id)
                : null;

              // Helper functions
              const getTransportIcon = (profile: string) => {
                switch (profile) {
                  case 'driving': return '🚗';
                  case 'walking': return '🚶';
                  case 'cycling': return '🚴';
                  case 'transit': return '🚇';
                  default: return '→';
                }
              };

              const formatDuration = (seconds?: number) => {
                if (!seconds) return '';
                const minutes = Math.round(seconds / 60);
                if (minutes < 60) return `${minutes} min`;
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
              };

              const formatDistance = (meters?: number) => {
                if (!meters) return '';
                if (meters < 1000) return `${Math.round(meters)}m`;
                return `${(meters / 1000).toFixed(1)}km`;
              };

              const renderLocationItem = (loc: Location, number: string, isAlternative = false) => {
                const markerColor = loc.colorIndex !== undefined
                  ? MARKER_COLORS[loc.colorIndex % MARKER_COLORS.length]
                  : MARKER_COLORS[0];

                // Create light background color (20% opacity)
                const backgroundColor = `${markerColor}33`;

                return (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '4px',
                  }}>
                    {/* Location name with colored background */}
                    <div style={{
                      fontSize: '12px',
                      fontWeight: isAlternative ? '400' : '500',
                      color: '#1f2937',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      backgroundColor: backgroundColor,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      opacity: isAlternative ? 0.7 : 1,
                    }}>
                      {loc.name.split(',')[0]}
                    </div>
                  </div>
                );
              };

              // Mark location as processed
              processedIndices.add(index);

              // Render current location
              renderItems.push(
                <div key={location.id}>
                  {renderLocationItem(location, `${sequentialNumber}.`)}
                </div>
              );

              // Render route to next (if not alternatives) - AFTER the location
              if (routeToNext) {
                renderItems.push(
                  <div key={`route-${location.id}-${nextLocation.id}`} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginLeft: '16px',
                    marginBottom: '8px',
                    paddingLeft: '8px',
                    borderLeft: `2px solid ${ROUTE_COLORS[routeToNext.profile] || '#9CA3AF'}`,
                  }}>
                    <span style={{ fontSize: '12px' }}>
                      {getTransportIcon(routeToNext.profile)}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: '#6b7280',
                    }}>
                      {formatDuration(routeToNext.duration)}
                      {routeToNext.distance && ` · ${formatDistance(routeToNext.distance)}`}
                    </span>
                  </div>
                );
              }

              // Handle alternatives - show selected one with indicator
              if (alternatives.length > 0) {
                // Create group ID for this alternative set
                const groupId = `alt-${location.id}`;

                // Auto-select first alternative if not already selected
                if (!selectedAlternatives.has(groupId)) {
                  setSelectedAlternatives(prev => new Map(prev).set(groupId, alternatives[0].location.id));
                }

                const selectedAltId = selectedAlternatives.get(groupId) || alternatives[0].location.id;
                const selectedAlt = alternatives.find(a => a.location.id === selectedAltId) || alternatives[0];
                const isExpanded = expandedGroups.has(groupId);

                // Mark all alternatives as processed
                alternatives.forEach(alt => processedIndices.add(alt.index));

                // Render route for selected alternative FIRST (between origin and destination)
                renderItems.push(
                  <div key={`route-alt-${groupId}`} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginLeft: '16px',
                    marginBottom: '8px',
                    paddingLeft: '8px',
                    borderLeft: `2px solid ${ROUTE_COLORS[selectedAlt.route.profile] || '#9CA3AF'}`,
                  }}>
                    <span style={{ fontSize: '12px' }}>
                      {getTransportIcon(selectedAlt.route.profile)}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: '#6b7280',
                    }}>
                      {formatDuration(selectedAlt.route.duration)}
                      {selectedAlt.route.distance && ` · ${formatDistance(selectedAlt.route.distance)}`}
                    </span>
                  </div>
                );

                // Then render selected alternative location
                renderItems.push(
                  <div key={`${groupId}-selected`}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setExpandedGroups(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(groupId)) {
                          newSet.delete(groupId);
                        } else {
                          newSet.add(groupId);
                        }
                        return newSet;
                      });
                    }}>
                      {renderLocationItem(selectedAlt.location, `${sequentialNumber}.`)}

                      {/* Badge indicator - only show if there are actually alternatives */}
                      {alternatives.length > 1 && (
                        <span style={{
                          fontSize: '9px',
                          color: '#6B7280',
                          backgroundColor: '#F3F4F6',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          fontWeight: '500',
                          whiteSpace: 'nowrap',
                          marginLeft: '-4px',
                        }}>
                          +{alternatives.length - 1} more
                        </span>
                      )}
                    </div>

                    {/* Expanded view showing all alternatives */}
                    {isExpanded && (
                      <div style={{
                        marginLeft: '16px',
                        marginBottom: '8px',
                        backgroundColor: 'rgba(249, 250, 251, 0.9)',
                        borderRadius: '8px',
                        padding: '8px',
                        border: '1px solid #E5E7EB',
                      }}>
                        <div style={{
                          fontSize: '10px',
                          color: '#6B7280',
                          fontWeight: '600',
                          marginBottom: '6px',
                        }}>
                          Alternatives:
                        </div>

                        {alternatives.map((alt) => {
                          const isSelected = alt.location.id === selectedAltId;
                          return (
                            <div
                              key={alt.location.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAlternatives(prev => new Map(prev).set(groupId, alt.location.id));
                                setExpandedGroups(prev => {
                                  const newSet = new Set(prev);
                                  newSet.delete(groupId);
                                  return newSet;
                                });
                              }}
                              style={{
                                padding: '6px',
                                borderRadius: '6px',
                                backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                cursor: 'pointer',
                                marginBottom: '4px',
                                border: isSelected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                              }}
                            >
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}>
                                {isSelected && (
                                  <span style={{ fontSize: '12px', color: '#3B82F6' }}>✓</span>
                                )}
                                <div style={{ flex: 1 }}>
                                  <div style={{
                                    fontSize: '11px',
                                    fontWeight: isSelected ? '600' : '400',
                                    color: '#1f2937',
                                    marginBottom: '2px',
                                  }}>
                                    {alt.location.name.split(',')[0]}
                                  </div>
                                  <div style={{
                                    fontSize: '10px',
                                    color: '#6b7280',
                                  }}>
                                    {getTransportIcon(alt.route.profile)} {formatDuration(alt.route.duration)}
                                    {alt.route.distance && ` · ${formatDistance(alt.route.distance)}`}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              sequentialNumber++;
            });

            return renderItems;
          })()}
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
  showItinerary = false,
  selectedLocationModal = null,
  onCloseModal,
}: MapViewSimpleProps) {

  // Simple controlled viewState - no animations
  const [viewState, setViewState] = useState({
    longitude: center.lng,
    latitude: center.lat,
    zoom: zoom,
    pitch: 0,
    bearing: 0,
  });

  // Saved view state for restoration when unfocusing
  const [savedViewState, setSavedViewState] = useState<{
    longitude: number;
    latitude: number;
    zoom: number;
  } | null>(null);

  // Alternative destination selection state (lifted from MapContent)
  const [selectedAlternatives, setSelectedAlternatives] = useState(() => new Map<string, string>());

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

  // Container ref and dimensions for hex grid
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDims, setContainerDims] = useState({ width: 0, height: 0 });

  // Animation state
  const animationRef = useRef<{
    frameId?: number;
    startTime?: number;
    startState?: { longitude: number; latitude: number; zoom: number };
    targetState?: { longitude: number; latitude: number; zoom: number };
    duration: number;
  } | null>(null);

  const deckRef = useRef<any>(null);

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
        pitch: 0,
        bearing: 0,
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

  // Update container dimensions for hex grid
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setContainerDims({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Track previous selectedLocationModal to detect changes
  const prevSelectedLocationModalRef = useRef<Location | null>(null);

  // Zoom to selected location modal
  useEffect(() => {
    const prevModal = prevSelectedLocationModalRef.current;
    const modalChanged =
      (!prevModal && selectedLocationModal) ||
      (prevModal && !selectedLocationModal) ||
      (prevModal && selectedLocationModal && prevModal.id !== selectedLocationModal.id);

    if (!modalChanged) {
      return;
    }

    if (selectedLocationModal) {
      // Save current view state before zooming
      setSavedViewState({
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
      });

      // Animate to the selected location with detail zoom level
      animateToLocation({
        longitude: selectedLocationModal.lng,
        latitude: selectedLocationModal.lat,
        zoom: 12, // Detail view
      });
    } else if (savedViewState) {
      // Restore previous view when modal is closed
      animateToLocation(savedViewState, true);
      setSavedViewState(null);
    }

    prevSelectedLocationModalRef.current = selectedLocationModal;
  }, [selectedLocationModal, animateToLocation, savedViewState, viewState]);

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

  // Build active itinerary considering selected alternatives
  const activeItinerary: Location[] = [];
  const processedIndices = new Set<number>();

  locations.forEach((location, index) => {
    if (processedIndices.has(index)) return;

    // Add current location to itinerary
    activeItinerary.push(location);
    processedIndices.add(index);

    // Check if there are alternatives from this location
    const routesFromHere = routes.filter(r => r.fromId === location.id);
    const alternativeLocationIds = routesFromHere.map(r => r.toId);

    // Find which of the next locations are alternatives
    const alternatives: Array<{ location: Location; index: number }> = [];
    for (let i = index + 1; i < locations.length; i++) {
      if (processedIndices.has(i)) continue;
      const loc = locations[i];
      if (alternativeLocationIds.includes(loc.id)) {
        alternatives.push({ location: loc, index: i });
      }
    }

    // If there are alternatives, get the selected one
    if (alternatives.length > 0) {
      const groupId = `alt-${location.id}`;
      const selectedAltId = selectedAlternatives.get(groupId) || alternatives[0].location.id;
      const selectedAlt = alternatives.find(a => a.location.id === selectedAltId) || alternatives[0];

      // Add selected alternative to itinerary
      activeItinerary.push(selectedAlt.location);
      // Mark all alternatives as processed
      alternatives.forEach(alt => processedIndices.add(alt.index));
    }
  });

  // Build set of active route pairs from the computed itinerary
  const activeRoutePairs = new Set<string>();
  for (let i = 0; i < activeItinerary.length - 1; i++) {
    const fromLoc = activeItinerary[i];
    const toLoc = activeItinerary[i + 1];
    activeRoutePairs.add(`${fromLoc.id}-${toLoc.id}`);
  }

  // Filter routes to only show those in active itinerary
  const activeRoutes = routes.filter((route) => {
    const pairKey = `${route.fromId}-${route.toId}`;
    return activeRoutePairs.has(pairKey);
  });

  // Create deck.gl layers
  const layers: any[] = [];

  // Route layers
  activeRoutes.forEach((route) => {
    if (!route.geometry || !route.geometry.coordinates) return;

    const routeStyle = getRouteStyle(route.profile);
    const isSelected = selectedRoute === route.id;
    const color = hexToRgb(routeStyle.color, isSelected ? 1 : 0.7);

    layers.push(new PathLayer({
      id: `route-${route.id}`,
      data: [{ path: route.geometry.coordinates }],
      getPath: (d: any) => d.path,
      getColor: color,
      getWidth: isSelected ? routeStyle.width + 2 : routeStyle.width,
      widthMinPixels: 2,
      pickable: false,
      capRounded: true,
      jointRounded: true,
      getDashArray: routeStyle.dasharray || undefined,
    }));
  });

  // Marker trail layer
  if (markerTrail.length > 1) {
    layers.push(new PathLayer({
      id: 'marker-trail',
      data: [{ path: markerTrail }],
      getPath: (d: any) => d.path,
      getColor: [239, 68, 68, 153], // #EF4444 with 0.6 opacity
      getWidth: 4,
      widthMinPixels: 4,
      pickable: false,
      capRounded: true,
      jointRounded: true,
    }));
  }

  // Flying marker shadow
  if (flyingMarker && flyingMarker.visible) {
    layers.push(new ScatterplotLayer({
      id: 'marker-shadow',
      data: [flyingMarker],
      getPosition: (d: any) => [d.longitude, d.latitude],
      getFillColor: [0, 0, 0, 51], // rgba(0, 0, 0, 0.2)
      getRadius: 15,
      radiusMinPixels: 15,
      radiusMaxPixels: 15,
      pickable: false,
      stroked: false,
      filled: true,
    }));
  }

  // Flying marker
  if (flyingMarker && flyingMarker.visible) {
    layers.push(new ScatterplotLayer({
      id: 'flying-marker',
      data: [flyingMarker],
      getPosition: (d: any) => [d.longitude, d.latitude],
      getFillColor: [239, 68, 68, 255], // #EF4444
      getRadius: 10 * (flyingMarker?.pulseScale || 1),
      radiusMinPixels: 10,
      radiusMaxPixels: 20,
      pickable: false,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 3,
      getLineColor: [255, 255, 255, 255],
    }));
  }

  // Location markers - small black dots
  layers.push(new ScatterplotLayer({
    id: 'location-markers',
    data: locations,
    getPosition: (d: Location) => [d.lng, d.lat],
    getFillColor: [0, 0, 0, 255],
    getRadius: 2,
    radiusMinPixels: 2,
    radiusMaxPixels: 2,
    pickable: false,
    stroked: false,
    filled: true,
  }));

  // Location labels - rendered with TextLayer for performance
  if (!selectedLocationModal) {
    layers.push(new TextLayer({
      id: 'location-labels',
      data: locations,
      getPosition: (d: Location) => [d.lng, d.lat],
      getText: (d: Location) => d.name.split(',')[0],
      getColor: [31, 41, 55, 255], // #1f2937
      getSize: 12,
      getPixelOffset: [20, 0], // 20px to the right of marker
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      background: true,
      getBackgroundColor: (d: Location) => {
        const index = locations.indexOf(d);
        const colorIndex = d.colorIndex ?? index;
        const color = MARKER_COLORS[colorIndex % MARKER_COLORS.length];
        // Convert hex to RGB with 20% opacity for background
        return hexToRgb(color, 0.2);
      },
      backgroundPadding: [4, 8], // vertical, horizontal padding
      billboard: false,
      pickable: false,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontWeight: 600,
    }));
  }

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  return (
    <div ref={containerRef} style={{width: "100%", height: "100%", position: "relative"}}>
      <DeckGL
        ref={deckRef}
        viewState={viewState}
        onViewStateChange={({ viewState }: any) => setViewState(viewState)}
        controller={true}
        layers={layers}
        onClick={handleMapClick}
        getCursor={({ isDragging }: any) => isDragging ? 'grabbing' : 'grab'}
      >
        <MapGL
          mapboxAccessToken={mapboxToken}
          mapStyle={selectedLocationModal ? "mapbox://styles/mapbox/standard" : "mapbox://styles/mapbox/light-v11"}
        />
      </DeckGL>

      {/* Render edge labels and itinerary overlay */}
      <MapContent
        locations={locations}
        focusedLocation={focusedLocation}
        isAnimating={isAnimating}
        viewState={viewState}
        routes={routes}
        selectedAlternatives={selectedAlternatives}
        setSelectedAlternatives={setSelectedAlternatives}
        showItinerary={showItinerary || false}
        deckRef={deckRef}
        selectedLocationModal={selectedLocationModal || null}
      />

      {/* Hexagonal Grid Overlay */}
      {selectedLocationModal && containerDims.width > 0 && deckRef.current && (() => {
        // Project lat/lng to screen coordinates
        const deck = deckRef.current.deck;
        if (!deck) return null;

        const viewport = deck.getViewports()[0];
        const [x, y] = viewport.project([selectedLocationModal.lng, selectedLocationModal.lat]);

        return (
          <HexGridOverlay
            width={containerDims.width}
            height={containerDims.height}
            focusedLocation={selectedLocationModal}
            locationScreenPos={{ x, y }}
            onClose={onCloseModal || (() => {})}
          />
        );
      })()}
    </div>
  );
}
