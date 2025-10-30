import { geocodeLocation } from './geocoding-service';
import { getMarkerColor, getLighterShade } from './marker-colors';

interface LocationTag {
  fullMatch: string;
  context: string;
  name: string;
}

/**
 * Process streaming text to detect and enrich location tags in real-time
 */
export class LocationStreamProcessor {
  private buffer = '';
  private geocodeCache = new Map<string, { coordinates: [number, number]; placeId?: string }>();
  private pendingGeocodes = new Map<string, Promise<any>>();
  private locationColorMap = new Map<string, number>(); // Track color index for each location
  private nextColorIndex = 0;
  
  /**
   * Process a chunk of text and return enriched content
   * Returns an object with the processed text and whether to continue buffering
   */
  async processChunk(chunk: string): Promise<{ text: string; continue: boolean }> {
    // Add chunk to buffer
    this.buffer += chunk;
    
    // Debug logging to see what we're receiving
    if (chunk.includes('Tivoli') || chunk.includes('Nyhavn') || chunk.includes('location')) {
      console.log('[LocationStreamProcessor] Chunk contains location reference:', chunk);
    }
    
    // Look for complete location tags - make regex global to find all matches
    const completeTagRegex = /<location\s+data-context="([^"]+)">([^<]+)<\/location>/g;
    const partialTagRegex = /<location(?:\s+data-context="[^"]*"?)?(?:[^>]*)$/;
    
    let processedText = '';
    let lastIndex = 0;
    let match;
    
    // Find all complete location tags
    const matches = [];
    while ((match = completeTagRegex.exec(this.buffer)) !== null) {
      matches.push({
        index: match.index,
        fullMatch: match[0],
        context: match[1],
        name: match[2]
      });
    }
    
    // Process each match
    for (const m of matches) {
      // Add text before the match
      processedText += this.buffer.substring(lastIndex, m.index);
      
      // Enrich the location
      const enrichedLocation = await this.enrichLocation({ 
        fullMatch: m.fullMatch, 
        context: m.context, 
        name: m.name 
      });
      processedText += enrichedLocation;
      
      lastIndex = m.index + m.fullMatch.length;
    }
    
    // Get remaining text after last match
    const remaining = this.buffer.substring(lastIndex);
    
    // Check if there's a partial tag at the end
    if (partialTagRegex.test(remaining)) {
      // Keep the partial tag in buffer for next chunk
      this.buffer = remaining;
      console.log('[LocationStreamProcessor] Buffering partial tag:', remaining.substring(0, 50));
      return { text: processedText, continue: true };
    } else {
      // No partial tag, output everything and clear buffer
      processedText += remaining;
      this.buffer = '';
      return { text: processedText, continue: false };
    }
  }
  
  /**
   * Enrich a single location tag with geocoding data
   */
  private async enrichLocation(location: LocationTag): Promise<string> {
    const cacheKey = `${location.name}:${location.context}`;
    console.log(`[LocationStreamProcessor] Enriching location: "${location.name}" with context: "${location.context}"`);
    
    // Assign color index if this is a new location
    if (!this.locationColorMap.has(location.name)) {
      this.locationColorMap.set(location.name, this.nextColorIndex++);
    }
    const colorIndex = this.locationColorMap.get(location.name)!;
    
    try {
      // Check cache first
      if (this.geocodeCache.has(cacheKey)) {
        const cached = this.geocodeCache.get(cacheKey)!;
        console.log(`[LocationStreamProcessor] Using cached geocode for ${location.name}`);
        return this.createEnrichedLink(location.name, cached.coordinates, cached.placeId, colorIndex);
      }
      
      // Check if already geocoding this location
      if (this.pendingGeocodes.has(cacheKey)) {
        console.log(`[LocationStreamProcessor] Waiting for pending geocode of ${location.name}`);
        const result = await this.pendingGeocodes.get(cacheKey);
        return this.createEnrichedLink(location.name, result.coordinates, result.placeId, colorIndex);
      }
      
      // Start geocoding
      console.log(`[LocationStreamProcessor] Starting geocode for ${location.name}`);
      const geocodePromise = this.performGeocode(location.name, location.context);
      this.pendingGeocodes.set(cacheKey, geocodePromise);
      
      const result = await geocodePromise;
      
      // Cache the result
      this.geocodeCache.set(cacheKey, result);
      this.pendingGeocodes.delete(cacheKey);
      
      console.log(`[LocationStreamProcessor] Successfully geocoded ${location.name}:`, result.coordinates);
      return this.createEnrichedLink(location.name, result.coordinates, result.placeId, colorIndex);
    } catch (error) {
      console.error(`[LocationStreamProcessor] Failed to geocode ${location.name}:`, error);
      // Fallback to search URL
      return this.createFallbackLink(location.name, location.context, colorIndex);
    }
  }
  
  /**
   * Perform geocoding for a location
   */
  private async performGeocode(name: string, context: string): Promise<{ coordinates: [number, number]; placeId?: string }> {
    const geocoded = await geocodeLocation(name, context);
    
    if (geocoded?.coordinates) {
      return {
        coordinates: geocoded.coordinates,
        placeId: geocoded.placeId
      };
    }
    
    throw new Error('Geocoding failed');
  }
  
  /**
   * Create an enriched HTML link with geocoded data
   */
  private createEnrichedLink(name: string, coordinates: [number, number], placeId: string | undefined, colorIndex: number): string {
    const coordUrl = `https://www.google.com/maps/search/?api=1&query=${coordinates[1]},${coordinates[0]}`;
    const color = getMarkerColor(colorIndex);
    const bgColor = getLighterShade(color, 0.15);
    
    const locationData = {
      name,
      lat: coordinates[1],
      lng: coordinates[0],
      placeId,
      colorIndex
    };
    
    // Escape JSON for HTML attribute
    const jsonData = JSON.stringify(locationData).replace(/"/g, '&quot;');
    
    // Add inline styles for the colored background
    return `<a href="${coordUrl}" target="_blank" rel="noopener noreferrer" class="location-link" style="color: ${color}; background-color: ${bgColor}; padding: 2px 4px; border-radius: 4px; text-decoration: none; hover:text-decoration: underline;" data-location="${jsonData}" data-color-index="${colorIndex}">${name}</a>`;
  }
  
  /**
   * Create a fallback link when geocoding fails
   */
  private createFallbackLink(name: string, context: string, colorIndex: number): string {
    const searchQuery = `${name}, ${context}`;
    const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
    const color = getMarkerColor(colorIndex);
    const bgColor = getLighterShade(color, 0.15);
    
    const locationData = {
      name,
      context,
      fallback: true,
      colorIndex
    };
    
    const jsonData = JSON.stringify(locationData).replace(/"/g, '&quot;');
    
    return `<a href="${fallbackUrl}" target="_blank" rel="noopener noreferrer" class="location-link location-fallback" style="color: ${color}; background-color: ${bgColor}; padding: 2px 4px; border-radius: 4px; text-decoration: none;" data-location="${jsonData}" data-color-index="${colorIndex}">${name}</a>`;
  }
  
  /**
   * Flush any remaining buffer content
   */
  flush(): string {
    const remaining = this.buffer;
    this.buffer = '';
    // Return any remaining content as-is (might have incomplete tags)
    return remaining;
  }
}