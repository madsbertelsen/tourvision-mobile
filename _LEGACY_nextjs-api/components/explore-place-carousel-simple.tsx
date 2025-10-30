'use client';

import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Heart,
  MapPin,
  Star,
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

interface ExplorePlaceCarouselProps {
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

function SimpleCard({ 
  place,
  onLike,
  onDislike,
  isLiked,
  isDisliked,
  isFocused,
  onMouseEnter,
  onMouseLeave
}: { 
  place: Place;
  onLike: () => void;
  onDislike: () => void;
  isLiked: boolean;
  isDisliked: boolean;
  isFocused: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div 
      className="h-[140px] px-4"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={cn(
        "h-full bg-background rounded-xl p-4 border-2 shadow-lg transition-all duration-300",
        isFocused && "border-primary shadow-2xl",
        !isFocused && "border-border/50 shadow-md",
        isLiked && "border-green-500/50 bg-green-500/5",
        isDisliked && "border-red-500/50 bg-red-500/5"
      )}>
        <div className="flex gap-3 h-full">
          {/* Thumbnail */}
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
            {place.imageUrl ? (
              <img
                src={place.imageUrl}
                alt={place.placeName}
                className="size-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <span className="text-2xl opacity-60">
                {categoryEmojis[place.category]}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-base truncate">{place.placeName}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground capitalize">{place.category}</span>
              {place.rating && (
                <>
                  <Star className="size-3 fill-yellow-500 text-yellow-500" />
                  <span className="text-sm">{place.rating}</span>
                </>
              )}
            </div>
            {place.estimatedDuration && (
              <span className="text-xs text-muted-foreground">Duration: {place.estimatedDuration}</span>
            )}
          </div>

          {/* Action buttons - only visible for focused card */}
          {isFocused && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDislike}
                className={cn(
                  "px-3 rounded-lg transition-colors flex items-center justify-center",
                  isDisliked 
                    ? "bg-red-500/20 text-red-500 border border-red-500/30" 
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
              >
                <X className="size-4" />
                <span className="ml-1 text-sm font-medium">Skip</span>
              </button>
              <button
                type="button"
                onClick={onLike}
                className={cn(
                  "px-3 rounded-lg transition-colors flex items-center justify-center",
                  isLiked 
                    ? "bg-green-500/20 text-green-500 border border-green-500/30" 
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                <Heart className={cn("size-4", isLiked && "fill-current")} />
                <span className="ml-1 text-sm font-medium">Add</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExplorePlaceCarousel({
  city,
  places,
  onComplete,
}: ExplorePlaceCarouselProps) {
  const [reactions, setReactions] = useState<Map<string, 'like' | 'dislike'>>(new Map());
  const [hoveredPlace, setHoveredPlace] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0); // Index in displayedPlaces array
  const [displayedPlaces, setDisplayedPlaces] = useState<Place[]>([]);
  const [focusedPlace, setFocusedPlace] = useState<Place | null>(null);
  const [autoScrollToNew, setAutoScrollToNew] = useState(true); // Track if we should auto-scroll to new cards
  const mapRef = useRef<any>(null);

  // Add places one by one (insert at beginning of array)
  useEffect(() => {
    if (displayedPlaces.length < places.length) {
      const timer = setTimeout(() => {
        const nextPlace = places[displayedPlaces.length];
        // Add new place at the beginning (index 0)
        setDisplayedPlaces(prev => [nextPlace, ...prev]);
        // Increment currentIndex to maintain focus on the same relative position
        // This prevents the view from jumping
        if (displayedPlaces.length > 0) {
          setCurrentIndex(prev => prev + 1);
        }
        setFocusedPlace(nextPlace);
      }, 2500); // 2.5 seconds between additions

      return () => clearTimeout(timer);
    }
  }, [displayedPlaces, places]);

  // Update focused place when currentIndex changes
  useEffect(() => {
    if (displayedPlaces.length > 0 && currentIndex < displayedPlaces.length) {
      setFocusedPlace(displayedPlaces[currentIndex]);
    }
  }, [currentIndex, displayedPlaces]);

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

    // Auto-advance after reaction (move to next newer card)
    setTimeout(() => {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    }, 300);
  };

  const likedCount = Array.from(reactions.values()).filter(r => r === 'like').length;
  const isComplete = reactions.size === places.length && places.length > 0;

  // Calculate container translation to keep current card in center
  // currentIndex tracks which card should be in the center position
  // When a new card is added at index 0, we increment currentIndex to stay on the same card
  // This creates a smooth scroll effect where new cards slide in from the top
  const containerTranslateY = (currentIndex - 1) * 140;

  return (
    <div className="relative h-[600px]">
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
            <MapIcon className="size-4" />
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
                <div className="animate-spin rounded-full size-8 border-b-2 border-primary mx-auto mb-2" />
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
              latestPlaceIndex={0}
              onPlaceHover={setHoveredPlace}
              onPlaceClick={(placeName) => {
                const index = displayedPlaces.findIndex(p => p.placeName === placeName);
                if (index !== -1) {
                  setCurrentIndex(index);
                }
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Carousel Container */}
      <div className="absolute left-0 top-[65px] w-[360px] h-[420px] z-10">
        {/* Viewport with overflow hidden */}
        <div className="relative h-full overflow-hidden">
          {/* Container that moves */}
          <div 
            className="transition-transform duration-700 ease-out pt-[140px]"
            style={{ transform: `translateY(-${containerTranslateY}px)` }}
          >
            {displayedPlaces.length === 0 ? (
              <div className="text-center bg-background/80 backdrop-blur-md rounded-xl p-8 border mx-4">
                <div className="animate-pulse">
                  <MapPin className="size-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">Loading places...</p>
                </div>
              </div>
            ) : (
              displayedPlaces.map((place, index) => (
                <SimpleCard
                  key={place.placeName}
                  place={place}
                  onLike={() => handleReaction(place.placeName, 'like')}
                  onDislike={() => handleReaction(place.placeName, 'dislike')}
                  isLiked={reactions.get(place.placeName) === 'like'}
                  isDisliked={reactions.get(place.placeName) === 'dislike'}
                  isFocused={index === currentIndex}
                  onMouseEnter={() => setHoveredPlace(place.placeName)}
                  onMouseLeave={() => setHoveredPlace(null)}
                />
              ))
            )}
          </div>

          {/* Completion Message */}
          {isComplete && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[320px]">
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-3 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-blue-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Great choices!</p>
                    <p className="text-xs text-muted-foreground">
                      {likedCount} places selected
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}