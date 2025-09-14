'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Filter, Send, Map, List, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useExplorationPreferences } from '@/hooks/use-exploration-preferences';
import { DestinationCard } from '@/components/exploration/destination-card';
import type { Destination, ExplorationData } from './types';

// Lazy load the map component
const ExplorationMap = lazy(() => 
  import('@/components/exploration/exploration-map').then(mod => ({ 
    default: mod.ExplorationMap 
  }))
);

interface ExplorationArtifactProps {
  content: string;
  isReadonly?: boolean;
  onGenerateItinerary?: (likedDestinations: Destination[]) => void;
}

const categoryOptions = [
  { value: 'attraction', label: 'Attractions', icon: '🏛️' },
  { value: 'restaurant', label: 'Restaurants', icon: '🍽️' },
  { value: 'activity', label: 'Activities', icon: '🎭' },
  { value: 'accommodation', label: 'Hotels', icon: '🏨' },
  { value: 'shopping', label: 'Shopping', icon: '🛍️' },
  { value: 'nature', label: 'Nature', icon: '🌳' },
];

export function ExplorationArtifact({ 
  content, 
  isReadonly,
  onGenerateItinerary,
}: ExplorationArtifactProps) {
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [hoveredDestination, setHoveredDestination] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  const {
    preferences,
    toggleLike,
    toggleDislike,
    toggleCategory,
    getLikedDestinations,
    getFilteredDestinations,
  } = useExplorationPreferences();

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

  const likedDestinations = getLikedDestinations(explorationData.destinations);
  const filteredDestinations = getFilteredDestinations(explorationData.destinations);

  const handleGenerateItinerary = () => {
    if (onGenerateItinerary && likedDestinations.length > 0) {
      onGenerateItinerary(likedDestinations);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Explore {explorationData.city}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select places you'd like to visit
            </p>
          </div>
          
          {/* View mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'map' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('map')}
            >
              <Map className="w-4 h-4 mr-1" />
              Map
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4 mr-1" />
              List
            </Button>
          </div>
        </div>

        {/* Stats and filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <Heart className="w-4 h-4 text-red-500" fill="currentColor" />
              <span className="font-medium">{likedDestinations.length}</span> liked
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {filteredDestinations.length} of {explorationData.destinations.length} showing
            </span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-1" />
            Filters
          </Button>
        </div>

        {/* Category filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t dark:border-gray-700">
                {categoryOptions.map(category => (
                  <button
                    key={category.value}
                    onClick={() => toggleCategory(category.value)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                      preferences.categories.has(category.value)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                    )}
                  >
                    <span className="mr-1">{category.icon}</span>
                    {category.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map or List view */}
        <div className="flex-1 relative">
          {viewMode === 'map' ? (
            <Suspense 
              fallback={
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              }
            >
              <ExplorationMap
                destinations={explorationData.destinations}
                likedIds={preferences.liked}
                dislikedIds={preferences.disliked}
                onToggleLike={toggleLike}
                onToggleDislike={toggleDislike}
                visibleCategories={preferences.categories}
                hoveredDestination={hoveredDestination}
                onDestinationHover={setHoveredDestination}
              />
            </Suspense>
          ) : (
            <div className="h-full overflow-y-auto p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {filteredDestinations.map((destination, index) => (
                    <DestinationCard
                      key={destination.id}
                      destination={destination}
                      isLiked={preferences.liked.has(destination.id)}
                      onToggleLike={() => toggleLike(destination.id)}
                      onRemove={() => toggleDislike(destination.id)}
                      onHover={() => setHoveredDestination(destination.id)}
                      onHoverEnd={() => setHoveredDestination(null)}
                      index={index}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Liked destinations sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-l dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Your Selections
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Places you want to visit
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {likedDestinations.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Heart className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No places selected yet</p>
                <p className="text-xs mt-1">Click the heart icon to add places</p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {likedDestinations.map((destination, index) => (
                    <DestinationCard
                      key={destination.id}
                      destination={destination}
                      isLiked={true}
                      onToggleLike={() => toggleLike(destination.id)}
                      onRemove={() => toggleLike(destination.id)}
                      onHover={() => setHoveredDestination(destination.id)}
                      onHoverEnd={() => setHoveredDestination(null)}
                      index={index}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
          
          {/* Generate itinerary button */}
          <div className="p-4 border-t dark:border-gray-700">
            <Button
              className="w-full"
              size="lg"
              disabled={likedDestinations.length === 0 || isReadonly}
              onClick={handleGenerateItinerary}
            >
              <Send className="w-4 h-4 mr-2" />
              Generate Itinerary ({likedDestinations.length})
            </Button>
            {likedDestinations.length < 3 && likedDestinations.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                Select at least 3 places for a better itinerary
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Export the artifact definition
export const explorationArtifact = {
  kind: 'exploration' as const,
  content: ExplorationArtifact,
  actions: [], // No actions needed for exploration view
  toolbar: [], // No toolbar items needed for exploration view
};