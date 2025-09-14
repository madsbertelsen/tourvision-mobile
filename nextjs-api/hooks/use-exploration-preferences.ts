import { useState, useCallback } from 'react';
import type { Destination, ExplorationPreferences } from '@/artifacts/exploration/types';

export function useExplorationPreferences() {
  const [preferences, setPreferences] = useState<ExplorationPreferences>({
    liked: new Set(),
    disliked: new Set(),
    categories: new Set(['attraction', 'restaurant', 'activity']), // Default categories
  });

  const toggleLike = useCallback((destinationId: string) => {
    setPreferences(prev => {
      const newLiked = new Set(prev.liked);
      const newDisliked = new Set(prev.disliked);
      
      // Remove from disliked if present
      newDisliked.delete(destinationId);
      
      // Toggle in liked
      if (newLiked.has(destinationId)) {
        newLiked.delete(destinationId);
      } else {
        newLiked.add(destinationId);
      }
      
      return {
        ...prev,
        liked: newLiked,
        disliked: newDisliked,
      };
    });
  }, []);

  const toggleDislike = useCallback((destinationId: string) => {
    setPreferences(prev => {
      const newLiked = new Set(prev.liked);
      const newDisliked = new Set(prev.disliked);
      
      // Remove from liked if present
      newLiked.delete(destinationId);
      
      // Toggle in disliked
      if (newDisliked.has(destinationId)) {
        newDisliked.delete(destinationId);
      } else {
        newDisliked.add(destinationId);
      }
      
      return {
        ...prev,
        liked: newLiked,
        disliked: newDisliked,
      };
    });
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setPreferences(prev => {
      const newCategories = new Set(prev.categories);
      
      if (newCategories.has(category)) {
        newCategories.delete(category);
      } else {
        newCategories.add(category);
      }
      
      return {
        ...prev,
        categories: newCategories,
      };
    });
  }, []);

  const clearPreferences = useCallback(() => {
    setPreferences({
      liked: new Set(),
      disliked: new Set(),
      categories: new Set(['attraction', 'restaurant', 'activity']),
    });
  }, []);

  const getLikedDestinations = useCallback((destinations: Destination[]) => {
    return destinations.filter(d => preferences.liked.has(d.id));
  }, [preferences.liked]);

  const getFilteredDestinations = useCallback((destinations: Destination[]) => {
    return destinations.filter(d => {
      // Hide disliked destinations
      if (preferences.disliked.has(d.id)) return false;
      // Filter by category if not showing all
      if (preferences.categories.size > 0 && !preferences.categories.has(d.category)) {
        return false;
      }
      return true;
    });
  }, [preferences]);

  return {
    preferences,
    toggleLike,
    toggleDislike,
    toggleCategory,
    clearPreferences,
    getLikedDestinations,
    getFilteredDestinations,
  };
}