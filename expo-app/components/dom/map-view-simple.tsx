'use dom';

import type { RouteWithMetadata } from '@/contexts/MockContext';
import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layer, Map as MapGL, Marker, Source, useMap } from 'react-map-gl/dist/mapbox';
import { calculateEdgeLabels, type EdgeGridData } from './edge-label-layout';

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
}

// Inner component to access map instance
function MapContent({ locations, focusedLocation, isAnimating, viewState, routes, selectedAlternatives, setSelectedAlternatives, showItinerary }: {
  locations: Location[],
  focusedLocation: FocusedLocation | null,
  isAnimating: boolean,
  viewState: { longitude: number; latitude: number; zoom: number },
  routes: RouteWithMetadata[],
  selectedAlternatives: Map<string, string>,
  setSelectedAlternatives: React.Dispatch<React.SetStateAction<Map<string, string>>>,
  showItinerary: boolean
}) {
  const { current: map } = useMap();
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

  // Update grid translation during panning for smooth movement
  useEffect(() => {
    if (!map) return;

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
    if (prevCenterRef.current) {
      const prevPoint = map.project([prevCenterRef.current.lng, prevCenterRef.current.lat]);
      const currentPoint = map.project([currentCenter.lng, currentCenter.lat]);

      // Invert delta: when map center moves right, grid should move left (and vice versa)
      const deltaX = prevPoint.x - currentPoint.x;
      const deltaY = prevPoint.y - currentPoint.y;

      // Update translation offset
      setGridTranslate(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
    }

    prevCenterRef.current = currentCenter;
  }, [map, viewState.longitude, viewState.latitude, viewState.zoom, isZoomAnimating]);

  // Calculate edge-based labels - recalculate when viewport, locations, or zoom changes
  useEffect(() => {
    if (!map || !locations.length || viewportSize.width === 0) {
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
      const mapProjection = (lng: number, lat: number) => {
        try {
          const point = map.project([lng, lat]);
          return { x: point.x, y: point.y };
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
  }, [map, locations, routes, viewportSize, viewState.zoom]);

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

      {/* Connection lines overlay - rendered as SVG */}
      {!isAnimating && !isZoomAnimating && edgeGridData.labels.length > 0 && (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <g
            transform={`translate(${gridTranslate.x}, ${gridTranslate.y})`}
          >
            {/* Connection lines from labels to locations */}
            {edgeGridData.labels.map(label => {
              // Calculate tapered line path
              const dx = label.locationX - label.x;
              const dy = label.locationY - label.y;
              const angle = Math.atan2(dy, dx);
              const perpAngle = angle + Math.PI / 2;

              // Width at label end and location end
              const labelWidth = 4;
              const locationWidth = 1;

              // Calculate perpendicular offsets
              const labelOffset = {
                x: Math.cos(perpAngle) * labelWidth / 2,
                y: Math.sin(perpAngle) * labelWidth / 2,
              };
              const locationOffset = {
                x: Math.cos(perpAngle) * locationWidth / 2,
                y: Math.sin(perpAngle) * locationWidth / 2,
              };

              // Create 4 points for the tapered line
              const points = [
                { x: label.x - labelOffset.x, y: label.y - labelOffset.y },
                { x: label.x + labelOffset.x, y: label.y + labelOffset.y },
                { x: label.locationX + locationOffset.x, y: label.locationY + locationOffset.y },
                { x: label.locationX - locationOffset.x, y: label.locationY - locationOffset.y },
              ];

              const pathData = `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} L ${points[2].x} ${points[2].y} L ${points[3].x} ${points[3].y} Z`;

              return (
                <path
                  key={`line-${label.id}`}
                  d={pathData}
                  fill="black"
                  fillOpacity="0.6"
                />
              );
            })}
          </g>
        </svg>
      )}

      {/* Edge-based label overlays */}
      {!isAnimating && !isZoomAnimating && edgeGridData.labels.map(label => {
        // Create light background color (20% opacity like text and itinerary)
        const backgroundColor = `${label.color}33`;

        return (
          <div
            key={`label-${label.id}`}
            style={{
              position: 'absolute',
              left: `${label.x + gridTranslate.x}px`,
              top: `${label.y + gridTranslate.y}px`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              padding: '0px',
              cursor: 'pointer',
              pointerEvents: 'auto',
              zIndex: 2,
              transition: shouldAnimateLabels ? 'left 300ms ease-out, top 300ms ease-out' : 'none',
            }}
          >
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#1f2937',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              padding: '6px 12px',
              backgroundColor: backgroundColor,
              borderRadius: '6px',
              maxWidth: '150px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {label.name}
            </div>
          </div>
        );
      })}

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
                      {loc.name}
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
                                    {alt.location.name}
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
    <div style={{width: "100%", height: "100%"}}>
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
.mapboxgl-map {
  -webkit-tap-highlight-color: #0000;
  font: 12px / 20px Helvetica Neue, Arial, Helvetica, sans-serif;
  position: relative;
  overflow: hidden;
}

.mapboxgl-canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.mapboxgl-map:-webkit-full-screen {
  width: 100%;
  height: 100%;
}

.mapboxgl-canary {
  background-color: salmon;
}

.mapboxgl-canvas-container.mapboxgl-interactive, .mapboxgl-ctrl-group button.mapboxgl-ctrl-compass {
  cursor: grab;
  -webkit-user-select: none;
  user-select: none;
}

.mapboxgl-canvas-container.mapboxgl-interactive.mapboxgl-track-pointer {
  cursor: pointer;
}

.mapboxgl-canvas-container.mapboxgl-interactive:active, .mapboxgl-ctrl-group button.mapboxgl-ctrl-compass:active {
  cursor: grabbing;
}

.mapboxgl-canvas-container.mapboxgl-touch-zoom-rotate, .mapboxgl-canvas-container.mapboxgl-touch-zoom-rotate .mapboxgl-canvas {
  touch-action: pan-x pan-y;
}

.mapboxgl-canvas-container.mapboxgl-touch-drag-pan, .mapboxgl-canvas-container.mapboxgl-touch-drag-pan .mapboxgl-canvas {
  touch-action: pinch-zoom;
}

.mapboxgl-canvas-container.mapboxgl-touch-zoom-rotate.mapboxgl-touch-drag-pan, .mapboxgl-canvas-container.mapboxgl-touch-zoom-rotate.mapboxgl-touch-drag-pan .mapboxgl-canvas {
  touch-action: none;
}

.mapboxgl-ctrl-bottom, .mapboxgl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-right, .mapboxgl-ctrl-left, .mapboxgl-ctrl-right, .mapboxgl-ctrl-top, .mapboxgl-ctrl-top-left, .mapboxgl-ctrl-top-right {
  pointer-events: none;
  z-index: 2;
  position: absolute;
}

.mapboxgl-ctrl-top-left {
  top: 0;
  left: 0;
}

.mapboxgl-ctrl-top {
  top: 0;
  left: 50%;
  transform: translateX(-50%);
}

.mapboxgl-ctrl-top-right {
  top: 0;
  right: 0;
}

.mapboxgl-ctrl-right {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}

.mapboxgl-ctrl-bottom-right {
  bottom: 0;
  right: 0;
}

.mapboxgl-ctrl-bottom {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
}

.mapboxgl-ctrl-bottom-left {
  bottom: 0;
  left: 0;
}

.mapboxgl-ctrl-left {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}

.mapboxgl-ctrl {
  clear: both;
  pointer-events: auto;
  transform: translate(0);
}

.mapboxgl-ctrl-top-left .mapboxgl-ctrl {
  float: left;
  margin: 10px 0 0 10px;
}

.mapboxgl-ctrl-top .mapboxgl-ctrl {
  float: left;
  margin: 10px 0;
}

.mapboxgl-ctrl-top-right .mapboxgl-ctrl {
  float: right;
  margin: 10px 10px 0 0;
}

.mapboxgl-ctrl-bottom-right .mapboxgl-ctrl, .mapboxgl-ctrl-right .mapboxgl-ctrl {
  float: right;
  margin: 0 10px 10px 0;
}

.mapboxgl-ctrl-bottom .mapboxgl-ctrl {
  float: left;
  margin: 10px 0;
}

.mapboxgl-ctrl-bottom-left .mapboxgl-ctrl, .mapboxgl-ctrl-left .mapboxgl-ctrl {
  float: left;
  margin: 0 0 10px 10px;
}

.mapboxgl-ctrl-group {
  background: #fff;
  border-radius: 4px;
}

.mapboxgl-ctrl-group:not(:empty) {
  box-shadow: 0 0 0 2px #0000001a;
}

@media (-ms-high-contrast: active) {
  .mapboxgl-ctrl-group:not(:empty) {
    box-shadow: 0 0 0 2px buttontext;
  }
}

.mapboxgl-ctrl-group button {
  background-color: initial;
  box-sizing: border-box;
  cursor: pointer;
  border: 0;
  outline: none;
  width: 29px;
  height: 29px;
  padding: 0;
  display: block;
  overflow: hidden;
}

.mapboxgl-ctrl-group button + button {
  border-top: 1px solid #ddd;
}

.mapboxgl-ctrl button .mapboxgl-ctrl-icon {
  background-position: 50%;
  background-repeat: no-repeat;
  width: 100%;
  height: 100%;
  display: block;
}

@media (-ms-high-contrast: active) {
  .mapboxgl-ctrl-icon {
    background-color: initial;
  }

  .mapboxgl-ctrl-group button + button {
    border-top: 1px solid buttontext;
  }
}

.mapboxgl-ctrl-attrib-button:focus, .mapboxgl-ctrl-group button:focus {
  box-shadow: 0 0 2px 2px #0096ff;
}

.mapboxgl-ctrl button:disabled {
  cursor: not-allowed;
}

.mapboxgl-ctrl button:disabled .mapboxgl-ctrl-icon {
  opacity: .25;
}

.mapboxgl-ctrl-group button:first-child {
  border-radius: 4px 4px 0 0;
}

.mapboxgl-ctrl-group button:last-child {
  border-radius: 0 0 4px 4px;
}

.mapboxgl-ctrl-group button:only-child {
  border-radius: inherit;
}

.mapboxgl-ctrl button:not(:disabled):hover {
  background-color: #0000000d;
}

.mapboxgl-ctrl-group button:focus:focus-visible {
  box-shadow: 0 0 2px 2px #0096ff;
}

.mapboxgl-ctrl-group button:focus:not(:focus-visible) {
  box-shadow: none;
}

.mapboxgl-ctrl button.mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23333' viewBox='0 0 29 29'%3E%3Cpath d='M10 13c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h9c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13h-9z'/%3E%3C/svg%3E");
}

.mapboxgl-ctrl button.mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23333' viewBox='0 0 29 29'%3E%3Cpath d='M14.5 8.5c-.75 0-1.5.75-1.5 1.5v3h-3c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h3v3c0 .75.75 1.5 1.5 1.5S16 19.75 16 19v-3h3c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13h-3v-3c0-.75-.75-1.5-1.5-1.5z'/%3E%3C/svg%3E");
}

@media (-ms-high-contrast: active) {
  .mapboxgl-ctrl button.mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23fff' viewBox='0 0 29 29'%3E%3Cpath d='M10 13c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h9c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13h-9z'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23fff' viewBox='0 0 29 29'%3E%3Cpath d='M14.5 8.5c-.75 0-1.5.75-1.5 1.5v3h-3c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h3v3c0 .75.75 1.5 1.5 1.5S16 19.75 16 19v-3h3c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13h-3v-3c0-.75-.75-1.5-1.5-1.5z'/%3E%3C/svg%3E");
  }
}

@media (-ms-high-contrast: black-on-white) {
  .mapboxgl-ctrl button.mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23000' viewBox='0 0 29 29'%3E%3Cpath d='M10 13c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h9c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13h-9z'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23000' viewBox='0 0 29 29'%3E%3Cpath d='M14.5 8.5c-.75 0-1.5.75-1.5 1.5v3h-3c-.75 0-1.5.75-1.5 1.5S9.25 16 10 16h3v3c0 .75.75 1.5 1.5 1.5S16 19.75 16 19v-3h3c.75 0 1.5-.75 1.5-1.5S19.75 13 19 13h-3v-3c0-.75-.75-1.5-1.5-1.5z'/%3E%3C/svg%3E");
  }
}

.mapboxgl-ctrl button.mapboxgl-ctrl-fullscreen .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23333' viewBox='0 0 29 29'%3E%3Cpath d='M24 16v5.5c0 1.75-.75 2.5-2.5 2.5H16v-1l3-1.5-4-5.5 1-1 5.5 4 1.5-3h1zM6 16l1.5 3 5.5-4 1 1-4 5.5 3 1.5v1H7.5C5.75 24 5 23.25 5 21.5V16h1zm7-11v1l-3 1.5 4 5.5-1 1-5.5-4L6 13H5V7.5C5 5.75 5.75 5 7.5 5H13zm11 2.5c0-1.75-.75-2.5-2.5-2.5H16v1l3 1.5-4 5.5 1 1 5.5-4 1.5 3h1V7.5z'/%3E%3C/svg%3E");
}

