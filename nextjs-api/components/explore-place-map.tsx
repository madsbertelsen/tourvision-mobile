'use client';

import React, { useRef, useEffect, useState, useImperativeHandle } from 'react';
import MapGL, { Marker, type MapRef, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cn } from '@/lib/utils';

interface Place {
  placeName: string;
  description: string;
  coordinates: [number, number];
  imageUrl?: string;
  category: 'attraction' | 'restaurant' | 'activity' | 'accommodation' | 'shopping' | 'nature';
  rating?: number;
  priceLevel?: string;
  estimatedDuration?: string;
  address?: string;
  whyVisit: string;
  tags?: string[];
}

interface ExplorePlaceMapProps {
  city: string;
  places: Place[];
  reactions: Map<string, 'like' | 'dislike'>;
  hoveredPlace?: string | null;
  focusedPlace?: Place | null;
  latestPlaceIndex?: number;
  onPlaceHover?: (placeName: string | null) => void;
  onPlaceClick?: (placeName: string) => void;
}

const categoryEmojis = {
  attraction: '🏛️',
  restaurant: '🍽️',
  activity: '🎭',
  accommodation: '🏨',
  shopping: '🛍️',
  nature: '🌳',
};

// Color palette for markers
const MARKER_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

export const ExplorePlaceMap = React.forwardRef<MapRef, ExplorePlaceMapProps>((
  {
    city,
    places,
    reactions,
    hoveredPlace,
    focusedPlace,
    latestPlaceIndex = -1,
    onPlaceHover,
    onPlaceClick,
  },
  ref
) => {
  const internalMapRef = useRef<MapRef>(null);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  
  // Expose map methods to parent
  useImperativeHandle(ref, () => internalMapRef.current!, []);

  // Filter places with valid coordinates
  const validPlaces = places.filter(place => 
    place.coordinates && 
    Array.isArray(place.coordinates) && 
    place.coordinates.length === 2 &&
    !isNaN(place.coordinates[0]) && 
    !isNaN(place.coordinates[1])
  );

  // Pan to focused place when it changes
  useEffect(() => {
    if (focusedPlace && internalMapRef.current) {
      const [lng, lat] = focusedPlace.coordinates;
      // Delay slightly to coordinate with card animation
      setTimeout(() => {
        internalMapRef.current?.flyTo({
          center: [lng, lat],
          zoom: 14,
          duration: 800,
          essential: true,
        });
      }, 100);
    }
  }, [focusedPlace]);

  // Fit map bounds to show all places (only on initial load)
  useEffect(() => {
    if (validPlaces.length > 0 && internalMapRef.current && !focusedPlace) {
      if (validPlaces.length === 1) {
        // Single location: center on it
        const [lng, lat] = validPlaces[0].coordinates;
        internalMapRef.current.flyTo({
          center: [lng, lat],
          zoom: 13,
          duration: 1000,
        });
      } else {
        // Multiple locations: fit bounds with padding for the list overlay
        const bounds = validPlaces.reduce(
          (acc, place) => {
            const [lng, lat] = place.coordinates;
            return [
              [Math.min(acc[0][0], lng), Math.min(acc[0][1], lat)],
              [Math.max(acc[1][0], lng), Math.max(acc[1][1], lat)],
            ];
          },
          [
            [validPlaces[0].coordinates[0], validPlaces[0].coordinates[1]],
            [validPlaces[0].coordinates[0], validPlaces[0].coordinates[1]],
          ] as [[number, number], [number, number]],
        );

        internalMapRef.current.fitBounds(bounds, {
          padding: { top: 80, bottom: 80, left: 360, right: 80 }, // Extra padding on left for list
          duration: 1000,
        });
      }
    }
  }, [validPlaces.length, focusedPlace]);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/50">
        <div className="text-center p-4">
          <p className="text-muted-foreground text-sm">
            Map view requires configuration
          </p>
        </div>
      </div>
    );
  }

  if (validPlaces.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/50">
        <p className="text-muted-foreground text-sm">
          Loading map locations...
        </p>
      </div>
    );
  }

  // Default center (Stockholm or first place)
  const defaultCenter: [number, number] = validPlaces[0]?.coordinates || [18.0686, 59.3293];

  return (
    <MapGL
      ref={internalMapRef}
      mapboxAccessToken={mapboxToken}
      initialViewState={{
        longitude: defaultCenter[0],
        latitude: defaultCenter[1],
        zoom: 12,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      attributionControl={false}
    >
      {/* Place markers */}
      {validPlaces.map((place, index) => {
        const reaction = reactions.get(place.placeName);
        const isHovered = hoveredPlace === place.placeName || hoveredMarker === place.placeName;
        const isLatest = index === latestPlaceIndex;
        const isFocused = focusedPlace?.placeName === place.placeName;
        const markerColor = MARKER_COLORS[index % MARKER_COLORS.length];
        
        // Skip places that have been disliked
        if (reaction === 'dislike') return null;

        return (
          <Marker
            key={place.placeName}
            longitude={place.coordinates[0]}
            latitude={place.coordinates[1]}
            anchor="center"
          >
            <div
              className={cn(
                "relative cursor-pointer transition-all duration-300",
                isLatest && "animate-pulse-marker",
                isFocused && "animate-focus-marker"
              )}
              style={{
                transform: isHovered ? 'scale(1.2)' : isFocused ? 'scale(1.15)' : 'scale(1)',
                opacity: isFocused || isHovered || reaction === 'like' ? 1 : 0.5, // Reduce opacity for non-focused/non-liked markers
              }}
              onMouseEnter={() => {
                setHoveredMarker(place.placeName);
                onPlaceHover?.(place.placeName);
              }}
              onMouseLeave={() => {
                setHoveredMarker(null);
                onPlaceHover?.(null);
              }}
              onClick={() => onPlaceClick?.(place.placeName)}
            >
              {/* Label with place name - hide for focused place */}
              {(isHovered || reaction === 'like') && !isFocused && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    color: reaction === 'like' ? '#3B82F6' : '#374151',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    fontSize: '12px',
                    fontWeight: '500',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    border: `1px solid ${reaction === 'like' ? '#3B82F6' : '#e5e7eb'}`,
                    zIndex: 10,
                    maxWidth: '180px',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {place.placeName}
                  {place.rating && (
                    <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '1px' }}>
                      ⭐ {place.rating}
                    </div>
                  )}
                </div>
              )}

              {/* Marker - show pulsing dot for focused, simple circles for others */}
              {isFocused ? (
                // Focused place - animated pulsing dot
                <div className="relative">
                  <div
                    className="absolute rounded-full bg-orange-500 animate-ping"
                    style={{
                      width: '24px',
                      height: '24px',
                      top: '-4px',
                      left: '-4px',
                      animationDuration: '1.5s',
                    }}
                  />
                  <div
                    className="relative rounded-full"
                    style={{
                      width: '16px',
                      height: '16px',
                      backgroundColor: '#f97316',
                      border: '3px solid #ffffff',
                      boxShadow: '0 2px 10px rgba(249,115,22,0.5)',
                    }}
                  />
                </div>
              ) : (
                // Other places - simple gray/blue circles
                <div
                  className={cn(
                    "flex items-center justify-center rounded-full transition-all",
                    reaction === 'like' ? "ring-4 ring-blue-500/30" : ""
                  )}
                  style={{
                    width: reaction === 'like' ? '28px' : '20px',
                    height: reaction === 'like' ? '28px' : '20px',
                    backgroundColor: reaction === 'like' ? '#3B82F6' : '#ffffff',
                    border: reaction === 'like' ? '2px solid #3B82F6' : '2px solid #d1d5db',
                    boxShadow: isHovered 
                      ? '0 4px 12px rgba(0,0,0,0.2)' 
                      : '0 2px 6px rgba(0,0,0,0.1)',
                  }}
                >
                  <span style={{ fontSize: reaction === 'like' ? '14px' : '10px' }}>
                    {categoryEmojis[place.category]}
                  </span>
                </div>
              )}

              {/* Pulse animation for liked places */}
              {reaction === 'like' && (
                <div
                  className="absolute inset-0 rounded-full bg-blue-500 animate-ping"
                  style={{
                    animationDuration: '2s',
                    animationIterationCount: '3',
                  }}
                />
              )}
            </div>
          </Marker>
        );
      })}
    </MapGL>
  );
});

ExplorePlaceMap.displayName = 'ExplorePlaceMap';