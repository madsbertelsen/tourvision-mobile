'use client';

import { useState, useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThumbsUp, ThumbsDown, MapPin, Clock, DollarSign, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

// Initialize Mapbox
if (typeof window !== 'undefined' && !mapboxgl.accessToken) {
  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
}

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

interface ExplorePlaceProps {
  city: string;
  places: Place[];
  onComplete?: (reactions: Map<string, 'like' | 'dislike'>) => void;
}

const categoryColors = {
  attraction: '#3B82F6',
  restaurant: '#10B981',
  activity: '#8B5CF6',
  accommodation: '#EC4899',
  shopping: '#F59E0B',
  nature: '#84CC16',
};

export function ExplorePlace({
  city,
  places,
  onComplete,
}: ExplorePlaceProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reactions, setReactions] = useState<Map<string, 'like' | 'dislike'>>(new Map());
  
  const currentPlace = places[currentIndex];
  const isLastPlace = currentIndex === places.length - 1;

  // Initialize map only once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: currentPlace.coordinates,
      zoom: 15,
      interactive: true,
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update marker and map when place changes
  useEffect(() => {
    if (!map.current || !currentPlace) return;

    // Remove existing marker
    if (marker.current) {
      marker.current.remove();
    }

    // Add marker with custom color
    const el = document.createElement('div');
    el.className = 'custom-marker';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = categoryColors[currentPlace.category];
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>';

    marker.current = new mapboxgl.Marker(el)
      .setLngLat(currentPlace.coordinates)
      .addTo(map.current);

    // Add popup
    const popup = new mapboxgl.Popup({ offset: 25 })
      .setHTML(`
        <div class="p-2">
          <h3 class="font-semibold">${currentPlace.placeName}</h3>
          ${currentPlace.address ? `<p class="text-sm text-gray-600">${currentPlace.address}</p>` : ''}
        </div>
      `);
    
    marker.current.setPopup(popup);

    // Fly to location with animation
    map.current.flyTo({
      center: currentPlace.coordinates,
      zoom: 16,
      duration: 1500,
      essential: true,
    });
  }, [currentIndex, currentPlace]);

  const handleReaction = (reaction: 'like' | 'dislike') => {
    // Store reaction for current place
    const newReactions = new Map(reactions);
    newReactions.set(currentPlace.placeName, reaction);
    setReactions(newReactions);

    // Move to next place or complete
    if (isLastPlace) {
      onComplete?.(newReactions);
    } else {
      // Advance to next place after a short delay
      setTimeout(() => {
        setCurrentIndex(currentIndex + 1);
      }, 500);
    }
  };

  if (!currentPlace) {
    return <div>No places to explore</div>;
  }

  return (
    <div className="w-full space-y-4">
      {/* Header with city name */}
      <div className="text-center">
        <h3 className="text-lg font-semibold">Exploring {city}</h3>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Place {currentIndex + 1} of {places.length}</span>
        <div className="flex gap-1">
          {Array.from({ length: places.length }, (_, i) => (
            <div
              key={i}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                i < currentIndex
                  ? 'bg-green-500'
                  : i === currentIndex
                  ? 'bg-primary animate-pulse'
                  : 'bg-muted'
              )}
            />
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="relative w-full h-[400px] rounded-lg overflow-hidden border">
        <div ref={mapContainer} className="w-full h-full" />
      </div>

      {/* Place details card */}
      <Card className="p-6 space-y-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold">{currentPlace.placeName}</h2>
              <p className="text-muted-foreground">{currentPlace.description}</p>
            </div>
            <span
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium text-white',
                `bg-[${categoryColors[currentPlace.category]}]`
              )}
              style={{ backgroundColor: categoryColors[currentPlace.category] }}
            >
              {currentPlace.category}
            </span>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap gap-4 text-sm">
            {currentPlace.rating && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span>{currentPlace.rating}/5</span>
              </div>
            )}
            {currentPlace.priceLevel && (
              <div className="flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span>{currentPlace.priceLevel}</span>
              </div>
            )}
            {currentPlace.estimatedDuration && (
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>{currentPlace.estimatedDuration}</span>
              </div>
            )}
            {currentPlace.address && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{currentPlace.address}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          {currentPlace.tags && currentPlace.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentPlace.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Why visit */}
        <div className="p-4 bg-primary/5 rounded-lg border border-primary/10">
          <p className="text-sm font-medium text-primary mb-1">Why visit?</p>
          <p className="text-sm">{currentPlace.whyVisit}</p>
        </div>

        {/* Image if available */}
        {currentPlace.imageUrl && (
          <div className="w-full h-48 rounded-lg overflow-hidden">
            <img
              src={currentPlace.imageUrl}
              alt={currentPlace.placeName}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Reaction buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => handleReaction('like')}
            variant="outline"
            className="flex-1"
            disabled={reactions.has(currentPlace.placeName)}
          >
            <ThumbsUp className="w-4 h-4 mr-2" />
            Interested
          </Button>
          <Button
            onClick={() => handleReaction('dislike')}
            variant="outline"
            className="flex-1"
            disabled={reactions.has(currentPlace.placeName)}
          >
            <ThumbsDown className="w-4 h-4 mr-2" />
            Skip
          </Button>
        </div>

        {reactions.has(currentPlace.placeName) && (
          <p className="text-sm text-center text-muted-foreground">
            {reactions.get(currentPlace.placeName) === 'like' 
              ? '✓ Added to your itinerary preferences' 
              : '✓ Skipped this suggestion'}
          </p>
        )}

        {isLastPlace && reactions.size === places.length && (
          <p className="text-sm text-center text-primary font-medium">
            All places reviewed! Generating your personalized itinerary...
          </p>
        )}
      </Card>
    </div>
  );
}