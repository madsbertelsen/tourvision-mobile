import { Platform } from 'react-native';

/**
 * Generate the correct API URL based on the platform
 * Web can use relative URLs, but native needs absolute URLs
 */
export function generateAPIUrl(path: string): string {
  // Use Next.js API if configured, otherwise fall back to Supabase
  const baseUrl = process.env.EXPO_PUBLIC_NEXTJS_API_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (!baseUrl) {
    throw new Error('No API URL configured. Please set EXPO_PUBLIC_NEXTJS_API_URL or EXPO_PUBLIC_SUPABASE_URL');
  }

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // For web platform, we can use relative URLs if on same domain
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Check if we're on localhost and the API is also on localhost
    if (window.location.hostname === 'localhost' && baseUrl.includes('localhost')) {
      return `${baseUrl}${normalizedPath}`;
    }
  }

  // For native platforms or cross-domain, always use absolute URL
  return `${baseUrl}${normalizedPath}`;
}