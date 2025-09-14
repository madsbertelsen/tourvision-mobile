/**
 * Utility functions for Google Places Photos API
 */

/**
 * Generate a Google Places Photo URL from a photo reference
 * @param photoReference - The photo reference from Google Places API
 * @param maxWidth - Maximum width of the image (1-1600px)
 * @returns The complete URL to fetch the photo
 */
export function generateGooglePhotoUrl(
  photoReference: string | undefined,
  maxWidth: number = 800
): string | undefined {
  if (!photoReference) return undefined;
  
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[GooglePhotos] No API key found, cannot generate photo URL');
    return undefined;
  }
  
  // Google Places Photo API endpoint
  const baseUrl = 'https://maps.googleapis.com/maps/api/place/photo';
  const params = new URLSearchParams({
    maxwidth: maxWidth.toString(),
    photo_reference: photoReference,
    key: apiKey,
  });
  
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Generate multiple photo URLs from an array of photo objects
 * @param photos - Array of photo objects from Google Places API
 * @param maxWidth - Maximum width for all photos
 * @returns Array of photo URLs
 */
export function generateMultiplePhotoUrls(
  photos: Array<{ photo_reference?: string; width?: number; height?: number }> | undefined,
  maxWidth: number = 800
): string[] {
  if (!photos || photos.length === 0) return [];
  
  return photos
    .map(photo => generateGooglePhotoUrl(photo.photo_reference, maxWidth))
    .filter((url): url is string => url !== undefined);
}

/**
 * Get the best photo URL from a place (typically the first one)
 * @param photos - Array of photo objects from Google Places API
 * @param preferredWidth - Preferred width for the photo
 * @returns The best photo URL or undefined
 */
export function getBestPhotoUrl(
  photos: Array<{ photo_reference?: string; width?: number; height?: number }> | undefined,
  preferredWidth: number = 800
): string | undefined {
  if (!photos || photos.length === 0) return undefined;
  
  // Use the first photo as it's typically the most relevant
  return generateGooglePhotoUrl(photos[0].photo_reference, preferredWidth);
}