.mapboxgl-ctrl button.mapboxgl-ctrl-shrink .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29'%3E%3Cpath d='M18.5 16c-1.75 0-2.5.75-2.5 2.5V24h1l1.5-3 5.5 4 1-1-4-5.5 3-1.5v-1h-5.5zM13 18.5c0-1.75-.75-2.5-2.5-2.5H5v1l3 1.5L4 24l1 1 5.5-4 1.5 3h1v-5.5zm3-8c0 1.75.75 2.5 2.5 2.5H24v-1l-3-1.5L25 5l-1-1-5.5 4L17 5h-1v5.5zM10.5 13c1.75 0 2.5-.75 2.5-2.5V5h-1l-1.5 3L5 4 4 5l4 5.5L5 12v1h5.5z'/%3E%3C/svg%3E");
}

@media (-ms-high-contrast: active) {
  .mapboxgl-ctrl button.mapboxgl-ctrl-fullscreen .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23fff' viewBox='0 0 29 29'%3E%3Cpath d='M24 16v5.5c0 1.75-.75 2.5-2.5 2.5H16v-1l3-1.5-4-5.5 1-1 5.5 4 1.5-3h1zM6 16l1.5 3 5.5-4 1 1-4 5.5 3 1.5v1H7.5C5.75 24 5 23.25 5 21.5V16h1zm7-11v1l-3 1.5 4 5.5-1 1-5.5-4L6 13H5V7.5C5 5.75 5.75 5 7.5 5H13zm11 2.5c0-1.75-.75-2.5-2.5-2.5H16v1l3 1.5-4 5.5 1 1 5.5-4 1.5 3h1V7.5z'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-shrink .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23fff' viewBox='0 0 29 29'%3E%3Cpath d='M18.5 16c-1.75 0-2.5.75-2.5 2.5V24h1l1.5-3 5.5 4 1-1-4-5.5 3-1.5v-1h-5.5zM13 18.5c0-1.75-.75-2.5-2.5-2.5H5v1l3 1.5L4 24l1 1 5.5-4 1.5 3h1v-5.5zm3-8c0 1.75.75 2.5 2.5 2.5H24v-1l-3-1.5L25 5l-1-1-5.5 4L17 5h-1v5.5zM10.5 13c1.75 0 2.5-.75 2.5-2.5V5h-1l-1.5 3L5 4 4 5l4 5.5L5 12v1h5.5z'/%3E%3C/svg%3E");
  }
}

