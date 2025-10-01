import { useState, useEffect, useCallback } from 'react';
import { isBookmarked, toggleBookmark, type BookmarkedLocation } from '@/utils/bookmarks-storage';

export function useBookmark(location: Omit<BookmarkedLocation, 'bookmarkedAt'>) {
  const [bookmarked, setBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  // Load initial bookmark status
  useEffect(() => {
    async function loadStatus() {
      try {
        setIsLoading(true);
        const status = await isBookmarked(location.id);
        setBookmarked(status);
      } catch (error) {
        console.error('Error loading bookmark status:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadStatus();
  }, [location.id]);

  // Toggle bookmark
  const toggle = useCallback(async () => {
    if (isToggling) return;

    setIsToggling(true);
    try {
      const newStatus = await toggleBookmark(location);
      setBookmarked(newStatus);
      return newStatus;
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      throw error;
    } finally {
      setIsToggling(false);
    }
  }, [location, isToggling]);

  return {
    bookmarked,
    isLoading,
    isToggling,
    toggle,
  };
}
