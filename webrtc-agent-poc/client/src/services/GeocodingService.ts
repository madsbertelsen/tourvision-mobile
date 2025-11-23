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
  private readonly userAgent = 'WebRTC-Agent-POC/1.0';

  /**
   * Geocode a place name to geographic coordinates
   *
   * @param placeName - The name of the place to geocode
   * @returns Geocoded location or null if not found
   */
  async geocode(placeName: string): Promise<GeocodedLocation | null> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
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
    const url = `${this.baseUrl}/reverse?lat=${lat}&lon=${lng}&format=json`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent
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