@media (-ms-high-contrast: black-on-white) {
  .mapboxgl-ctrl button.mapboxgl-ctrl-fullscreen .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23000' viewBox='0 0 29 29'%3E%3Cpath d='M24 16v5.5c0 1.75-.75 2.5-2.5 2.5H16v-1l3-1.5-4-5.5 1-1 5.5 4 1.5-3h1zM6 16l1.5 3 5.5-4 1 1-4 5.5 3 1.5v1H7.5C5.75 24 5 23.25 5 21.5V16h1zm7-11v1l-3 1.5 4 5.5-1 1-5.5-4L6 13H5V7.5C5 5.75 5.75 5 7.5 5H13zm11 2.5c0-1.75-.75-2.5-2.5-2.5H16v1l3 1.5-4 5.5 1 1 5.5-4 1.5 3h1V7.5z'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-shrink .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23000' viewBox='0 0 29 29'%3E%3Cpath d='M18.5 16c-1.75 0-2.5.75-2.5 2.5V24h1l1.5-3 5.5 4 1-1-4-5.5 3-1.5v-1h-5.5zM13 18.5c0-1.75-.75-2.5-2.5-2.5H5v1l3 1.5L4 24l1 1 5.5-4 1.5 3h1v-5.5zm3-8c0 1.75.75 2.5 2.5 2.5H24v-1l-3-1.5L25 5l-1-1-5.5 4L17 5h-1v5.5zM10.5 13c1.75 0 2.5-.75 2.5-2.5V5h-1l-1.5 3L5 4 4 5l4 5.5L5 12v1h5.5z'/%3E%3C/svg%3E");
  }
}

.mapboxgl-ctrl button.mapboxgl-ctrl-compass .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23333' viewBox='0 0 29 29'%3E%3Cpath d='M10.5 14l4-8 4 8h-8z'/%3E%3Cpath id='south' d='M10.5 16l4 8 4-8h-8z' fill='%23ccc'/%3E%3C/svg%3E");
}

@media (-ms-high-contrast: active) {
  .mapboxgl-ctrl button.mapboxgl-ctrl-compass .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23fff' viewBox='0 0 29 29'%3E%3Cpath d='M10.5 14l4-8 4 8h-8z'/%3E%3Cpath id='south' d='M10.5 16l4 8 4-8h-8z' fill='%23999'/%3E%3C/svg%3E");
  }
}

@media (-ms-high-contrast: black-on-white) {
  .mapboxgl-ctrl button.mapboxgl-ctrl-compass .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23000' viewBox='0 0 29 29'%3E%3Cpath d='M10.5 14l4-8 4 8h-8z'/%3E%3Cpath id='south' d='M10.5 16l4 8 4-8h-8z' fill='%23ccc'/%3E%3C/svg%3E");
  }
}

.mapboxgl-ctrl button.mapboxgl-ctrl-geolocate .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23333'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
}

.mapboxgl-ctrl button.mapboxgl-ctrl-geolocate:disabled .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23aaa'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' fill='%23f00'/%3E%3C/svg%3E");
}

.mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-active .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%2333b5e5'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
}

.mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-active-error .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23e58978'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
}

.mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-background .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%2333b5e5'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2' display='none'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
}

.mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-background-error .mapboxgl-ctrl-icon {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23e54e33'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2' display='none'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
}

.mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-waiting .mapboxgl-ctrl-icon {
  animation: 2s linear infinite mapboxgl-spin;
}

@media (-ms-high-contrast: active) {
  .mapboxgl-ctrl button.mapboxgl-ctrl-geolocate .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23fff'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-geolocate:disabled .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23999'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' fill='%23f00'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-active .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%2333b5e5'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-active-error .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23e58978'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-background .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%2333b5e5'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2' display='none'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-geolocate.mapboxgl-ctrl-geolocate-background-error .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23e54e33'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2' display='none'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
  }
}

