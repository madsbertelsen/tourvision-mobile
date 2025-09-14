'use client';

import { useState, useMemo, lazy, Suspense, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Heart, 
  X, 
  ChevronRight, 
  ChevronLeft,
  MapPin,
  Clock,
  DollarSign,
  Star,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Destination, ExplorationData } from './types';

// Initialize Mapbox
if (typeof window !== 'undefined' && !mapboxgl.accessToken) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
}

interface SequentialExplorationProps {
  content: string;
  isReadonly?: boolean;
  onGenerateItinerary?: (likedDestinations: Destination[]) => void;
}

const categoryColors = {
  attraction: '#3B82F6',
  restaurant: '#10B981',
  activity: '#8B5CF6',
  accommodation: '#EC4899',
  shopping: '#F59E0B',
  nature: '#84CC16',
};

const categoryIcons = {
  attraction: '🏛️',
  restaurant: '🍽️',
  activity: '🎭',
  accommodation: '🏨',
  shopping: '🛍️',
  nature: '🌳',
};

export function SequentialExploration({ 
  content, 
  isReadonly,
  onGenerateItinerary,
}: SequentialExplorationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedPlaces, setLikedPlaces] = useState<Set<string>>(new Set());
  const [skippedPlaces, setSkippedPlaces] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState(false);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

  // Parse content
  const explorationData: ExplorationData = useMemo(() => {
    try {
      return JSON.parse(content);
    } catch {
      return {
        city: 'Unknown',
        destinations: [],
      };
    }
  }, [content]);

  const currentDestination = explorationData.destinations[currentIndex];
  const totalPlaces = explorationData.destinations.length;
  const isLastPlace = currentIndex >= totalPlaces - 1;
  const hasReacted = currentDestination && (
    likedPlaces.has(currentDestination.id) || 
    skippedPlaces.has(currentDestination.id)
  );

  // Initialize/update map for current destination
  useEffect(() => {
    if (!mapContainer.current || !currentDestination) return;

    // Initialize map if not exists
    if (!map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: currentDestination.coordinates,
        zoom: 15,
        interactive: true,
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    }

    // Clean up existing marker
    if (marker.current) {
      marker.current.remove();
    }

    // Add marker for current destination
    const el = document.createElement('div');
    el.className = 'custom-marker';
    el.style.width = '50px';
    el.style.height = '50px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = categoryColors[currentDestination.category];
    el.style.border = '4px solid white';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontSize = '24px';
    el.innerHTML = categoryIcons[currentDestination.category];

    marker.current = new mapboxgl.Marker(el)
      .setLngLat(currentDestination.coordinates)
      .addTo(map.current);

    // Add popup
    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div class="p-2">
          <h3 class="font-semibold">${currentDestination.name}</h3>
          ${currentDestination.address ? `<p class="text-sm text-gray-600">${currentDestination.address}</p>` : ''}
        </div>
      `);
    
    marker.current.setPopup(popup);
    popup.addTo(map.current);

    // Fly to location with animation
    map.current.flyTo({
      center: currentDestination.coordinates,
      zoom: 16,
      duration: 2000,
      essential: true,
    });

    return () => {
      if (marker.current) {
        marker.current.remove();
      }
    };
  }, [currentDestination]);

  const handleLike = () => {
    if (!currentDestination) return;
    
    setLikedPlaces(prev => {
      const newSet = new Set(prev);
      newSet.add(currentDestination.id);
      return newSet;
    });
    
    // Remove from skipped if it was there
    setSkippedPlaces(prev => {
      const newSet = new Set(prev);
      newSet.delete(currentDestination.id);
      return newSet;
    });
  };

  const handleSkip = () => {
    if (!currentDestination) return;
    
    setSkippedPlaces(prev => {
      const newSet = new Set(prev);
      newSet.add(currentDestination.id);
      return newSet;
    });
    
    // Remove from liked if it was there
    setLikedPlaces(prev => {
      const newSet = new Set(prev);
      newSet.delete(currentDestination.id);
      return newSet;
    });
  };

  const handleNext = () => {
    if (isLastPlace) {
      setShowSummary(true);
    } else {
      setCurrentIndex(prev => Math.min(prev + 1, totalPlaces - 1));
    }
  };

  const handlePrevious = () => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
    setShowSummary(false);
  };

  const handleGenerateItinerary = () => {
    if (onGenerateItinerary) {
      const likedDestinations = explorationData.destinations.filter(
        d => likedPlaces.has(d.id)
      );
      onGenerateItinerary(likedDestinations);
    }
  };

  // Show summary view
  if (showSummary) {
    const likedDestinations = explorationData.destinations.filter(
      d => likedPlaces.has(d.id)
    );

    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="w-full max-w-2xl p-8">
            <div className="text-center mb-8">
              <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-2">Exploration Complete!</h2>
              <p className="text-gray-600 dark:text-gray-400">
                You've reviewed all {totalPlaces} places in {explorationData.city}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Heart className="w-8 h-8 text-red-500 fill-red-500" />
                </div>
                <div className="text-3xl font-bold">{likedPlaces.size}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Places Liked</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <XCircle className="w-8 h-8 text-gray-400" />
                </div>
                <div className="text-3xl font-bold">{skippedPlaces.size}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Places Skipped</div>
              </div>
            </div>

            {likedDestinations.length > 0 && (
              <div className="mb-8">
                <h3 className="font-semibold mb-3">Your Selected Places:</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {likedDestinations.map(dest => (
                    <div key={dest.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <span className="text-lg">{categoryIcons[dest.category]}</span>
                      <span className="flex-1">{dest.name}</span>
                      {dest.rating && (
                        <span className="flex items-center gap-1 text-sm text-gray-600">
                          <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                          {dest.rating}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="flex-1"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Review Again
              </Button>
              <Button
                onClick={handleGenerateItinerary}
                disabled={likedPlaces.size === 0}
                className="flex-1"
              >
                Generate Itinerary ({likedPlaces.size})
              </Button>
            </div>

            {likedPlaces.size === 0 && (
              <p className="text-center text-sm text-gray-500 mt-4">
                You need to like at least one place to generate an itinerary
              </p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  if (!currentDestination) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Progress bar */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Exploring {explorationData.city}
          </h2>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {currentIndex + 1} of {totalPlaces}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <motion.div
            className="bg-blue-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / totalPlaces) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Map view */}
        <div className="flex-1 relative">
          <div ref={mapContainer} className="w-full h-full" />
          
          {/* Floating place info card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            key={currentDestination.id}
            className="absolute bottom-4 left-4 right-4 lg:left-auto lg:right-4 lg:w-96"
          >
            <Card className="p-6 bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow-xl">
              <div className="mb-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-xl font-bold">{currentDestination.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {currentDestination.description}
                    </p>
                  </div>
                  <span
                    className="px-2 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: categoryColors[currentDestination.category] }}
                  >
                    {currentDestination.category}
                  </span>
                </div>

                {/* Metadata */}
                <div className="flex flex-wrap gap-3 mt-3 text-sm">
                  {currentDestination.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span>{currentDestination.rating}/5</span>
                    </div>
                  )}
                  {currentDestination.priceLevel && (
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-4 h-4 text-gray-500" />
                      <span>{currentDestination.priceLevel}</span>
                    </div>
                  )}
                  {currentDestination.estimatedDuration && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{currentDestination.estimatedDuration}</span>
                    </div>
                  )}
                  {currentDestination.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        {currentDestination.address}
                      </span>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {currentDestination.tags && currentDestination.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {currentDestination.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                {!hasReacted ? (
                  <>
                    <Button
                      onClick={handleSkip}
                      variant="outline"
                      className="flex-1"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Skip
                    </Button>
                    <Button
                      onClick={handleLike}
                      className="flex-1 bg-red-500 hover:bg-red-600"
                    >
                      <Heart className="w-4 h-4 mr-2" />
                      Like
                    </Button>
                  </>
                ) : (
                  <>
                    {likedPlaces.has(currentDestination.id) ? (
                      <div className="flex-1 flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Added to your list!</span>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center gap-2 text-gray-500">
                        <XCircle className="w-5 h-5" />
                        <span>Skipped</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Navigation */}
              {hasReacted && (
                <div className="flex gap-3 mt-3">
                  <Button
                    onClick={handlePrevious}
                    variant="outline"
                    disabled={currentIndex === 0}
                    className="flex-1"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>
                  <Button
                    onClick={handleNext}
                    className="flex-1"
                  >
                    {isLastPlace ? 'View Summary' : 'Next Place'}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}
            </Card>
          </motion.div>
        </div>

        {/* Stats sidebar (desktop only) */}
        <div className="hidden lg:block w-80 bg-white dark:bg-gray-800 border-l dark:border-gray-700 p-6">
          <h3 className="font-semibold mb-4">Your Progress</h3>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Places Reviewed</span>
                <span className="font-medium">{currentIndex + 1}/{totalPlaces}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded h-2">
                <div
                  className="bg-blue-500 h-2 rounded transition-all duration-300"
                  style={{ width: `${((currentIndex + 1) / totalPlaces) * 100}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded">
                <Heart className="w-6 h-6 text-red-500 mx-auto mb-1" fill="currentColor" />
                <div className="text-2xl font-bold">{likedPlaces.size}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Liked</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                <XCircle className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                <div className="text-2xl font-bold">{skippedPlaces.size}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Skipped</div>
              </div>
            </div>

            {likedPlaces.size > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Places You Liked:</h4>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {explorationData.destinations
                    .filter(d => likedPlaces.has(d.id))
                    .map(dest => (
                      <div key={dest.id} className="text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded flex items-center gap-2">
                        <span>{categoryIcons[dest.category]}</span>
                        <span className="truncate">{dest.name}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Export the artifact definition
export const sequentialExplorationArtifact = {
  kind: 'exploration' as const,
  content: SequentialExploration,
  actions: [],
  toolbar: [],
};