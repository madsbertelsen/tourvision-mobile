'use client';

import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Heart,
  MapPin,
  Star,
  Clock,
  MapIcon,
  Sparkles,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Lazy load the map component to avoid SSR issues
const ExplorePlaceMap = lazy(() => import('./explore-place-map').then(mod => ({ default: mod.ExplorePlaceMap })));

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

interface ExplorePlaceVerticalListProps {
  city: string;
  places: Place[];
  onComplete?: (reactions: Map<string, 'like' | 'dislike'>) => void;
}

const categoryEmojis = {
  attraction: '🏛️',
  restaurant: '🍽️',
  activity: '🎭',
  accommodation: '🏨',
  shopping: '🛍️',
  nature: '🌳',
};

function CompactPlaceCard({ 
  place,
  onLike,
  onDislike,
  isLiked,
  isDisliked,
  isNew,
  onMouseEnter,
  onMouseLeave
}: { 
  place: Place;
  onLike: () => void;
  onDislike: () => void;
  isLiked: boolean;
  isDisliked: boolean;
  isNew?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div 
      className={cn(
        "relative bg-background/95 backdrop-blur-md rounded-lg p-3 border transition-all duration-300",
        isNew && "animate-slide-in-top",
        isLiked && "border-green-500/50 bg-green-500/5",
        isDisliked && "border-red-500/50 bg-red-500/5 opacity-60",
        !isLiked && !isDisliked && "hover:bg-muted/50"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="flex gap-2">
        {/* Small thumbnail or emoji */}
        <div className="w-10 h-10 rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
          {place.imageUrl ? (
            <img
              src={place.imageUrl}
              alt={place.placeName}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <span className="text-lg opacity-60">
              {categoryEmojis[place.category]}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-2">
          <h4 className="font-medium text-sm truncate">{place.placeName}</h4>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground capitalize">{place.category}</span>
            {place.rating && (
              <>
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 flex-shrink-0" />
                <span className="text-xs">{place.rating}</span>
              </>
            )}
            {place.estimatedDuration && (
              <>
                <span className="text-xs text-muted-foreground">• {place.estimatedDuration}</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onDislike}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isDisliked 
                ? "bg-red-500/20 text-red-500" 
                : "hover:bg-muted text-muted-foreground"
            )}
            aria-label="Skip this place"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={onLike}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              isLiked 
                ? "bg-green-500/20 text-green-500" 
                : "hover:bg-muted text-muted-foreground"
            )}
            aria-label="Add to itinerary"
          >
            <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExplorePlaceVerticalList({
  city,
  places,
  onComplete,
}: ExplorePlaceVerticalListProps) {
  const [reactions, setReactions] = useState<Map<string, 'like' | 'dislike'>>(new Map());
  const [hoveredPlace, setHoveredPlace] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [displayedPlaces, setDisplayedPlaces] = useState<Place[]>([]);
  const [latestPlaceIndex, setLatestPlaceIndex] = useState<number>(-1);
  const [focusedPlace, setFocusedPlace] = useState<Place | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  // Add places one by one with delay for animation
  useEffect(() => {
    if (displayedPlaces.length < places.length) {
      const timer = setTimeout(() => {
        const nextPlace = places[displayedPlaces.length];
        setDisplayedPlaces(prev => [nextPlace, ...prev]); // Add to beginning
        setLatestPlaceIndex(0);
        setFocusedPlace(nextPlace);

        // Scroll to top when new place is added
        if (listRef.current) {
          listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 2500); // 2.5 seconds delay between adding places

      return () => clearTimeout(timer);
    }
  }, [displayedPlaces, places]);

  // Clear "new" state after animation
  useEffect(() => {
    if (latestPlaceIndex >= 0) {
      const timer = setTimeout(() => {
        setLatestPlaceIndex(-1);
      }, 800); // Slightly longer animation duration for smoother effect
      return () => clearTimeout(timer);
    }
  }, [latestPlaceIndex]);

  // Check if all places have been reacted to
  useEffect(() => {
    if (reactions.size === places.length && places.length > 0) {
      const timer = setTimeout(() => {
        onComplete?.(reactions);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [reactions, places.length, onComplete]);

  const handleReaction = (placeName: string, reaction: 'like' | 'dislike') => {
    const newReactions = new Map(reactions);
    if (reactions.get(placeName) === reaction) {
      newReactions.delete(placeName);
    } else {
      newReactions.set(placeName, reaction);
    }
    setReactions(newReactions);
  };

  const likedCount = Array.from(reactions.values()).filter(r => r === 'like').length;
  const isComplete = reactions.size === places.length && places.length > 0;

  return (
    <div className="relative h-[600px] overflow-hidden">
      {/* Header */}
      <div className="relative z-20 bg-background border-b px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold truncate">
              Discover the best of {city}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              Select places for your itinerary
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMap(!showMap)}
            className="flex items-center gap-2"
          >
            <MapIcon className="h-4 w-4" />
            {showMap ? 'Hide Map' : 'Show Map'}
          </Button>
        </div>

        {/* Progress */}
        {reactions.size > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                style={{ width: `${(reactions.size / places.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {reactions.size}/{places.length}
            </span>
          </div>
        )}
      </div>

      {/* Map Background */}
      {showMap && (
        <div className="absolute inset-x-0 top-[65px] bottom-0 z-0">
          <Suspense fallback={
            <div className="flex items-center justify-center h-full bg-muted/50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading map...</p>
              </div>
            </div>
          }>
            <ExplorePlaceMap
              ref={mapRef}
              city={city}
              places={displayedPlaces}
              reactions={reactions}
              hoveredPlace={hoveredPlace}
              focusedPlace={focusedPlace}
              latestPlaceIndex={latestPlaceIndex}
              onPlaceHover={setHoveredPlace}
              onPlaceClick={(placeName) => {
                // Scroll to the card in the list
                const index = displayedPlaces.findIndex(p => p.placeName === placeName);
                if (index !== -1 && listRef.current) {
                  const cards = listRef.current.querySelectorAll('[data-place-card]');
                  cards[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Vertical List Overlay */}
      <div className="absolute left-0 top-[65px] bottom-0 w-[340px] z-10 pointer-events-none">
        <div 
          ref={listRef}
          className="h-full overflow-y-auto pointer-events-auto bg-background/80 backdrop-blur-lg border-r shadow-xl"
          style={{ scrollbarWidth: 'thin' }}
        >
          <div className="p-3 space-y-2">
            {displayedPlaces.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="animate-pulse">
                  <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Loading places...</p>
                </div>
              </div>
            ) : (
              displayedPlaces.map((place, index) => (
                <div key={place.placeName} data-place-card>
                  <CompactPlaceCard
                    place={place}
                    onLike={() => handleReaction(place.placeName, 'like')}
                    onDislike={() => handleReaction(place.placeName, 'dislike')}
                    isLiked={reactions.get(place.placeName) === 'like'}
                    isDisliked={reactions.get(place.placeName) === 'dislike'}
                    isNew={index === latestPlaceIndex}
                    onMouseEnter={() => setHoveredPlace(place.placeName)}
                    onMouseLeave={() => setHoveredPlace(null)}
                  />
                </div>
              ))
            )}

            {/* Completion Message */}
            {isComplete && (
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-blue-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Great choices!</p>
                    <p className="text-xs text-muted-foreground">
                      {likedCount} places selected
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add custom styles */}
      <style jsx>{`
        @keyframes slide-in-top {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in-top {
          animation: slide-in-top 0.5s ease-out;
        }
        
        @keyframes pulse-marker {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.3);
            opacity: 0.7;
          }
        }
        
        .animate-pulse-marker {
          animation: pulse-marker 1.5s ease-in-out 3;
        }
        
        @keyframes focus-marker {
          0% {
            transform: scale(1);
          }
          100% {
            transform: scale(1.15);
          }
        }
        
        .animate-focus-marker {
          animation: focus-marker 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}