@media (-ms-high-contrast: black-on-white) {
  .mapboxgl-ctrl button.mapboxgl-ctrl-geolocate .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23000'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' display='none'/%3E%3C/svg%3E");
  }

  .mapboxgl-ctrl button.mapboxgl-ctrl-geolocate:disabled .mapboxgl-ctrl-icon {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill='%23666'%3E%3Cpath d='M10 4C9 4 9 5 9 5v.1A5 5 0 0 0 5.1 9H5s-1 0-1 1 1 1 1 1h.1A5 5 0 0 0 9 14.9v.1s0 1 1 1 1-1 1-1v-.1a5 5 0 0 0 3.9-3.9h.1s1 0 1-1-1-1-1-1h-.1A5 5 0 0 0 11 5.1V5s0-1-1-1zm0 2.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 1 1 0-7z'/%3E%3Ccircle id='dot' cx='10' cy='10' r='2'/%3E%3Cpath id='stroke' d='M14 5l1 1-9 9-1-1 9-9z' fill='%23f00'/%3E%3C/svg%3E");
  }
}

@keyframes mapboxgl-spin {
  0% {
    transform: rotate(0);
  }

  to {
    transform: rotate(1turn);
  }
}

a.mapboxgl-ctrl-logo {
  cursor: pointer;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' fill-rule='evenodd' viewBox='0 0 88 23'%3E%3Cdefs%3E%3Cpath id='logo' d='M11.5 2.25c5.105 0 9.25 4.145 9.25 9.25s-4.145 9.25-9.25 9.25-9.25-4.145-9.25-9.25 4.145-9.25 9.25-9.25zM6.997 15.983c-.051-.338-.828-5.802 2.233-8.873a4.395 4.395 0 013.13-1.28c1.27 0 2.49.51 3.39 1.42.91.9 1.42 2.12 1.42 3.39 0 1.18-.449 2.301-1.28 3.13C12.72 16.93 7 16 7 16l-.003-.017zM15.3 10.5l-2 .8-.8 2-.8-2-2-.8 2-.8.8-2 .8 2 2 .8z'/%3E%3Cpath id='text' d='M50.63 8c.13 0 .23.1.23.23V9c.7-.76 1.7-1.18 2.73-1.18 2.17 0 3.95 1.85 3.95 4.17s-1.77 4.19-3.94 4.19c-1.04 0-2.03-.43-2.74-1.18v3.77c0 .13-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V8.23c0-.12.1-.23.23-.23h1.4zm-3.86.01c.01 0 .01 0 .01-.01.13 0 .22.1.22.22v7.55c0 .12-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V15c-.7.76-1.69 1.19-2.73 1.19-2.17 0-3.94-1.87-3.94-4.19 0-2.32 1.77-4.19 3.94-4.19 1.03 0 2.02.43 2.73 1.18v-.75c0-.12.1-.23.23-.23h1.4zm26.375-.19a4.24 4.24 0 00-4.16 3.29c-.13.59-.13 1.19 0 1.77a4.233 4.233 0 004.17 3.3c2.35 0 4.26-1.87 4.26-4.19 0-2.32-1.9-4.17-4.27-4.17zM60.63 5c.13 0 .23.1.23.23v3.76c.7-.76 1.7-1.18 2.73-1.18 1.88 0 3.45 1.4 3.84 3.28.13.59.13 1.2 0 1.8-.39 1.88-1.96 3.29-3.84 3.29-1.03 0-2.02-.43-2.73-1.18v.77c0 .12-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V5.23c0-.12.1-.23.23-.23h1.4zm-34 11h-1.4c-.13 0-.23-.11-.23-.23V8.22c.01-.13.1-.22.23-.22h1.4c.13 0 .22.11.23.22v.68c.5-.68 1.3-1.09 2.16-1.1h.03c1.09 0 2.09.6 2.6 1.55.45-.95 1.4-1.55 2.44-1.56 1.62 0 2.93 1.25 2.9 2.78l.03 5.2c0 .13-.1.23-.23.23h-1.41c-.13 0-.23-.11-.23-.23v-4.59c0-.98-.74-1.71-1.62-1.71-.8 0-1.46.7-1.59 1.62l.01 4.68c0 .13-.11.23-.23.23h-1.41c-.13 0-.23-.11-.23-.23v-4.59c0-.98-.74-1.71-1.62-1.71-.85 0-1.54.79-1.6 1.8v4.5c0 .13-.1.23-.23.23zm53.615 0h-1.61c-.04 0-.08-.01-.12-.03-.09-.06-.13-.19-.06-.28l2.43-3.71-2.39-3.65a.213.213 0 01-.03-.12c0-.12.09-.21.21-.21h1.61c.13 0 .24.06.3.17l1.41 2.37 1.4-2.37a.34.34 0 01.3-.17h1.6c.04 0 .08.01.12.03.09.06.13.19.06.28l-2.37 3.65 2.43 3.7c0 .05.01.09.01.13 0 .12-.09.21-.21.21h-1.61c-.13 0-.24-.06-.3-.17l-1.44-2.42-1.44 2.42a.34.34 0 01-.3.17zm-7.12-1.49c-1.33 0-2.42-1.12-2.42-2.51 0-1.39 1.08-2.52 2.42-2.52 1.33 0 2.42 1.12 2.42 2.51 0 1.39-1.08 2.51-2.42 2.52zm-19.865 0c-1.32 0-2.39-1.11-2.42-2.48v-.07c.02-1.38 1.09-2.49 2.4-2.49 1.32 0 2.41 1.12 2.41 2.51 0 1.39-1.07 2.52-2.39 2.53zm-8.11-2.48c-.01 1.37-1.09 2.47-2.41 2.47s-2.42-1.12-2.42-2.51c0-1.39 1.08-2.52 2.4-2.52 1.33 0 2.39 1.11 2.41 2.48l.02.08zm18.12 2.47c-1.32 0-2.39-1.11-2.41-2.48v-.06c.02-1.38 1.09-2.48 2.41-2.48s2.42 1.12 2.42 2.51c0 1.39-1.09 2.51-2.42 2.51z'/%3E%3C/defs%3E%3Cmask id='clip'%3E%3Crect x='0' y='0' width='100%25' height='100%25' fill='white'/%3E%3Cuse xlink:href='%23logo'/%3E%3Cuse xlink:href='%23text'/%3E%3C/mask%3E%3Cg id='outline' opacity='0.3' stroke='%23000' stroke-width='3'%3E%3Ccircle mask='url(%23clip)' cx='11.5' cy='11.5' r='9.25'/%3E%3Cuse xlink:href='%23text' mask='url(%23clip)'/%3E%3C/g%3E%3Cg id='fill' opacity='0.9' fill='%23fff'%3E%3Cuse xlink:href='%23logo'/%3E%3Cuse xlink:href='%23text'/%3E%3C/g%3E%3C/svg%3E");
  background-repeat: no-repeat;
  width: 88px;
  height: 23px;
  margin: 0 0 -4px -4px;
  display: block;
  overflow: hidden;
}

