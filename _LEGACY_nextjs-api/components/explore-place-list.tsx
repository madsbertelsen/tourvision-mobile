'use client';

import { useState, useRef, lazy, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Heart,
  Star,
  MapIcon,
  Sparkles,
  X,
  Expand,
  Clock
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

interface ExplorePlaceListProps {
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

function PlaceCard({ 
  place,
  onLike,
  onDislike,
  isLiked,
  isDisliked,
  isFocused,
  onMouseEnter,
  onMouseLeave,
  onClick
}: { 
  place: Place;
  onLike: () => void;
  onDislike: () => void;
  isLiked: boolean;
  isDisliked: boolean;
  isFocused: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick?: () => void;
}) {
  return (
    <div 
      className={cn(
        "bg-background rounded-lg p-3 border-2 shadow-sm transition-all duration-300 cursor-pointer",
        isFocused && "border-primary shadow-lg scale-[1.02]",
        !isFocused && "border-border hover:border-border/80",
        isLiked && "border-green-500/50 bg-green-500/5",
        isDisliked && "border-red-500/50 bg-red-500/5 opacity-50"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      <div className="flex gap-3">
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
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
            <span className="text-xl opacity-60">
              {categoryEmojis[place.category]}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm truncate">{place.placeName}</h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground capitalize">{place.category}</span>
            {place.rating && (
              <div className="flex items-center gap-0.5">
                <Star className="size-2.5 fill-yellow-500 text-yellow-500" />
                <span className="text-xs">{place.rating}</span>
              </div>
            )}
          </div>
          {place.estimatedDuration && (
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="size-2.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{place.estimatedDuration}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDislike();
          }}
          className={cn(
            "flex-1 py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1.5 text-xs font-medium",
            isDisliked 
              ? "bg-red-500/20 text-red-500 border border-red-500/30" 
              : "bg-muted hover:bg-muted/80 text-muted-foreground"
          )}
        >
          <X className="size-3" />
          Skip
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLike();
          }}
          className={cn(
            "flex-1 py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1.5 text-xs font-medium",
            isLiked 
              ? "bg-green-500/20 text-green-500 border border-green-500/30" 
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          <Heart className={cn("size-3", isLiked && "fill-current")} />
          Add
        </button>
      </div>
    </div>
  );
}

export function ExplorePlaceList({
  city,
  places,
  onComplete,
  documentId,
  documentTitle,
}: ExplorePlaceListProps) {
  const [reactions, setReactions] = useState<Map<string, 'like' | 'dislike'>>(new Map());
  const [hoveredPlace, setHoveredPlace] = useState<string | null>(null);
  const [focusedPlace, setFocusedPlace] = useState<Place | null>(null);
  const [showMap, setShowMap] = useState(true);
  const mapRef = useRef<any>(null);
  const { setArtifact } = useArtifact();

  const handleReaction = (placeName: string, reaction: 'like' | 'dislike') => {
    const newReactions = new Map(reactions);
    if (reactions.get(placeName) === reaction) {
      newReactions.delete(placeName);
    } else {
      newReactions.set(placeName, reaction);
    }
    setReactions(newReactions);

    // Check if all places have been reacted to
    if (newReactions.size === places.length && places.length > 0) {
      // Get the liked places
      const likedPlaces = Array.from(newReactions.entries())
        .filter(([_, reaction]) => reaction === 'like')
        .map(([placeName, _]) => placeName);
      
      // Generate itinerary if we have a documentId and liked places
      if (documentId && likedPlaces.length > 0) {
        console.log('[ExplorePlaceList] Generating itinerary for', likedPlaces.length, 'liked places');
        
        // Call the API to generate the itinerary
        fetch('/api/itinerary/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId,
            selectedPlaces: likedPlaces
          })
        })
        .then(res => res.json())
        .then(result => {
          console.log('[ExplorePlaceList] Itinerary generated:', result);
          // The document will be automatically updated in the database
          // The artifact view should refresh to show the new content
        })
        .catch(error => {
          console.error('[ExplorePlaceList] Error generating itinerary:', error);
        });
      }
      
      // Call the original callback
      setTimeout(() => {
        onComplete?.(newReactions);
      }, 500);
    }
  };

  const likedCount = Array.from(reactions.values()).filter(r => r === 'like').length;
  const skippedCount = Array.from(reactions.values()).filter(r => r === 'dislike').length;

  return (
    <div className="relative h-[600px]">
      {/* Header */}
      <div className="relative z-20 bg-background border-b px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold truncate">
              Discover the best of {city}
            </h3>
            <p className="text-xs text-muted-foreground">
              {likedCount} selected, {skippedCount} skipped • {places.length - reactions.size} remaining
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
                    kind: 'itinerary',
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

      <div className="flex h-[calc(100%-60px)]">
        {/* Place List */}
        <div className="w-[400px] overflow-y-auto border-r bg-background">
          <div className="p-3 space-y-2">
            {places.map((place) => (
              <PlaceCard
                key={place.placeName}
                place={place}
                onLike={() => handleReaction(place.placeName, 'like')}
                onDislike={() => handleReaction(place.placeName, 'dislike')}
                isLiked={reactions.get(place.placeName) === 'like'}
                isDisliked={reactions.get(place.placeName) === 'dislike'}
                isFocused={focusedPlace?.placeName === place.placeName}
                onMouseEnter={() => {
                  setHoveredPlace(place.placeName);
                  setFocusedPlace(place);
                }}
                onMouseLeave={() => {
                  setHoveredPlace(null);
                  if (focusedPlace?.placeName === place.placeName) {
                    setFocusedPlace(null);
                  }
                }}
                onClick={() => setFocusedPlace(place)}
              />
            ))}
          </div>

          {/* Completion Message */}
          {reactions.size === places.length && places.length > 0 && (
            <div className="p-3 border-t">
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-blue-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">All places reviewed!</p>
                    <p className="text-xs text-muted-foreground">
                      {likedCount} places selected for your itinerary
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Map */}
        {showMap && (
          <div className="flex-1">
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
                places={places}
                reactions={reactions}
                hoveredPlace={hoveredPlace}
                focusedPlace={focusedPlace}
                latestPlaceIndex={-1}
                onPlaceHover={setHoveredPlace}
                onPlaceClick={(placeName) => {
                  const place = places.find(p => p.placeName === placeName);
                  if (place) {
                    setFocusedPlace(place);
                  }
                }}
              />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}