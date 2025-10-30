'use client';

import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Heart,
  MapPin,
  Star,
  MapIcon,
  Sparkles,
  X,
  Expand
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useArtifact } from '@/hooks/use-artifact';

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
  documentId?: string;
  documentTitle?: string;
}

const categoryEmojis = {
  attraction: '🏛️',
  restaurant: '🍽️',
  activity: '🎭',
  accommodation: '🏨',
  shopping: '🛍️',
  nature: '🌳',
};

function SingleCard({ 
  place,
  onLike,
  onDislike,
  position
}: { 
  place: Place;
  onLike: () => void;
  onDislike: () => void;
  position: 'entering' | 'center' | 'exiting' | 'hidden';
}) {
  const getPositionStyles = () => {
    switch (position) {
      case 'entering':
        return '-translate-y-[200%] opacity-0';  // Start above (negative Y)
      case 'center':
        return 'translate-y-0 opacity-100';
      case 'exiting':
        return 'translate-y-[200%] opacity-0';  // Exit below (positive Y)
      case 'hidden':
        return '-translate-y-[200%] opacity-0 pointer-events-none';
      default:
        return '-translate-y-[200%] opacity-0 pointer-events-none';
    }
  };

  return (
    <div 
      className={cn(
        "absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[320px] transition-all duration-1000 ease-in-out",
        getPositionStyles()
      )}
    >
      <div className="bg-background rounded-xl p-4 border-2 border-primary shadow-2xl">
        <div className="flex gap-3">
          {/* Thumbnail - increased size */}
          <div className="w-32 h-32 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
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
              <span className="text-3xl opacity-60">
                {categoryEmojis[place.category]}
              </span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-lg truncate">{place.placeName}</h4>
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

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 pt-4 border-t">
          <button
            type="button"
            onClick={onDislike}
            className="flex-1 py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-muted-foreground"
          >
            <X className="size-4" />
            <span className="text-sm font-medium">Skip</span>
          </button>
          <button
            type="button"
            onClick={onLike}
            className="flex-1 py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Heart className="size-4" />
            <span className="text-sm font-medium">Add</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExplorePlaceCarouselSingle({
  city,
  places,
  onComplete,
  documentId,
  documentTitle,
}: ExplorePlaceCarouselProps) {
  const [reactions, setReactions] = useState<Map<string, 'like' | 'dislike'>>(new Map());
  const [hoveredPlace, setHoveredPlace] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [currentPlaceIndex, setCurrentPlaceIndex] = useState(0);
  const [cardPosition, setCardPosition] = useState<'entering' | 'center' | 'exiting' | 'hidden'>('entering');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const mapRef = useRef<any>(null);
  const { setArtifact } = useArtifact();

  // Current place being shown
  const currentPlace = places[currentPlaceIndex];

  // Initial animation - bring first card to center
  useEffect(() => {
    if (currentPlaceIndex === 0 && cardPosition === 'entering') {
      const timer = setTimeout(() => {
        setCardPosition('center');
      }, 500); // Increased from 100ms to 500ms for consistency
      return () => clearTimeout(timer);
    }
  }, [currentPlaceIndex, cardPosition]);

  // Auto-advance to next place
  useEffect(() => {
    if (currentPlaceIndex < places.length - 1 && !isTransitioning) {
      const timer = setTimeout(() => {
        // Start transition
        setIsTransitioning(true);
        setCardPosition('exiting');
        
        // After exit animation, switch to next card
        setTimeout(() => {
          setCurrentPlaceIndex(prev => prev + 1);
          setCardPosition('entering');
          
          // Bring new card to center - give more time for entering animation
          setTimeout(() => {
            setCardPosition('center');
            setIsTransitioning(false);
          }, 500); // Increased from 100ms to 500ms
        }, 1000);
      }, 3000); // Show each card for 3 seconds

      return () => clearTimeout(timer);
    }
  }, [currentPlaceIndex, places.length, isTransitioning]);

  // Check if all places have been reacted to
  useEffect(() => {
    if (reactions.size === places.length && places.length > 0) {
      const timer = setTimeout(() => {
        onComplete?.(reactions);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [reactions, places.length, onComplete]);

  const handleReaction = (reaction: 'like' | 'dislike') => {
    if (!currentPlace || isTransitioning) return;
    
    const newReactions = new Map(reactions);
    newReactions.set(currentPlace.placeName, reaction);
    setReactions(newReactions);

    // Move to next card after reaction
    if (currentPlaceIndex < places.length - 1) {
      setIsTransitioning(true);
      setCardPosition('exiting');
      
      setTimeout(() => {
        setCurrentPlaceIndex(prev => prev + 1);
        setCardPosition('entering');
        
        setTimeout(() => {
          setCardPosition('center');
          setIsTransitioning(false);
        }, 500); // Increased from 100ms to 500ms
      }, 1000);
    }
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                if (documentId && documentTitle) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  
                  setArtifact({
                    documentId: documentId,
                    kind: 'text',
                    content: '',
                    title: documentTitle,
                    isVisible: true,
                    status: 'idle',
                    boundingBox: {
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height,
                    },
                  });
                }
              }}
              className="flex items-center gap-2"
              title="Open full view"
              disabled={!documentId}
            >
              <Expand className="size-4" />
            </Button>
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
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
              style={{ width: `${((currentPlaceIndex + 1) / places.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {currentPlaceIndex + 1}/{places.length}
          </span>
        </div>
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
              places={places.slice(0, currentPlaceIndex + 1)}
              reactions={reactions}
              hoveredPlace={hoveredPlace}
              focusedPlace={currentPlace}
              latestPlaceIndex={currentPlaceIndex}
              onPlaceHover={setHoveredPlace}
              onPlaceClick={(placeName) => {
                // Find and jump to that place
                const index = places.findIndex(p => p.placeName === placeName);
                if (index !== -1 && index !== currentPlaceIndex) {
                  setCurrentPlaceIndex(index);
                }
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Single Card Container */}
      <div className="absolute left-0 top-[65px] w-[360px] h-[450px] z-10 pointer-events-none">
        <div className="relative h-full pointer-events-auto">
          {currentPlace && (
            <SingleCard
              place={currentPlace}
              onLike={() => handleReaction('like')}
              onDislike={() => handleReaction('dislike')}
              position={cardPosition}
            />
          )}

          {/* Completion Message */}
          {isComplete && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[320px]">
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