a.mapboxgl-ctrl-logo.mapboxgl-compact {
  width: 23px;
}

@media (-ms-high-contrast: active) {
  a.mapboxgl-ctrl-logo {
    background-color: initial;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' fill-rule='evenodd' viewBox='0 0 88 23'%3E%3Cdefs%3E%3Cpath id='logo' d='M11.5 2.25c5.105 0 9.25 4.145 9.25 9.25s-4.145 9.25-9.25 9.25-9.25-4.145-9.25-9.25 4.145-9.25 9.25-9.25zM6.997 15.983c-.051-.338-.828-5.802 2.233-8.873a4.395 4.395 0 013.13-1.28c1.27 0 2.49.51 3.39 1.42.91.9 1.42 2.12 1.42 3.39 0 1.18-.449 2.301-1.28 3.13C12.72 16.93 7 16 7 16l-.003-.017zM15.3 10.5l-2 .8-.8 2-.8-2-2-.8 2-.8.8-2 .8 2 2 .8z'/%3E%3Cpath id='text' d='M50.63 8c.13 0 .23.1.23.23V9c.7-.76 1.7-1.18 2.73-1.18 2.17 0 3.95 1.85 3.95 4.17s-1.77 4.19-3.94 4.19c-1.04 0-2.03-.43-2.74-1.18v3.77c0 .13-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V8.23c0-.12.1-.23.23-.23h1.4zm-3.86.01c.01 0 .01 0 .01-.01.13 0 .22.1.22.22v7.55c0 .12-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V15c-.7.76-1.69 1.19-2.73 1.19-2.17 0-3.94-1.87-3.94-4.19 0-2.32 1.77-4.19 3.94-4.19 1.03 0 2.02.43 2.73 1.18v-.75c0-.12.1-.23.23-.23h1.4zm26.375-.19a4.24 4.24 0 00-4.16 3.29c-.13.59-.13 1.19 0 1.77a4.233 4.233 0 004.17 3.3c2.35 0 4.26-1.87 4.26-4.19 0-2.32-1.9-4.17-4.27-4.17zM60.63 5c.13 0 .23.1.23.23v3.76c.7-.76 1.7-1.18 2.73-1.18 1.88 0 3.45 1.4 3.84 3.28.13.59.13 1.2 0 1.8-.39 1.88-1.96 3.29-3.84 3.29-1.03 0-2.02-.43-2.73-1.18v.77c0 .12-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V5.23c0-.12.1-.23.23-.23h1.4zm-34 11h-1.4c-.13 0-.23-.11-.23-.23V8.22c.01-.13.1-.22.23-.22h1.4c.13 0 .22.11.23.22v.68c.5-.68 1.3-1.09 2.16-1.1h.03c1.09 0 2.09.6 2.6 1.55.45-.95 1.4-1.55 2.44-1.56 1.62 0 2.93 1.25 2.9 2.78l.03 5.2c0 .13-.1.23-.23.23h-1.41c-.13 0-.23-.11-.23-.23v-4.59c0-.98-.74-1.71-1.62-1.71-.8 0-1.46.7-1.59 1.62l.01 4.68c0 .13-.11.23-.23.23h-1.41c-.13 0-.23-.11-.23-.23v-4.59c0-.98-.74-1.71-1.62-1.71-.85 0-1.54.79-1.6 1.8v4.5c0 .13-.1.23-.23.23zm53.615 0h-1.61c-.04 0-.08-.01-.12-.03-.09-.06-.13-.19-.06-.28l2.43-3.71-2.39-3.65a.213.213 0 01-.03-.12c0-.12.09-.21.21-.21h1.61c.13 0 .24.06.3.17l1.41 2.37 1.4-2.37a.34.34 0 01.3-.17h1.6c.04 0 .08.01.12.03.09.06.13.19.06.28l-2.37 3.65 2.43 3.7c0 .05.01.09.01.13 0 .12-.09.21-.21.21h-1.61c-.13 0-.24-.06-.3-.17l-1.44-2.42-1.44 2.42a.34.34 0 01-.3.17zm-7.12-1.49c-1.33 0-2.42-1.12-2.42-2.51 0-1.39 1.08-2.52 2.42-2.52 1.33 0 2.42 1.12 2.42 2.51 0 1.39-1.08 2.51-2.42 2.52zm-19.865 0c-1.32 0-2.39-1.11-2.42-2.48v-.07c.02-1.38 1.09-2.49 2.4-2.49 1.32 0 2.41 1.12 2.41 2.51 0 1.39-1.07 2.52-2.39 2.53zm-8.11-2.48c-.01 1.37-1.09 2.47-2.41 2.47s-2.42-1.12-2.42-2.51c0-1.39 1.08-2.52 2.4-2.52 1.33 0 2.39 1.11 2.41 2.48l.02.08zm18.12 2.47c-1.32 0-2.39-1.11-2.41-2.48v-.06c.02-1.38 1.09-2.48 2.41-2.48s2.42 1.12 2.42 2.51c0 1.39-1.09 2.51-2.42 2.51z'/%3E%3C/defs%3E%3Cmask id='clip'%3E%3Crect x='0' y='0' width='100%25' height='100%25' fill='white'/%3E%3Cuse xlink:href='%23logo'/%3E%3Cuse xlink:href='%23text'/%3E%3C/mask%3E%3Cg id='outline' opacity='1' stroke='%23000' stroke-width='3'%3E%3Ccircle mask='url(%23clip)' cx='11.5' cy='11.5' r='9.25'/%3E%3Cuse xlink:href='%23text' mask='url(%23clip)'/%3E%3C/g%3E%3Cg id='fill' opacity='1' fill='%23fff'%3E%3Cuse xlink:href='%23logo'/%3E%3Cuse xlink:href='%23text'/%3E%3C/g%3E%3C/svg%3E");
  }
}

