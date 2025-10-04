import { Platform } from 'react-native';

/**
 * Generate the correct API URL based on the platform
 * Web can use relative URLs, but native needs absolute URLs
 */
export function generateAPIUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // For web platform in production (deployed), use relative URLs (same domain)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Development: Use configured API URL (e.g., http://localhost:3001)
    if (window.location.hostname === 'localhost' && process.env.EXPO_PUBLIC_NEXTJS_API_URL) {
      return `${process.env.EXPO_PUBLIC_NEXTJS_API_URL}${normalizedPath}`;
    }

    // Production: Use relative URL (Expo app served from Next.js public folder)
    return normalizedPath;
  }

  // For native platforms, always use absolute URL
  const baseUrl = process.env.EXPO_PUBLIC_NEXTJS_API_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!baseUrl) {
    throw new Error('No API URL configured for native platform. Please set EXPO_PUBLIC_NEXTJS_API_URL');
  }

  return `${baseUrl}${normalizedPath}`;
}