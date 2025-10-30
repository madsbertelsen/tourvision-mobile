'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { 
  ChevronLeft, 
  ChevronRight, 
  Heart,
  Check,
  MapPin,
  Star,
  Clock,
  X,
  Plus,
  Calendar,
  Map as MapIcon,
  Grid as GridIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Place {
  placeName: string;
  description: string;
  coordinates?: [number, number];
  imageUrl?: string;
  category: 'attraction' | 'restaurant' | 'activity' | 'accommodation' | 'shopping' | 'nature';
  rating?: number;
  priceLevel?: string;
  estimatedDuration?: string;
  address?: string;
  whyVisit?: string;
  tags?: string[];
  status?: 'available' | 'used';
}

interface Day {
  dayNumber: number;
  date?: string;
  places: Place[];
  transportation?: Array<{
    from: string;
    to: string;
    mode: string;
    duration?: string;
  }>;
}

interface WorkspaceViewProps {
  city: string;
  placesPool: Place[];
  itineraryPlan: { days: Day[] };
  onPlaceMove?: (place: Place, from: 'pool' | number, to: 'pool' | number) => void;
  onDayAdd?: () => void;
  onPlaceRemove?: (place: Place, dayIndex: number) => void;
  onSaveContent?: (content: string) => void;
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
  isInPool = true,
  onAction,
  actionIcon
}: { 
  place: Place;
  isInPool?: boolean;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className={cn(
      "relative group rounded-lg border bg-card p-3 transition-all",
      isInPool ? "hover:shadow-md cursor-move" : "bg-muted/50"
    )}>
      <div className="flex gap-3">
        {/* Image or Icon */}
        <div className="relative w-20 h-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {place.imageUrl ? (
            <img
              src={place.imageUrl}
              alt={place.placeName}
              className={cn(
                "w-full h-full object-cover transition-all",
                imageLoaded ? "scale-100" : "scale-110 blur-sm"
              )}
              onLoad={() => setImageLoaded(true)}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl opacity-50">
              {categoryEmojis[place.category]}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm line-clamp-1">{place.placeName}</h4>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <span>{categoryEmojis[place.category]}</span>
            <span className="capitalize">{place.category}</span>
            {place.estimatedDuration && (
              <>
                <span>•</span>
                <Clock className="h-3 w-3" />
                <span>{place.estimatedDuration}</span>
              </>
            )}
          </p>
          {place.rating && (
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              <span className="text-xs">{place.rating}</span>
            </div>
          )}
        </div>

        {/* Action Button */}
        {onAction && (
          <button
            onClick={onAction}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded"
          >
            {actionIcon || <Plus className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function DayColumn({ 
  day,
  dayIndex,
  onPlaceRemove
}: { 
  day: Day;
  dayIndex: number;
  onPlaceRemove?: (place: Place, dayIndex: number) => void;
}) {
  return (
    <div className="flex-1 min-w-[280px] max-w-[350px]">
      <div className="bg-muted/50 rounded-lg p-4 h-full">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Day {day.dayNumber}
          </h3>
          {day.date && (
            <span className="text-xs text-muted-foreground">{day.date}</span>
          )}
        </div>

        <div className="space-y-2">
          {day.places.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Drag places here to plan your day
            </div>
          ) : (
            day.places.map((place, index) => (
              <div key={index}>
                <PlaceCard 
                  place={place}
                  isInPool={false}
                  onAction={() => onPlaceRemove?.(place, dayIndex)}
                  actionIcon={<X className="h-4 w-4" />}
                />
                {index < day.places.length - 1 && day.transportation?.[index] && (
                  <div className="ml-10 my-1 text-xs text-muted-foreground flex items-center gap-1">
                    <span>↓</span>
                    <span>{day.transportation[index].mode}</span>
                    {day.transportation[index].duration && (
                      <span>({day.transportation[index].duration})</span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkspaceView({
  city,
  placesPool,
  itineraryPlan,
  onPlaceMove,
  onDayAdd,
  onPlaceRemove,
  onSaveContent
}: WorkspaceViewProps) {
  const [poolView, setPoolView] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filter places in pool
  const availablePlaces = useMemo(() => {
    return placesPool.filter(p => p.status !== 'used');
  }, [placesPool]);

  const filteredPlaces = useMemo(() => {
    if (!selectedCategory) return availablePlaces;
    return availablePlaces.filter(p => p.category === selectedCategory);
  }, [availablePlaces, selectedCategory]);

  // Get unique categories
  const categories = useMemo(() => {
    return Array.from(new Set(placesPool.map(p => p.category)));
  }, [placesPool]);

  const handleAddToDay = useCallback((place: Place, dayIndex: number) => {
    onPlaceMove?.(place, 'pool', dayIndex);
  }, [onPlaceMove]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <h2 className="text-xl font-semibold">{city} Itinerary Workspace</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Drag places from the pool to build your daily itinerary
        </p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Places Pool - Left Side */}
        <div className="w-1/3 min-w-[300px] border-r flex flex-col">
          <div className="p-3 border-b flex items-center justify-between">
            <h3 className="font-medium">Places Pool ({availablePlaces.length})</h3>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={poolView === 'grid' ? 'default' : 'ghost'}
                onClick={() => setPoolView('grid')}
                className="h-7 w-7 p-0"
              >
                <GridIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={poolView === 'list' ? 'default' : 'ghost'}
                onClick={() => setPoolView('list')}
                className="h-7 w-7 p-0"
              >
                <MapIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Category Filters */}
          <div className="p-3 border-b">
            <div className="flex flex-wrap gap-1">
              <Badge
                variant={selectedCategory === null ? "default" : "secondary"}
                className="cursor-pointer text-xs"
                onClick={() => setSelectedCategory(null)}
              >
                All
              </Badge>
              {categories.map(cat => (
                <Badge
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "secondary"}
                  className="cursor-pointer text-xs"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {categoryEmojis[cat as keyof typeof categoryEmojis]} {cat}
                </Badge>
              ))}
            </div>
          </div>

          {/* Places List */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="space-y-2">
              {filteredPlaces.map((place, index) => (
                <PlaceCard
                  key={index}
                  place={place}
                  onAction={() => {
                    // Add to first available day
                    const firstDay = itineraryPlan.days[0];
                    if (firstDay) {
                      handleAddToDay(place, 0);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Itinerary Plan - Right Side */}
        <div className="flex-1 overflow-x-auto">
          <div className="p-4">
            <div className="flex gap-4 min-w-max">
              {itineraryPlan.days.map((day, index) => (
                <DayColumn
                  key={index}
                  day={day}
                  dayIndex={index}
                  onPlaceRemove={onPlaceRemove}
                />
              ))}
              
              {/* Add Day Button */}
              <div className="flex-shrink-0">
                <Button
                  variant="outline"
                  className="h-full min-h-[200px] w-[120px]"
                  onClick={onDayAdd}
                >
                  <div className="text-center">
                    <Plus className="h-8 w-8 mx-auto mb-2" />
                    <span>Add Day</span>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}