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

function CarouselCard({ 
  place,
  onLike,
  onDislike,
  isLiked,
  isDisliked,
  position,
  onMouseEnter,
  onMouseLeave
}: { 
  place: Place;
  onLike: () => void;
  onDislike: () => void;
  isLiked: boolean;
  isDisliked: boolean;
  position: 'above' | 'top' | 'center' | 'bottom' | 'below' | 'hidden';
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const getPositionStyles = () => {
    switch (position) {
      case 'above':
        return 'translate-y-[-350%] opacity-0 pointer-events-none';
      case 'top':
        return 'translate-y-[-140%] opacity-100';
      case 'center':
        return 'translate-y-0 opacity-100 z-10';
      case 'bottom':
        return 'translate-y-[140%] opacity-100';
      case 'below':
        return 'translate-y-[350%] opacity-0 pointer-events-none';
      default:
        return 'translate-y-[400%] opacity-0 pointer-events-none';
    }
  };

  return (
    <div 
      className={cn(
        "absolute left-1/2 -translate-x-1/2 w-[320px] h-[120px] transition-all duration-700 ease-out",
        getPositionStyles()
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={cn(
        "relative h-full bg-background rounded-xl p-4 border-2 shadow-lg transition-all duration-300",
        position === 'center' && "border-primary shadow-2xl",
        position !== 'center' && "border-border/50 shadow-md",
        isLiked && "border-green-500/50 bg-green-500/5",
        isDisliked && "border-red-500/50 bg-red-500/5"
      )}>
        <div className="flex gap-3">
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
        </div>

        {/* Action buttons - only visible for center card */}
        {position === 'center' && (
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <button
              type="button"
              onClick={onDislike}
              className={cn(
                "flex-1 py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2",
                isDisliked 
                  ? "bg-red-500/20 text-red-500 border border-red-500/30" 
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              <X className="size-4" />
              <span className="text-sm font-medium">Skip</span>
            </button>
            <button
              type="button"
              onClick={onLike}
              className={cn(
                "flex-1 py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2",
                isLiked 
                  ? "bg-green-500/20 text-green-500 border border-green-500/30" 
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              <Heart className={cn("size-4", isLiked && "fill-current")} />
              <span className="text-sm font-medium">Add</span>
            </button>
          </div>
        )}
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayedPlaces, setDisplayedPlaces] = useState<Place[]>([]);
  const [focusedPlace, setFocusedPlace] = useState<Place | null>(null);
  const mapRef = useRef<any>(null);

  // Add places one by one
  useEffect(() => {
    if (displayedPlaces.length < places.length) {
      const timer = setTimeout(() => {
        const nextPlace = places[displayedPlaces.length];
        setDisplayedPlaces(prev => [...prev, nextPlace]);
        // When adding new cards, increment the index to push cards down
        setCurrentIndex(prev => Math.min(prev + 1, displayedPlaces.length));
        setFocusedPlace(nextPlace);
      }, 2000); // 2 seconds between additions

      return () => clearTimeout(timer);
    }
  }, [displayedPlaces, places]);

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

    // Auto-advance: increment index to show next card (cards flow downward)
    setTimeout(() => {
      if (currentIndex < displayedPlaces.length - 1) {
        setCurrentIndex(currentIndex + 1);
        // Update focused place to the new center card
        const newCenterIndex = displayedPlaces.length - 1 - (currentIndex + 1);
        if (newCenterIndex >= 0 && newCenterIndex < displayedPlaces.length) {
          setFocusedPlace(displayedPlaces[newCenterIndex]);
        }
      }
    }, 300);
  };

  const getCardPosition = (index: number): 'above' | 'top' | 'center' | 'bottom' | 'below' | 'hidden' => {
    // Reverse the index so newest items (higher index) appear at top
    const reversedIndex = displayedPlaces.length - 1 - index;
    const diff = reversedIndex - currentIndex;
    
    if (diff < -1) return 'below';
    if (diff === -1) return 'bottom';
    if (diff === 0) return 'center';
    if (diff === 1) return 'top';
    if (diff > 1) return 'above';
    return 'hidden';
  };

  const likedCount = Array.from(reactions.values()).filter(r => r === 'like').length;
  const isComplete = reactions.size === places.length && places.length > 0;

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
              latestPlaceIndex={displayedPlaces.length - 1}
              onPlaceHover={setHoveredPlace}
              onPlaceClick={(placeName) => {
                const index = displayedPlaces.findIndex(p => p.placeName === placeName);
                if (index !== -1) {
                  setCurrentIndex(index);
                  setFocusedPlace(displayedPlaces[index]);
                }
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Carousel Container */}
      <div className="absolute left-0 top-[65px] w-[360px] h-[450px] z-10 pointer-events-none">
        <div className="relative h-full pointer-events-auto">
          {/* Cards Container */}
          <div className="relative h-full flex items-center justify-center">
            {displayedPlaces.length === 0 ? (
              <div className="text-center bg-background/80 backdrop-blur-md rounded-xl p-8 border">
                <div className="animate-pulse">
                  <MapPin className="size-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">Loading places...</p>
                </div>
              </div>
            ) : (
              displayedPlaces.map((place, index) => (
                <CarouselCard
                  key={place.placeName}
                  place={place}
                  onLike={() => handleReaction(place.placeName, 'like')}
                  onDislike={() => handleReaction(place.placeName, 'dislike')}
                  isLiked={reactions.get(place.placeName) === 'like'}
                  isDisliked={reactions.get(place.placeName) === 'dislike'}
                  position={getCardPosition(index)}
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