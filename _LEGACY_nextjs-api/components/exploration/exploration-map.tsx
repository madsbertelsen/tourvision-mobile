'use client';

import { useRef, useEffect, useState, } from 'react';
import MapGL, { Marker, type MapRef } from 'react-map-gl/mapbox';
import { motion, AnimatePresence } from 'framer-motion';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Destination } from '@/artifacts/exploration/types';
import { Heart, X, Star, DollarSign, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExplorationMapProps {
  destinations: Destination[];
  mapboxToken?: string;
  likedIds: Set<string>;
  dislikedIds: Set<string>;
  onToggleLike: (id: string) => void;
  onToggleDislike: (id: string) => void;
  visibleCategories: Set<string>;
  hoveredDestination: string | null;
  onDestinationHover: (id: string | null) => void;
}

const categoryColors = {
  attraction: '#3B82F6', // Blue
  restaurant: '#10B981', // Green
  activity: '#F59E0B', // Amber
  accommodation: '#8B5CF6', // Purple
  shopping: '#EC4899', // Pink
  nature: '#06B6D4', // Cyan
};

const categoryIcons = {
  attraction: '🏛️',
  restaurant: '🍽️',
  activity: '🎭',
  accommodation: '🏨',
  shopping: '🛍️',
  nature: '🌳',
};

export function ExplorationMap({
  destinations,
  mapboxToken,
  likedIds,
  dislikedIds,
  onToggleLike,
  onToggleDislike,
  visibleCategories,
  hoveredDestination,
  onDestinationHover,
}: ExplorationMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [loadedDestinations, setLoadedDestinations] = useState<Set<string>>(new Set());

  // Filter destinations based on visibility
  const visibleDestinations = destinations.filter(d => {
    if (dislikedIds.has(d.id)) return false;
    if (visibleCategories.size > 0 && !visibleCategories.has(d.category)) return false;
    return true;
  });

  // Fit bounds when destinations change
  useEffect(() => {
    if (visibleDestinations.length > 0 && mapRef.current) {
      if (visibleDestinations.length === 1) {
        const [lng, lat] = visibleDestinations[0].coordinates;
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: 14,
          duration: 1500,
        });
      } else {
        const bounds = visibleDestinations.reduce<[[number, number], [number, number]]>(
          (acc, dest) => {
            const [lng, lat] = dest.coordinates;
            return [
              [Math.min(acc[0][0], lng), Math.min(acc[0][1], lat)],
              [Math.max(acc[1][0], lng), Math.max(acc[1][1], lat)],
            ];
          },
          [
            [visibleDestinations[0].coordinates[0], visibleDestinations[0].coordinates[1]],
            [visibleDestinations[0].coordinates[0], visibleDestinations[0].coordinates[1]],
          ],
        );

        mapRef.current.fitBounds(bounds, {
          padding: 80,
          duration: 1500,
        });
      }
    }
  }, [visibleDestinations]);

  // Track loaded destinations for staggered animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadedDestinations(new Set(destinations.map(d => d.id)));
    }, 100);
    return () => clearTimeout(timer);
  }, [destinations]);

  // Fly to destination when hovered
  useEffect(() => {
    if (hoveredDestination && mapRef.current) {
      const dest = destinations.find(d => d.id === hoveredDestination);
      if (dest) {
        mapRef.current.flyTo({
          center: dest.coordinates,
          zoom: 15,
          duration: 800,
        });
      }
    }
  }, [hoveredDestination, destinations]);

  const token = mapboxToken || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

  if (!token) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-400">Map requires Mapbox token</p>
      </div>
    );
  }

  const defaultCenter: [number, number] = destinations[0]?.coordinates || [2.3522, 48.8566]; // Paris default

  return (
    <MapGL
      ref={mapRef}
      mapboxAccessToken={token}
      initialViewState={{
        longitude: defaultCenter[0],
        latitude: defaultCenter[1],
        zoom: 12,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      attributionControl={false}
    >
      <AnimatePresence>
        {visibleDestinations.map((destination, index) => {
          const isLiked = likedIds.has(destination.id);
          const isHovered = hoveredDestination === destination.id;
          const isLoaded = loadedDestinations.has(destination.id);
          const color = categoryColors[destination.category];

          return (
            <Marker
              key={destination.id}
              longitude={destination.coordinates[0]}
              latitude={destination.coordinates[1]}
              anchor="center"
            >
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={isLoaded ? { 
                  scale: isHovered ? 1.2 : 1, 
                  opacity: 1,
                } : {}}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  delay: index * 0.05, // Stagger animation
                  duration: 0.3,
                  type: 'spring',
                  stiffness: 260,
                  damping: 20,
                }}
                className="relative cursor-pointer"
                onMouseEnter={() => onDestinationHover(destination.id)}
                onMouseLeave={() => onDestinationHover(null)}
              >
                {/* Pulse effect for liked items */}
                {isLiked && (
                  <motion.div
                    className="absolute inset-0"
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ 
                      scale: [1, 1.5, 1.8],
                      opacity: [0.5, 0.2, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: 'easeOut',
                    }}
                    style={{
                      backgroundColor: color,
                      borderRadius: '50%',
                      width: '40px',
                      height: '40px',
                      transform: 'translate(-50%, -50%)',
                      top: '50%',
                      left: '50%',
                    }}
                  />
                )}

                {/* Main marker */}
                <div
                  className={cn(
                    'relative flex items-center justify-center',
                    'w-10 h-10 rounded-full shadow-lg',
                    'transition-all duration-200',
                    isLiked && 'ring-4 ring-white',
                  )}
                  style={{
                    backgroundColor: isLiked ? color : `${color}20`,
                    borderColor: color,
                    borderWidth: '2px',
                    borderStyle: 'solid',
                  }}
                >
                  <span className="text-lg">{categoryIcons[destination.category]}</span>
                </div>

                {/* Action buttons */}
                <div className={cn(
                  'absolute -bottom-8 left-1/2 transform -translate-x-1/2',
                  'flex gap-1 bg-white rounded-full shadow-md p-1',
                  'transition-all duration-200',
                  isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
                )}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLike(destination.id);
                    }}
                    className={cn(
                      'p-1.5 rounded-full transition-colors',
                      isLiked ? 'bg-red-500 text-white' : 'hover:bg-gray-100',
                    )}
                  >
                    <Heart className="w-4 h-4" fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDislike(destination.id);
                    }}
                    className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Hover card with details */}
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10"
                    style={{ minWidth: '200px' }}
                  >
                    <div className="bg-white rounded-lg shadow-xl p-3 text-sm">
                      <h3 className="font-semibold text-gray-900 mb-1">{destination.name}</h3>
                      <p className="text-gray-600 text-xs mb-2 line-clamp-2">{destination.description}</p>
                      
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        {destination.rating && (
                          <div className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-current text-yellow-500" />
                            <span>{destination.rating}</span>
                          </div>
                        )}
                        {destination.priceLevel && (
                          <div className="flex items-center">
                            {Array.from({ length: destination.priceLevel.length }).map((_, i) => (
                              <DollarSign key={i} className="w-3 h-3 text-green-600" />
                            ))}
                          </div>
                        )}
                        {destination.estimatedDuration && (
                          <div className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            <span>{destination.estimatedDuration}</span>
                          </div>
                        )}
                      </div>
                      
                      {destination.tags && destination.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {destination.tags.slice(0, 3).map(tag => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </Marker>
          );
        })}
      </AnimatePresence>
    </MapGL>
  );
}