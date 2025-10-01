import AsyncStorage from '@react-native-async-storage/async-storage';

const BOOKMARKS_KEY = '@tourvision_bookmarks';

export interface BookmarkedLocation {
  id: string;
  name: string;
  lat: string;
  lng: string;
  description?: string;
  photoName?: string;
  bookmarkedAt: number;
}

/**
 * Get all bookmarked locations
 */
export async function getBookmarks(): Promise<BookmarkedLocation[]> {
  try {
    const bookmarksJson = await AsyncStorage.getItem(BOOKMARKS_KEY);
    if (!bookmarksJson) return [];
    return JSON.parse(bookmarksJson);
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    return [];
  }
}

/**
 * Check if a location is bookmarked
 */
export async function isBookmarked(locationId: string): Promise<boolean> {
  try {
    const bookmarks = await getBookmarks();
    return bookmarks.some(bookmark => bookmark.id === locationId);
  } catch (error) {
    console.error('Error checking bookmark:', error);
    return false;
  }
}

/**
 * Add a location to bookmarks
 */
export async function addBookmark(location: Omit<BookmarkedLocation, 'bookmarkedAt'>): Promise<void> {
  try {
    const bookmarks = await getBookmarks();

    // Check if already bookmarked
    if (bookmarks.some(b => b.id === location.id)) {
      return;
    }

    const newBookmark: BookmarkedLocation = {
      ...location,
      bookmarkedAt: Date.now(),
    };

    const updatedBookmarks = [...bookmarks, newBookmark];
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updatedBookmarks));
  } catch (error) {
    console.error('Error adding bookmark:', error);
    throw error;
  }
}

/**
 * Remove a location from bookmarks
 */
export async function removeBookmark(locationId: string): Promise<void> {
  try {
    const bookmarks = await getBookmarks();
    const updatedBookmarks = bookmarks.filter(b => b.id !== locationId);
    await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updatedBookmarks));
  } catch (error) {
    console.error('Error removing bookmark:', error);
    throw error;
  }
}

/**
 * Toggle bookmark status for a location
 */
export async function toggleBookmark(location: Omit<BookmarkedLocation, 'bookmarkedAt'>): Promise<boolean> {
  try {
    const bookmarked = await isBookmarked(location.id);

    if (bookmarked) {
      await removeBookmark(location.id);
      return false;
    } else {
      await addBookmark(location);
      return true;
    }
  } catch (error) {
    console.error('Error toggling bookmark:', error);
    throw error;
  }
}

/**
 * Clear all bookmarks
 */
export async function clearBookmarks(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BOOKMARKS_KEY);
  } catch (error) {
    console.error('Error clearing bookmarks:', error);
    throw error;
  }
}