@media (-ms-high-contrast: black-on-white) {
  a.mapboxgl-ctrl-logo {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' fill-rule='evenodd' viewBox='0 0 88 23'%3E%3Cdefs%3E%3Cpath id='logo' d='M11.5 2.25c5.105 0 9.25 4.145 9.25 9.25s-4.145 9.25-9.25 9.25-9.25-4.145-9.25-9.25 4.145-9.25 9.25-9.25zM6.997 15.983c-.051-.338-.828-5.802 2.233-8.873a4.395 4.395 0 013.13-1.28c1.27 0 2.49.51 3.39 1.42.91.9 1.42 2.12 1.42 3.39 0 1.18-.449 2.301-1.28 3.13C12.72 16.93 7 16 7 16l-.003-.017zM15.3 10.5l-2 .8-.8 2-.8-2-2-.8 2-.8.8-2 .8 2 2 .8z'/%3E%3Cpath id='text' d='M50.63 8c.13 0 .23.1.23.23V9c.7-.76 1.7-1.18 2.73-1.18 2.17 0 3.95 1.85 3.95 4.17s-1.77 4.19-3.94 4.19c-1.04 0-2.03-.43-2.74-1.18v3.77c0 .13-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V8.23c0-.12.1-.23.23-.23h1.4zm-3.86.01c.01 0 .01 0 .01-.01.13 0 .22.1.22.22v7.55c0 .12-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V15c-.7.76-1.69 1.19-2.73 1.19-2.17 0-3.94-1.87-3.94-4.19 0-2.32 1.77-4.19 3.94-4.19 1.03 0 2.02.43 2.73 1.18v-.75c0-.12.1-.23.23-.23h1.4zm26.375-.19a4.24 4.24 0 00-4.16 3.29c-.13.59-.13 1.19 0 1.77a4.233 4.233 0 004.17 3.3c2.35 0 4.26-1.87 4.26-4.19 0-2.32-1.9-4.17-4.27-4.17zM60.63 5c.13 0 .23.1.23.23v3.76c.7-.76 1.7-1.18 2.73-1.18 1.88 0 3.45 1.4 3.84 3.28.13.59.13 1.2 0 1.8-.39 1.88-1.96 3.29-3.84 3.29-1.03 0-2.02-.43-2.73-1.18v.77c0 .12-.1.23-.23.23h-1.4c-.13 0-.23-.1-.23-.23V5.23c0-.12.1-.23.23-.23h1.4zm-34 11h-1.4c-.13 0-.23-.11-.23-.23V8.22c.01-.13.1-.22.23-.22h1.4c.13 0 .22.11.23.22v.68c.5-.68 1.3-1.09 2.16-1.1h.03c1.09 0 2.09.6 2.6 1.55.45-.95 1.4-1.55 2.44-1.56 1.62 0 2.93 1.25 2.9 2.78l.03 5.2c0 .13-.1.23-.23.23h-1.41c-.13 0-.23-.11-.23-.23v-4.59c0-.98-.74-1.71-1.62-1.71-.8 0-1.46.7-1.59 1.62l.01 4.68c0 .13-.11.23-.23.23h-1.41c-.13 0-.23-.11-.23-.23v-4.59c0-.98-.74-1.71-1.62-1.71-.85 0-1.54.79-1.6 1.8v4.5c0 .13-.1.23-.23.23zm53.615 0h-1.61c-.04 0-.08-.01-.12-.03-.09-.06-.13-.19-.06-.28l2.43-3.71-2.39-3.65a.213.213 0 01-.03-.12c0-.12.09-.21.21-.21h1.61c.13 0 .24.06.3.17l1.41 2.37 1.4-2.37a.34.34 0 01.3-.17h1.6c.04 0 .08.01.12.03.09.06.13.19.06.28l-2.37 3.65 2.43 3.7c0 .05.01.09.01.13 0 .12-.09.21-.21.21h-1.61c-.13 0-.24-.06-.3-.17l-1.44-2.42-1.44 2.42a.34.34 0 01-.3.17zm-7.12-1.49c-1.33 0-2.42-1.12-2.42-2.51 0-1.39 1.08-2.52 2.42-2.52 1.33 0 2.42 1.12 2.42 2.51 0 1.39-1.08 2.51-2.42 2.52zm-19.865 0c-1.32 0-2.39-1.11-2.42-2.48v-.07c.02-1.38 1.09-2.49 2.4-2.49 1.32 0 2.41 1.12 2.41 2.51 0 1.39-1.07 2.52-2.39 2.53zm-8.11-2.48c-.01 1.37-1.09 2.47-2.41 2.47s-2.42-1.12-2.42-2.51c0-1.39 1.08-2.52 2.4-2.52 1.33 0 2.39 1.11 2.41 2.48l.02.08zm18.12 2.47c-1.32 0-2.39-1.11-2.41-2.48v-.06c.02-1.38 1.09-2.48 2.41-2.48s2.42 1.12 2.42 2.51c0 1.39-1.09 2.51-2.42 2.51z'/%3E%3C/defs%3E%3Cmask id='clip'%3E%3Crect x='0' y='0' width='100%25' height='100%25' fill='white'/%3E%3Cuse xlink:href='%23logo'/%3E%3Cuse xlink:href='%23text'/%3E%3C/mask%3E%3Cg id='outline' opacity='1' stroke='%23fff' stroke-width='3' fill='%23fff'%3E%3Ccircle mask='url(%23clip)' cx='11.5' cy='11.5' r='9.25'/%3E%3Cuse xlink:href='%23text' mask='url(%23clip)'/%3E%3C/g%3E%3Cg id='fill' opacity='1' fill='%23000'%3E%3Cuse xlink:href='%23logo'/%3E%3Cuse xlink:href='%23text'/%3E%3C/g%3E%3C/svg%3E");
  }
}

.mapboxgl-ctrl.mapboxgl-ctrl-attrib {
  background-color: #ffffff80;
  margin: 0;
  padding: 0 5px;
}

