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
  // Call Nominatim directly (runs in Docker on localhost:8080)
  private readonly nominatimUrl = 'http://localhost:8080';
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

  /**
   * Structured geocoding using Nominatim's structured query API
   * More accurate than free-form search when you have separate components
   * Calls Nominatim directly at localhost:8080
   *
   * @param params - Structured query parameters (city, country, state, etc.)
   * @returns Geocoded location or null if not found
   */
  async geocodeStructured(params: {
    city?: string;
    country?: string;
    state?: string;
    county?: string;
    postalcode?: string;
  }): Promise<GeocodedLocation | null> {
    await this.rateLimit();

    // Build structured query URL - call Nominatim directly
    const queryParams = new URLSearchParams();

    if (params.city) queryParams.set('city', params.city);
    if (params.country) queryParams.set('country', params.country);
    if (params.state) queryParams.set('state', params.state);
    if (params.county) queryParams.set('county', params.county);
    if (params.postalcode) queryParams.set('postalcode', params.postalcode);

    queryParams.set('format', 'json');
    queryParams.set('limit', '1');

    const url = `${this.nominatimUrl}/search?${queryParams.toString()}`;

    console.log('[GeocodingService] Structured geocode (direct):', params, '→', url);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.status}`);
      }

      const data: GeocodingResult[] = await response.json();

      if (data.length === 0) {
        console.warn('[GeocodingService] No results found for structured query:', params);
        return null;
      }

      const result = data[0];
      return {
        placeName: result.display_name,
        lat: result.lat,
        lng: result.lon
      };
    } catch (error) {
      console.error('[GeocodingService] Structured geocoding error:', error);
      return null;
    }
  }

  /**
   * Search for locations matching a prefix (for autocomplete/spelling)
   * Calls Nominatim directly at localhost:8080
   *
   * @param prefix - The prefix to search for (e.g., "Rosk")
   * @param nearbyLocation - Optional nearby location to bias results
   * @param countryCodes - Optional array of ISO country codes to filter results (e.g., ["dk", "se"])
   * @returns Top 5 matches sorted by relevance
   */
  async searchByPrefix(
    prefix: string,
    nearbyLocation?: { lat: number; lng: number },
    countryCodes?: string[]
  ): Promise<Array<{ name: string; lat: number; lng: number; relevance: number }>> {
    if (prefix.length < 2) {
      return [];  // Need at least 2 characters
    }

    await this.rateLimit();

    let url = `${this.nominatimUrl}/search?q=${encodeURIComponent(prefix)}&format=json&limit=5`;

    // If we have a nearby location, bias results toward it
    if (nearbyLocation) {
      url += `&lat=${nearbyLocation.lat}&lon=${nearbyLocation.lng}&viewbox=`;
    }

    // Add country codes filter (e.g., countrycodes=dk,se for Denmark and Sweden)
    if (countryCodes && countryCodes.length > 0) {
      url += `&countrycodes=${countryCodes.join(',')}`;
      console.log('[GeocodingService] Filtering by country codes:', countryCodes);
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Geocoding search API error: ${response.status}`);
      }

      const results = await response.json();

      if (!Array.isArray(results)) {
        console.warn('[GeocodingService] Unexpected search response format');
        return [];
      }

      // Map results and calculate relevance
      return results.slice(0, 5).map((r: any, index: number) => ({
        name: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        relevance: 1 - (index / results.length)  // First result = highest relevance
      }));
    } catch (error) {
      console.error('[GeocodingService] Prefix search error:', error);
      return [];
    }
  }
}

// Export a singleton instance for convenience
export const geocodingService = new GeocodingService();
