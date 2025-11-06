import React, { useState, useCallback, useMemo } from 'react';
// @ts-ignore
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
// @ts-ignore
import { IconLayer } from '@deck.gl/layers';

interface Location {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex?: number;
  transportFrom?: string | null;
  transportProfile?: string | null;
  waypoints?: Array<{lat: number, lng: number}> | null;
}

interface EditableRouteOverlayProps {
  locations: Location[];
  routes: any[];
  onRouteUpdate?: (locationId: string, waypoints: Array<{lat: number, lng: number}>, segmentIndex?: number) => void;
  editingEnabled?: boolean;
  selectedRouteIndex?: number | null;
  cursorPosition?: [number, number] | null; // Current cursor/touch position
  onProximityPoint?: (point: [number, number] | null, routeIndex: number | null) => void;
  isDragging?: boolean;
  draggedWaypoint?: {position: [number, number], routeIndex: number} | null;
  onDragStart?: (waypoint: {position: [number, number], routeIndex: number}) => void;
  onDragEnd?: () => void;
}

// Color array matching the main map
const COLORS = [
  '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'
];

// Helper function to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

// Calculate distance between two points
function distance(p1: [number, number], p2: [number, number]): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Find the nearest point on a line segment
function nearestPointOnSegment(
  point: [number, number],
  segStart: [number, number],
  segEnd: [number, number]
): [number, number] {
  const dx = segEnd[0] - segStart[0];
  const dy = segEnd[1] - segStart[1];

  if (dx === 0 && dy === 0) {
    return segStart; // Segment is a point
  }

  const t = Math.max(0, Math.min(1,
    ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) /
    (dx * dx + dy * dy)
  ));

  return [
    segStart[0] + t * dx,
    segStart[1] + t * dy
  ];
}

// Find the nearest point on a route
export function findNearestPointOnRoute(
  point: [number, number],
  routeCoordinates: [number, number][]
): { point: [number, number], distance: number, segmentIndex: number } | null {
  if (!routeCoordinates || routeCoordinates.length < 2) return null;

  let minDistance = Infinity;
  let nearestPoint: [number, number] = [0, 0];
  let nearestSegmentIndex = 0;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const nearPoint = nearestPointOnSegment(
      point,
      routeCoordinates[i],
      routeCoordinates[i + 1]
    );
    const dist = distance(point, nearPoint);

    if (dist < minDistance) {
      minDistance = dist;
      nearestPoint = nearPoint;
      nearestSegmentIndex = i;
    }
  }

  return {
    point: nearestPoint,
    distance: minDistance,
    segmentIndex: nearestSegmentIndex
  };
}

// Proximity threshold in map units (adjust based on zoom level)
const PROXIMITY_THRESHOLD = 0.002; // About 200 meters at equator - increased for easier testing

