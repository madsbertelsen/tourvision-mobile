import React, { useState, useCallback } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import type { MarkerDragEvent } from 'react-map-gl/mapbox';

interface WaypointMarkerProps {
  waypoint: {
    coordinates: [number, number];
    id?: string;
  };
  index: number;
  onDragStart?: () => void;
  onDrag?: (event: MarkerDragEvent) => void;
  onDragEnd?: (event: MarkerDragEvent) => void;
  onRemove?: () => void;
  isActive?: boolean;
}

export function WaypointMarker({
  waypoint,
  index,
  onDragStart,
  onDrag,
  onDragEnd,
  onRemove,
  isActive = false,
}: WaypointMarkerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleDragStart = useCallback(() => {
    console.log('Waypoint drag start');
    setIsDragging(true);
    onDragStart?.();
  }, [onDragStart]);

  const handleDrag = useCallback(
    (event: MarkerDragEvent) => {
      console.log('Waypoint dragging', event.lngLat);
      onDrag?.(event);
    },
    [onDrag],
  );

  const handleDragEnd = useCallback(
    (event: MarkerDragEvent) => {
      console.log('Waypoint drag end', event.lngLat);
      setIsDragging(false);
      onDragEnd?.(event);
    },
    [onDragEnd],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onRemove?.();
    },
    [onRemove],
  );

  // Determine marker style based on state
  const getMarkerStyle = () => {
    if (isDragging) {
      return {
        backgroundColor: '#3b82f6',
        borderColor: '#1e40af',
        transform: 'scale(1.2)',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
      };
    }
    if (isHovered) {
      return {
        backgroundColor: '#60a5fa',
        borderColor: '#2563eb',
        transform: 'scale(1.1)',
        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
      };
    }
    if (isActive) {
      return {
        backgroundColor: '#3b82f6',
        borderColor: '#1e40af',
        boxShadow: '0 2px 6px rgba(59, 130, 246, 0.25)',
      };
    }
    return {
      backgroundColor: '#ffffff',
      borderColor: '#3b82f6',
      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.1)',
    };
  };

  return (
    <Marker
      longitude={waypoint.coordinates[0]}
      latitude={waypoint.coordinates[1]}
      draggable={true}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      anchor="center"
    >
      <div
        className="waypoint-marker"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onContextMenu={handleContextMenu}
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          border: '4px solid',
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: 'all 0.2s ease',
          position: 'absolute',
          transform: 'translate(-50%, -50%)',
          top: '50%',
          left: '50%',
          ...getMarkerStyle(),
        }}
        title={`Waypoint ${index + 1} - Right-click to remove, drag to move`}
      >
        {/* Inner dot for better visibility */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: isDragging || isHovered ? '#ffffff' : '#3b82f6',
            transition: 'background-color 0.2s ease',
          }}
        />

        {/* Tooltip on hover */}
        {isHovered && !isDragging && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '8px',
              padding: '4px 8px',
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              fontSize: '12px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            Waypoint {index + 1}
          </div>
        )}
      </div>
    </Marker>
  );
}

// Export helper function to add waypoint at clicked position on route
export function addWaypointAtPosition(
  routeGeometry: [number, number][],
  clickedLngLat: [number, number],
  _existingWaypoints: Array<{ coordinates: [number, number]; id?: string }>,
): { coordinates: [number, number]; id: string } | null {
  // Find the closest point on the route to the clicked position
  let minDistance = Number.POSITIVE_INFINITY;
  let closestPoint: [number, number] | null = null;

  for (let i = 0; i < routeGeometry.length - 1; i++) {
    const [lng1, lat1] = routeGeometry[i];
    const [lng2, lat2] = routeGeometry[i + 1];
    const [clickLng, clickLat] = clickedLngLat;

    // Calculate distance from click to line segment
    const A = clickLng - lng1;
    const B = clickLat - lat1;
    const C = lng2 - lng1;
    const D = lat2 - lat1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx: number;
    let yy: number;

    if (param < 0) {
      xx = lng1;
      yy = lat1;
    } else if (param > 1) {
      xx = lng2;
      yy = lat2;
    } else {
      xx = lng1 + param * C;
      yy = lat1 + param * D;
    }

    const dx = clickLng - xx;
    const dy = clickLat - yy;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = [xx, yy];
    }
  }

  // Only add waypoint if click was reasonably close to the route
  // Increased threshold for easier interaction
  if (closestPoint && minDistance < 0.005) {
    return {
      coordinates: closestPoint,
      id: `waypoint-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    };
  }

  return null;
}
