'use client';

import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  Heart,
  Check,
  MapPin,
  Star,
  DollarSign,
  Clock,
  Info,
  Map as MapIcon,
  ArrowRight,
  Sparkles
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

interface ExplorePlaceHorizontalScrollProps {
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

function PlaceCard({ 
  place,
  onLike,
  onDislike,
  isLiked,
  isDisliked
}: { 
  place: Place;
  onLike: () => void;
  onDislike: () => void;
  isLiked: boolean;
  isDisliked: boolean;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Convert price level to dollar signs
  const getPriceDisplay = (priceLevel?: string) => {
    if (!priceLevel) return null;
    const count = priceLevel.split('$').length - 1 || priceLevel.length;
    return '$'.repeat(Math.min(count, 4));
  };

  return (
    <div className="relative flex-shrink-0 w-[260px] sm:w-[300px] group">
      <div className="relative h-[360px] sm:h-[400px] rounded-2xl overflow-hidden bg-muted shadow-lg transition-transform duration-300 hover:scale-[1.02]">
        {/* Image */}
        <div className="relative h-[220px] sm:h-[250px] overflow-hidden bg-gradient-to-br from-muted to-muted-foreground/20">
          {place.imageUrl ? (
            <>
              <img
                src={place.imageUrl}
                alt={place.placeName}
                className={cn(
                  "h-full w-full object-cover transition-all duration-700",
                  imageLoaded ? "scale-100 blur-0" : "scale-110 blur-sm"
                )}
                onLoad={() => setImageLoaded(true)}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-6xl opacity-30">
              {categoryEmojis[place.category]}
            </div>
          )}

          {/* Action Buttons - Overlay on Image */}
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={onDislike}
              className={cn(
                "rounded-full p-2.5 backdrop-blur-md transition-all",
                isDisliked 
                  ? "bg-gray-500 text-white scale-110" 
                  : "bg-white/90 hover:bg-white shadow-lg hover:scale-110"
              )}
              disabled={isDisliked || isLiked}
            >
              <Heart className={cn("h-5 w-5", isDisliked && "fill-current")} />
            </button>
            <button
              onClick={onLike}
              className={cn(
                "rounded-full p-2.5 backdrop-blur-md transition-all",
                isLiked 
                  ? "bg-blue-500 text-white scale-110" 
                  : "bg-white/90 hover:bg-white shadow-lg hover:scale-110"
              )}
              disabled={isDisliked || isLiked}
            >
              <Check className={cn("h-5 w-5", isLiked && "stroke-[3]")} />
            </button>
          </div>

          {/* Info Button */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="absolute bottom-3 right-3 rounded-full bg-white/90 backdrop-blur-md p-2 shadow-lg hover:bg-white transition-all"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Title */}
          <div>
            <h3 className="font-semibold text-lg line-clamp-1">{place.placeName}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <span>{categoryEmojis[place.category]}</span>
              <span className="capitalize">{place.category}</span>
            </p>
          </div>

          {/* Quick Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {place.rating && (
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                <span>{place.rating}</span>
              </div>
            )}
            {place.priceLevel && (
              <div className="flex items-center gap-1">
                <span className="font-medium">{getPriceDisplay(place.priceLevel)}</span>
              </div>
            )}
            {place.estimatedDuration && (
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>{place.estimatedDuration}</span>
              </div>
            )}
          </div>

          {/* Description or Why Visit */}
          <p className="text-xs text-muted-foreground line-clamp-2">
            {showDetails ? place.whyVisit : place.description}
          </p>
        </div>

        {/* Status Overlay */}
        {(isLiked || isDisliked) && (
          <div className={cn(
            "absolute inset-0 flex items-center justify-center backdrop-blur-sm rounded-2xl transition-opacity duration-300",
            isLiked ? "bg-blue-500/20" : "bg-gray-500/20"
          )}>
            <div className={cn(
              "rounded-full p-4",
              isLiked ? "bg-blue-500" : "bg-gray-500"
            )}>
              {isLiked ? (
                <Check className="h-8 w-8 text-white stroke-[3]" />
              ) : (
                <Heart className="h-8 w-8 text-white fill-white" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ExplorePlaceHorizontalScroll({
  city,
  places,
  onComplete,
}: ExplorePlaceHorizontalScrollProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [reactions, setReactions] = useState<Map<string, 'like' | 'dislike'>>(new Map());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [hoveredPlace, setHoveredPlace] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  // Check if all places have been reacted to
  useEffect(() => {
    if (reactions.size === places.length && places.length > 0) {
      // Small delay before calling onComplete
      const timer = setTimeout(() => {
        onComplete?.(reactions);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [reactions, places.length, onComplete]);

  // Update scroll button states
  const updateScrollButtons = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', updateScrollButtons);
      updateScrollButtons();
      return () => container.removeEventListener('scroll', updateScrollButtons);
    }
  }, []);

  const handleReaction = (placeName: string, reaction: 'like' | 'dislike') => {
    const newReactions = new Map(reactions);
    newReactions.set(placeName, reaction);
    setReactions(newReactions);
  };

  const scrollTo = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      // Adjust scroll amount based on screen size
      const scrollAmount = window.innerWidth < 640 ? 276 : 316; // Card width + gap
      const currentScroll = scrollContainerRef.current.scrollLeft;
      const targetScroll = direction === 'left' 
        ? currentScroll - scrollAmount 
        : currentScroll + scrollAmount;
      
      scrollContainerRef.current.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  const likedCount = Array.from(reactions.values()).filter(r => r === 'like').length;
  const skippedCount = Array.from(reactions.values()).filter(r => r === 'dislike').length;
  const isComplete = reactions.size === places.length && places.length > 0;

  // Handle scroll to a specific place card
  const scrollToPlace = (placeName: string) => {
    const placeIndex = places.findIndex(p => p.placeName === placeName);
    if (placeIndex !== -1 && scrollContainerRef.current) {
      const scrollAmount = window.innerWidth < 640 ? 276 : 316;
      const targetScroll = placeIndex * scrollAmount;
      scrollContainerRef.current.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="space-y-4 overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">
            Discover the best of {city}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Select the places you'd like to include in your itinerary
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
        <div className="flex items-center gap-4 px-4 sm:px-6">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
              style={{ width: `${(reactions.size / places.length) * 100}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {reactions.size} / {places.length}
          </span>
        </div>
      )}
      
      {/* Completion Message */}
      {isComplete && (
        <div className="px-4 sm:px-6">
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium">Great choices!</p>
                  <p className="text-sm text-muted-foreground">
                    You've selected {likedCount} place{likedCount !== 1 ? 's' : ''} for your {city} itinerary
                  </p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                The AI will now build your personalized itinerary
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map View */}
      {showMap && (
        <div className="px-4 sm:px-6">
          <div className="h-[300px] rounded-lg overflow-hidden border">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full bg-muted/50">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading map...</p>
                </div>
              </div>
            }>
              <ExplorePlaceMap
                city={city}
                places={places}
                reactions={reactions}
                hoveredPlace={hoveredPlace}
                onPlaceHover={(placeName) => {
                  setHoveredPlace(placeName);
                  if (placeName) {
                    scrollToPlace(placeName);
                  }
                }}
                onPlaceClick={(placeName) => {
                  scrollToPlace(placeName);
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Scrollable Cards Container */}
      <div className="relative overflow-hidden max-w-full">
        {/* Left Scroll Button */}
        {canScrollLeft && (
          <button
            onClick={() => scrollTo('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/95 backdrop-blur-sm shadow-lg p-2 hover:bg-background transition-all"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* Right Scroll Button */}
        {canScrollRight && (
          <button
            onClick={() => scrollTo('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/95 backdrop-blur-sm shadow-lg p-2 hover:bg-background transition-all"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Cards */}
        <div 
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {places.map((place, index) => (
            <div 
              key={place.placeName} 
              className={cn(
                index === 0 && 'pl-4 sm:pl-6',
                index === places.length - 1 && 'pr-4 sm:pr-6'
              )}
            >
              <div
                onMouseEnter={() => setHoveredPlace(place.placeName)}
                onMouseLeave={() => setHoveredPlace(null)}
              >
                <PlaceCard
                  place={place}
                  onLike={() => handleReaction(place.placeName, 'like')}
                  onDislike={() => handleReaction(place.placeName, 'dislike')}
                  isLiked={reactions.get(place.placeName) === 'like'}
                  isDisliked={reactions.get(place.placeName) === 'dislike'}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      {reactions.size > 0 && (
        <div className="flex items-center justify-center gap-6 text-sm px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/20 p-1.5">
              <Check className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <span>{likedCount} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-gray-100 dark:bg-gray-900/20 p-1.5">
              <Heart className="h-3.5 w-3.5 text-gray-600" />
            </div>
            <span>{skippedCount} saved for later</span>
          </div>
        </div>
      )}

      {/* Completion State */}
      {reactions.size === places.length && places.length > 0 && (
        <div className="mx-4 sm:mx-6 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-6 text-center">
          <div className="flex justify-center mb-3">
            <div className="rounded-full bg-gradient-to-r from-blue-500 to-purple-600 p-3">
              <Check className="h-6 w-6 text-white stroke-[3]" />
            </div>
          </div>
          <h3 className="font-semibold mb-1">Great choices!</h3>
          <p className="text-sm text-muted-foreground">
            Creating your personalized {city} itinerary with {likedCount} selected places...
          </p>
        </div>
      )}
    </div>
  );
}

<style jsx global>{`
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
`}</style>