export function createSimpleEditableRouteLayers({
  locations,
  routes,
  onRouteUpdate,
  editingEnabled = false,
  selectedRouteIndex = 0,
  cursorPosition = null,
  onProximityPoint,
  isDragging = false,
  draggedWaypoint = null,
  onDragStart,
  onDragEnd
}: EditableRouteOverlayProps) {
  const layers = [];

  // Track proximity point with segment info
  let proximityData: { point: [number, number], routeIndex: number, segmentIndex: number, distance: number } | null = null;
  let closestRoute: { point: [number, number], routeIndex: number, segmentIndex: number, distance: number } | null = null;

  // Check proximity to routes if in edit mode and cursor position is available
  if (editingEnabled && cursorPosition) {
    // Find the closest route to the cursor
    routes.forEach((route, index) => {
      if (!route || !route.geometry || !route.geometry.coordinates) {
        return;
      }

      const nearestInfo = findNearestPointOnRoute(
        cursorPosition,
        route.geometry.coordinates
      );

      if (nearestInfo) {
        // Track the closest route overall
        if (!closestRoute || nearestInfo.distance < closestRoute.distance) {
          closestRoute = {
            point: nearestInfo.point,
            routeIndex: index,
            segmentIndex: nearestInfo.segmentIndex,
            distance: nearestInfo.distance
          };
        }
      }
    });

    // Only show proximity for the closest route if it's within threshold
    if (closestRoute && closestRoute.distance < PROXIMITY_THRESHOLD) {
      proximityData = closestRoute;
      console.log('[EditableRoute] ✅ Proximity detected on route', closestRoute.routeIndex, '! Click to add waypoint at segment', closestRoute.segmentIndex);
    }

    // Notify parent component about proximity point
    if (onProximityPoint) {
      onProximityPoint(
        proximityData?.point || null,
        proximityData?.routeIndex ?? null
      );
    }
  }

  // Create route layers
  routes.forEach((route, index) => {
    if (!route || !route.geometry || !route.geometry.coordinates) return;

    const colorIndex = route.colorIndex || 0;
    const color = COLORS[colorIndex % COLORS.length];
    const rgb = hexToRgb(color);
    // Highlight the route when it has proximity (auto-selected)
    const isSelected = editingEnabled && proximityData && index === proximityData.routeIndex;

    // Route path layer
    layers.push(
      new PathLayer({
        id: `route-${index}`,
        data: [{
          path: route.geometry.coordinates,
          routeIndex: index,
          color: [rgb.r, rgb.g, rgb.b, isSelected ? 255 : 180]
        }],
        getPath: (d: any) => d.path,
        getColor: (d: any) => d.color,
        getWidth: isSelected ? 5 : 4,
        widthMinPixels: isSelected ? 4 : 3,
        capRounded: true,
        jointRounded: true,
        pickable: editingEnabled,
        autoHighlight: editingEnabled,
        highlightColor: [255, 255, 255, 100],
        onClick: (info: any) => {
          if (editingEnabled && onRouteUpdate && proximityData) {
            // Add new waypoint at proximity point
            const newWaypoint = {
              lat: proximityData.point[1],
              lng: proximityData.point[0]
            };

            // Get existing waypoints or initialize empty array
            const existingWaypoints = route.waypoints || [];
            const updatedWaypoints = [...existingWaypoints, newWaypoint];

            // Update route with new waypoint
            if (route.toLocationId) {
              onRouteUpdate(route.toLocationId, updatedWaypoints);
            }

            console.log('[Route] Added waypoint at:', newWaypoint);
          }
        }
      })
    );

    // Add waypoint handles for selected route - only show custom user-added waypoints
    if (isSelected && editingEnabled && route.waypoints && route.waypoints.length > 0) {
      const waypointData = [];

      // Add existing custom waypoints only
      route.waypoints.forEach((wp: any, idx: number) => {
        waypointData.push({
          position: [wp.lng, wp.lat],
          index: -1, // Custom waypoint
          routeId: route.id || route.toLocationId,
          waypointIndex: idx, // Track the index for updates
          isCustom: true
        });
      });

      // Waypoint handles layer - only show if there are custom waypoints
      if (waypointData.length > 0) {
        layers.push(
          new ScatterplotLayer({
            id: `waypoints-${index}`,
            data: waypointData,
            getPosition: (d: any) => d.position,
            getFillColor: [255, 200, 0, 255], // Orange for custom waypoints
            getRadius: 8,
            radiusMinPixels: 6,
            radiusMaxPixels: 12,
            pickable: true,
            autoHighlight: true,
            highlightColor: [139, 92, 246, 255],
            stroked: true,
            getLineColor: [139, 92, 246, 255],
            lineWidthMinPixels: 2,

            // Enable dragging simulation
            getCursor: () => 'grab',

            onClick: (info: any) => {
              if (onRouteUpdate) {
                console.log('[Waypoint] Clicked waypoint:', info.object);
                // TODO: Implement waypoint deletion on click
                // Could show a context menu or delete immediately with confirmation
              }
            },

            onHover: (info: any) => {
              if (info.object) {
                // Could show tooltip or change cursor
                document.body.style.cursor = 'grab';
              } else {
                document.body.style.cursor = 'default';
              }
            }
          })
        );
      }
    }
  });

  // Add proximity indicator layer or dragged waypoint
  if (isDragging && draggedWaypoint) {
    // Show the dragged waypoint at cursor position
    layers.push(
      new ScatterplotLayer({
        id: 'dragged-waypoint',
        data: [{
          position: cursorPosition || draggedWaypoint.position,
          routeIndex: draggedWaypoint.routeIndex,
          segmentIndex: draggedWaypoint.segmentIndex || 0
        }],
        getPosition: (d: any) => d.position,
        getFillColor: [255, 165, 0, 255], // Orange color for dragging
        getRadius: 14,
        radiusMinPixels: 12,
        radiusMaxPixels: 18,
        pickable: false,
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 3,
      })
    );
  } else if (proximityData && editingEnabled) {
    // Show proximity indicator when not dragging
    layers.push(
      new ScatterplotLayer({
        id: 'proximity-indicator',
        data: [{
          position: proximityData.point,
          routeIndex: proximityData.routeIndex,
          segmentIndex: proximityData.segmentIndex
        }],
        getPosition: (d: any) => d.position,
        getFillColor: [46, 204, 113, 200], // Green color for proximity indicator
        getRadius: 12,
        radiusMinPixels: 10,
        radiusMaxPixels: 15,
        pickable: true,
        autoHighlight: true,
        highlightColor: [46, 204, 113, 255],
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2,
        // Pulsing animation effect
        transitions: {
          getRadius: {
            duration: 600,
            type: 'spring'
          }
        },
        getCursor: () => 'grab',
        onDragStart: (info: any, event: any) => {
          console.log('[Proximity] Starting drag from segment', info.object.segmentIndex);
          if (onDragStart) {
            onDragStart({
              position: info.object.position,
              routeIndex: info.object.routeIndex,
              segmentIndex: info.object.segmentIndex
            });
          }
          // Return false to prevent default deck.gl drag behavior
          return false;
        },
        onDrag: (info: any, event: any) => {
          // This will be handled by mouse move + isDragging state
          return false;
        },
        onDragEnd: (info: any, event: any) => {
          console.log('[Proximity] Ending drag');
          if (onDragEnd) {
            onDragEnd();
          }
          return false;
        },
        onClick: (info: any, event: any) => {
          // Only add waypoint on click if not dragging
          if (!isDragging && onRouteUpdate && info.object) {
            // Find the route and add waypoint
            const route = routes[info.object.routeIndex];
            if (route && route.toLocationId) {
              const newWaypoint = {
                lat: info.object.position[1],
                lng: info.object.position[0]
              };

              const existingWaypoints = route.waypoints || [];

              // Calculate insertion index based on segment position
              let insertIndex = existingWaypoints.length; // Default to end

              if (info.object.segmentIndex !== undefined && route.geometry) {
                const totalSegments = route.geometry.coordinates.length - 1;
                const newWaypointProgress = info.object.segmentIndex / totalSegments;

                // Find the correct position to insert based on route progress
                insertIndex = 0;

                for (let i = 0; i < existingWaypoints.length; i++) {
                  const wp = existingWaypoints[i];
                  // Find which segment this waypoint is closest to
                  const wpNearestInfo = findNearestPointOnRoute(
                    [wp.lng, wp.lat],
                    route.geometry.coordinates
                  );

                  if (wpNearestInfo) {
                    const wpProgress = wpNearestInfo.segmentIndex / totalSegments;
                    if (newWaypointProgress > wpProgress) {
                      insertIndex = i + 1;
                    }
                  }
                }
              }

              // Insert waypoint at calculated position
              const updatedWaypoints = [...existingWaypoints];
              updatedWaypoints.splice(insertIndex, 0, newWaypoint);

              onRouteUpdate(route.toLocationId, updatedWaypoints, info.object.segmentIndex);
              console.log('[Proximity] Inserted waypoint at index', insertIndex, 'for segment', info.object.segmentIndex);
            }
          }
        }
      })
    );
  }

  // Add debug cursor position indicator (red dot)
  if (editingEnabled && cursorPosition) {
    layers.push(
      new ScatterplotLayer({
        id: 'cursor-debug',
        data: [{
          position: cursorPosition
        }],
        getPosition: (d: any) => d.position,
        getFillColor: [255, 0, 0, 100], // Semi-transparent red
        getRadius: 5,
        radiusMinPixels: 5,
        radiusMaxPixels: 5,
        pickable: false,
      })
    );
  }

  // Add location markers
  const markerData = locations.map(loc => ({
    position: [loc.lng, loc.lat],
    color: COLORS[(loc.colorIndex || 0) % COLORS.length],
    name: loc.placeName,
    geoId: loc.geoId,
    size: 10
  }));

  layers.push(
    new ScatterplotLayer({
      id: 'location-markers',
      data: markerData,
      getPosition: (d: any) => d.position,
      getFillColor: (d: any) => {
        const rgb = hexToRgb(d.color);
        return [rgb.r, rgb.g, rgb.b, 255];
      },
      getRadius: (d: any) => d.size,
      radiusMinPixels: 8,
      radiusMaxPixels: 20,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 255],
      stroked: true,
      getLineColor: [255, 255, 255, 255],
      lineWidthMinPixels: 2,
    })
  );

  return layers;
}

