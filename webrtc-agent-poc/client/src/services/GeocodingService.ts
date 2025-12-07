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
  private readonly proxyUrl = `${window.location.protocol}//${window.location.hostname}:8787/api`;
  private lastRequestTime = 0;
  private readonly minRequestInterval = 100; // Relaxed rate limit for local Nominatim instance

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

    const url = `${this.proxyUrl}/geocode?q=${encodeURIComponent(placeName)}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.status}`);
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

    const url = `${this.proxyUrl}/reverse-geocode?lat=${lat}&lon=${lng}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Reverse geocoding API error: ${response.status}`);
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
