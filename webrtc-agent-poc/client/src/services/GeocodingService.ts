/**
 * GeocodingService - Handles location geocoding via Nominatim API
 *
 * Extracted from main.ts:1858-1886
 */

import type { GeocodingResult } from '../types';

export interface GeocodedLocation {
  placeName: string;
  lat: string;
  lng: string;
}

export class GeocodingService {
  private readonly baseUrl = 'https://nominatim.openstreetmap.org';
  private readonly userAgent = 'TourVision/1.0 (https://tourvision.com; contact@tourvision.com)';
  private lastRequestTime = 0;
  private readonly minRequestInterval = 1000; // 1 second rate limit per Nominatim policy

  /**
   * Rate limit requests to respect Nominatim's 1 request per second policy
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Geocode a place name to geographic coordinates
   *
   * @param placeName - The name of the place to geocode
   * @returns Geocoded location or null if not found
   */
  async geocode(placeName: string): Promise<GeocodedLocation | null> {
    await this.rateLimit();

    const url = `${this.baseUrl}/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Referer': window.location.origin
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const data: GeocodingResult[] = await response.json();

      if (data.length === 0) {
        console.warn('[GeocodingService] No results found for:', placeName);
        return null;
      }

      const result = data[0];
      return {
        placeName: result.display_name,
        lat: result.lat,
        lng: result.lon
      };
    } catch (error) {
      console.error('[GeocodingService] Geocoding error:', error);
      return null;
    }
  }

  /**
   * Reverse geocode coordinates to a place name
   *
   * @param lat - Latitude
   * @param lng - Longitude
   * @returns Place name or null if not found
   */
  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    await this.rateLimit();

    const url = `${this.baseUrl}/reverse?lat=${lat}&lon=${lng}&format=json`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Referer': window.location.origin
        }
      });

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`);
      }

      const data = await response.json();
      return data.display_name || null;
    } catch (error) {
      console.error('[GeocodingService] Reverse geocoding error:', error);
      return null;
    }
  }
}

// Export a singleton instance for convenience
export const geocodingService = new GeocodingService();