@media screen {
  .mapboxgl-ctrl-attrib.mapboxgl-compact {
    box-sizing: initial;
    background-color: #fff;
    border-radius: 12px;
    min-height: 20px;
    margin: 10px;
    padding: 2px 24px 2px 0;
    position: relative;
  }

  .mapboxgl-ctrl-attrib.mapboxgl-compact-show {
    visibility: visible;
    padding: 2px 28px 2px 8px;
  }

  .mapboxgl-ctrl-bottom-left > .mapboxgl-ctrl-attrib.mapboxgl-compact-show, .mapboxgl-ctrl-left > .mapboxgl-ctrl-attrib.mapboxgl-compact-show, .mapboxgl-ctrl-top-left > .mapboxgl-ctrl-attrib.mapboxgl-compact-show {
    border-radius: 12px;
    padding: 2px 8px 2px 28px;
  }

  .mapboxgl-ctrl-attrib.mapboxgl-compact .mapboxgl-ctrl-attrib-inner {
    display: none;
  }

  .mapboxgl-ctrl-attrib-button {
    box-sizing: border-box;
    cursor: pointer;
    background-color: #ffffff80;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill-rule='evenodd'%3E%3Cpath d='M4 10a6 6 0 1 0 12 0 6 6 0 1 0-12 0m5-3a1 1 0 1 0 2 0 1 1 0 1 0-2 0m0 3a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0'/%3E%3C/svg%3E");
    border: 0;
    border-radius: 12px;
    outline: none;
    width: 24px;
    height: 24px;
    display: none;
    position: absolute;
    top: 0;
    right: 0;
  }

  .mapboxgl-ctrl-bottom-left .mapboxgl-ctrl-attrib-button, .mapboxgl-ctrl-left .mapboxgl-ctrl-attrib-button, .mapboxgl-ctrl-top-left .mapboxgl-ctrl-attrib-button {
    left: 0;
  }

  .mapboxgl-ctrl-attrib.mapboxgl-compact .mapboxgl-ctrl-attrib-button, .mapboxgl-ctrl-attrib.mapboxgl-compact-show .mapboxgl-ctrl-attrib-inner {
    display: block;
  }

  .mapboxgl-ctrl-attrib.mapboxgl-compact-show .mapboxgl-ctrl-attrib-button {
    background-color: #0000000d;
  }

  .mapboxgl-ctrl-bottom-right > .mapboxgl-ctrl-attrib.mapboxgl-compact:after {
    bottom: 0;
    right: 0;
  }

  .mapboxgl-ctrl-right > .mapboxgl-ctrl-attrib.mapboxgl-compact:after {
    right: 0;
  }

  .mapboxgl-ctrl-top-right > .mapboxgl-ctrl-attrib.mapboxgl-compact:after {
    top: 0;
    right: 0;
  }

  .mapboxgl-ctrl-top-left > .mapboxgl-ctrl-attrib.mapboxgl-compact:after {
    top: 0;
    left: 0;
  }

  .mapboxgl-ctrl-bottom-left > .mapboxgl-ctrl-attrib.mapboxgl-compact:after {
    bottom: 0;
    left: 0;
  }

  .mapboxgl-ctrl-left > .mapboxgl-ctrl-attrib.mapboxgl-compact:after {
    left: 0;
  }
}

@media screen and (-ms-high-contrast: active) {
  .mapboxgl-ctrl-attrib.mapboxgl-compact:after {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill-rule='evenodd' fill='%23fff'%3E%3Cpath d='M4 10a6 6 0 1 0 12 0 6 6 0 1 0-12 0m5-3a1 1 0 1 0 2 0 1 1 0 1 0-2 0m0 3a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0'/%3E%3C/svg%3E");
  }
}

@media screen and (-ms-high-contrast: black-on-white) {
  .mapboxgl-ctrl-attrib.mapboxgl-compact:after {
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg' fill-rule='evenodd'%3E%3Cpath d='M4 10a6 6 0 1 0 12 0 6 6 0 1 0-12 0m5-3a1 1 0 1 0 2 0 1 1 0 1 0-2 0m0 3a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0'/%3E%3C/svg%3E");
  }
}

.mapboxgl-ctrl-attrib a {
  color: #000000bf;
  text-decoration: none;
}

.mapboxgl-ctrl-attrib a:hover {
  color: inherit;
  text-decoration: underline;
}

.mapboxgl-ctrl-attrib .mapbox-improve-map {
  margin-left: 2px;
  font-weight: 700;
}

.mapboxgl-attrib-empty {
  display: none;
}

.mapboxgl-ctrl-scale {
  box-sizing: border-box;
  color: #333;
  white-space: nowrap;
  background-color: #ffffffbf;
  border: 2px solid #333;
  border-top: #333;
  padding: 0 5px;
  font-size: 10px;
}

.mapboxgl-popup {
  pointer-events: none;
  will-change: transform;
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
}

.mapboxgl-popup-anchor-top, .mapboxgl-popup-anchor-top-left, .mapboxgl-popup-anchor-top-right {
  flex-direction: column;
}

.mapboxgl-popup-anchor-bottom, .mapboxgl-popup-anchor-bottom-left, .mapboxgl-popup-anchor-bottom-right {
  flex-direction: column-reverse;
}

.mapboxgl-popup-anchor-left {
  flex-direction: row;
}

.mapboxgl-popup-anchor-right {
  flex-direction: row-reverse;
}

.mapboxgl-popup-tip {
  z-index: 1;
  border: 10px solid #0000;
  width: 0;
  height: 0;
}

.mapboxgl-popup-anchor-top .mapboxgl-popup-tip {
  border-top: none;
  border-bottom-color: #fff;
  align-self: center;
}

.mapboxgl-popup-anchor-top-left .mapboxgl-popup-tip {
  border-top: none;
  border-bottom-color: #fff;
  border-left: none;
  align-self: flex-start;
}

.mapboxgl-popup-anchor-top-right .mapboxgl-popup-tip {
  border-top: none;
  border-bottom-color: #fff;
  border-right: none;
  align-self: flex-end;
}

.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip {
  border-top-color: #fff;
  border-bottom: none;
  align-self: center;
}

.mapboxgl-popup-anchor-bottom-left .mapboxgl-popup-tip {
  border-top-color: #fff;
  border-bottom: none;
  border-left: none;
  align-self: flex-start;
}

.mapboxgl-popup-anchor-bottom-right .mapboxgl-popup-tip {
  border-top-color: #fff;
  border-bottom: none;
  border-right: none;
  align-self: flex-end;
}

.mapboxgl-popup-anchor-left .mapboxgl-popup-tip {
  border-left: none;
  border-right-color: #fff;
  align-self: center;
}

.mapboxgl-popup-anchor-right .mapboxgl-popup-tip {
  border-left-color: #fff;
  border-right: none;
  align-self: center;
}

.mapboxgl-popup-close-button {
  background-color: initial;
  cursor: pointer;
  border: 0;
  border-radius: 0 3px 0 0;
  position: absolute;
  top: 0;
  right: 0;
}