// Simplified hook for managing route editing
export function useSimpleRouteEditor(locations: Location[], initialRoutes: any[]) {
  const [routes, setRoutes] = useState(initialRoutes);
  const [editingEnabled, setEditingEnabled] = useState(false);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(0);
  const [draggedWaypoint, setDraggedWaypoint] = useState<any>(null);
  const [cursorPosition, setCursorPosition] = useState<[number, number] | null>(null);

  const handleRouteUpdate = useCallback((toLocationId: string, waypoints: Array<{lat: number, lng: number}>) => {
    setRoutes(prevRoutes => {
      return prevRoutes.map(route => {
        if (route.toLocationId === toLocationId) {
          return {
            ...route,
            waypoints,
          };
        }
        return route;
      });
    });

    console.log('[useSimpleRouteEditor] Route updated for location:', toLocationId, waypoints);
  }, []);

  const toggleEditMode = useCallback(() => {
    setEditingEnabled(prev => !prev);
    if (!editingEnabled) {
      setSelectedRouteIndex(0); // Select first route when entering edit mode
    }
  }, [editingEnabled]);

  const startDragging = useCallback((waypoint: any) => {
    setDraggedWaypoint(waypoint);
    console.log('[useSimpleRouteEditor] Started dragging waypoint:', waypoint);
  }, []);

  const updateDraggedPosition = useCallback((position: [number, number]) => {
    if (draggedWaypoint) {
      setDraggedWaypoint({
        ...draggedWaypoint,
        position
      });
    }
  }, [draggedWaypoint]);

  const endDragging = useCallback(() => {
    if (draggedWaypoint) {
      // Update the route with the new waypoint position
      const route = routes[draggedWaypoint.routeIndex];
      if (route && route.toLocationId) {
        const updatedWaypoints = route.waypoints ? [...route.waypoints] : [];

        if (draggedWaypoint.waypointIndex >= 0) {
          // Update existing waypoint
          updatedWaypoints[draggedWaypoint.waypointIndex] = {
            lat: draggedWaypoint.position[1],
            lng: draggedWaypoint.position[0]
          };
        }

        handleRouteUpdate(route.toLocationId, updatedWaypoints);
      }

      setDraggedWaypoint(null);
      console.log('[useSimpleRouteEditor] Ended dragging waypoint');
    }
  }, [draggedWaypoint, routes, handleRouteUpdate]);

  return {
    routes,
    editingEnabled,
    toggleEditMode,
    selectedRouteIndex,
    setSelectedRouteIndex,
    handleRouteUpdate,
    draggedWaypoint,
    setDraggedWaypoint,
    startDragging,
    updateDraggedPosition,
    endDragging,
    cursorPosition,
    setCursorPosition
  };
}