.mapboxgl-popup-close-button:hover {
  background-color: #0000000d;
}

.mapboxgl-popup-content {
  pointer-events: auto;
  background: #fff;
  border-radius: 3px;
  padding: 10px 10px 15px;
  position: relative;
  box-shadow: 0 1px 2px #0000001a;
}

.mapboxgl-popup-anchor-top-left .mapboxgl-popup-content {
  border-top-left-radius: 0;
}

.mapboxgl-popup-anchor-top-right .mapboxgl-popup-content {
  border-top-right-radius: 0;
}

.mapboxgl-popup-anchor-bottom-left .mapboxgl-popup-content {
  border-bottom-left-radius: 0;
}

.mapboxgl-popup-anchor-bottom-right .mapboxgl-popup-content {
  border-bottom-right-radius: 0;
}

.mapboxgl-popup-track-pointer {
  display: none;
}

.mapboxgl-popup-track-pointer * {
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}

.mapboxgl-map:hover .mapboxgl-popup-track-pointer {
  display: flex;
}

.mapboxgl-map:active .mapboxgl-popup-track-pointer {
  display: none;
}

.mapboxgl-marker {
  opacity: 1;
  will-change: transform;
  transition: opacity .2s;
  position: absolute;
  top: 0;
  left: 0;
}

.mapboxgl-user-location-dot, .mapboxgl-user-location-dot:before {
  background-color: #1da1f2;
  border-radius: 50%;
  width: 15px;
  height: 15px;
}

.mapboxgl-user-location-dot:before {
  content: "";
  animation: 2s infinite mapboxgl-user-location-dot-pulse;
  position: absolute;
}

.mapboxgl-user-location-dot:after {
  box-sizing: border-box;
  content: "";
  border: 2px solid #fff;
  border-radius: 50%;
  width: 19px;
  height: 19px;
  position: absolute;
  top: -2px;
  left: -2px;
  box-shadow: 0 0 3px #00000059;
}

.mapboxgl-user-location-show-heading .mapboxgl-user-location-heading {
  width: 0;
  height: 0;
}

.mapboxgl-user-location-show-heading .mapboxgl-user-location-heading:after, .mapboxgl-user-location-show-heading .mapboxgl-user-location-heading:before {
  content: "";
  border-bottom: 7.5px solid #4aa1eb;
  position: absolute;
}

.mapboxgl-user-location-show-heading .mapboxgl-user-location-heading:before {
  border-left: 7.5px solid #0000;
  transform: translateY(-28px)skewY(-20deg);
}

.mapboxgl-user-location-show-heading .mapboxgl-user-location-heading:after {
  border-right: 7.5px solid #0000;
  transform: translate(7.5px, -28px)skewY(20deg);
}

@keyframes mapboxgl-user-location-dot-pulse {
  0% {
    opacity: 1;
    transform: scale(1);
  }

  70% {
    opacity: 0;
    transform: scale(3);
  }

  to {
    opacity: 0;
    transform: scale(1);
  }
}

.mapboxgl-user-location-dot-stale {
  background-color: #aaa;
}

.mapboxgl-user-location-dot-stale:after {
  display: none;
}

.mapboxgl-user-location-accuracy-circle {
  background-color: #1da1f233;
  border-radius: 100%;
  width: 1px;
  height: 1px;
}

.mapboxgl-crosshair, .mapboxgl-crosshair .mapboxgl-interactive, .mapboxgl-crosshair .mapboxgl-interactive:active {
  cursor: crosshair;
}

.mapboxgl-boxzoom {
  opacity: .5;
  background: #fff;
  border: 2px dotted #202020;
  width: 0;
  height: 0;
  position: absolute;
  top: 0;
  left: 0;
}

@media print {
  .mapbox-improve-map {
    display: none;
  }
}

.mapboxgl-scroll-zoom-blocker, .mapboxgl-touch-pan-blocker {
  color: #fff;
  opacity: 0;
  pointer-events: none;
  text-align: center;
  background: #000000b3;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif;
  transition: opacity .75s ease-in-out 1s;
  display: flex;
  position: absolute;
  top: 0;
  left: 0;
}

.mapboxgl-scroll-zoom-blocker-show, .mapboxgl-touch-pan-blocker-show {
  opacity: 1;
  transition: opacity .1s ease-in-out;
}

.mapboxgl-canvas-container.mapboxgl-touch-pan-blocker-override.mapboxgl-scrollable-page, .mapboxgl-canvas-container.mapboxgl-touch-pan-blocker-override.mapboxgl-scrollable-page .mapboxgl-canvas {
  touch-action: pan-x pan-y;
}

.mapboxgl-ctrl-separator {
  background-color: #e0e0e0;
  height: 1px;
}

.mapboxgl-ctrl button.mapboxgl-ctrl-level-button {
  color: #333;
  width: 44px;
  height: 44px;
  font-size: 18px;
  font-weight: 700;
}

.mapboxgl-ctrl button.mapboxgl-ctrl-level-button:first-child {
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

.mapboxgl-ctrl button.mapboxgl-ctrl-level-button:last-child {
  border-bottom-right-radius: 8px;
  border-bottom-left-radius: 8px;
}

.mapboxgl-ctrl button.mapboxgl-ctrl-level-button:hover {
  background-color: #f5f5f5;
}

.mapboxgl-ctrl button.mapboxgl-ctrl-level-button-selected {
  color: #fff;
  background-color: #4a5568;
}

.mapboxgl-ctrl button.mapboxgl-ctrl-level-button-selected:hover {
  background-color: #2d3748;
}

      `}</style>
      
      <MapGL
        {...viewState}
        onMove={(evt: any) => setViewState(evt.viewState)}
        onClick={handleMapClick}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: "100%", height: "100%" }}
      >
        {/* Render route layers - only show routes in active itinerary path */}
        {(() => {
          // Build actual itinerary path considering selected alternatives
          // We need to compute which locations are actually visited based on alternative selections
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

          return routes.filter((route) => {
            // Only show routes that connect consecutive locations in the active itinerary
            const pairKey = `${route.fromId}-${route.toId}`;
            return activeRoutePairs.has(pairKey);
          }).map((route) => {
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
          });
        })()}

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
          routes={routes}
          selectedAlternatives={selectedAlternatives}
          setSelectedAlternatives={setSelectedAlternatives}
          showItinerary={showItinerary || false}
        />
      </MapGL>
    </div>
  );
}