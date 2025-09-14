import { geocodeLocation, extractContextFromItinerary, type GeocodedLocation } from './geocoding-service';

export interface EnrichedLocation {
  originalText: string;
  enrichedText: string;
  geocoded?: GeocodedLocation;
}

/**
 * Pattern to identify potential location names in text
 */
const LOCATION_PATTERNS = [
  // Strong patterns for specific locations (e.g., proper names with capitals)
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Castle|Palace|Museum|Park|Garden|Square|Market|District|Bridge|Church|Cathedral))?)\b/g,
  
  // Time-based patterns (e.g., "9:30 AM: Visit Gamla Stan")
  /\d{1,2}:\d{2}\s*(?:AM|PM)?:\s*(?:Visit|Explore|Head to|Walk to|Arrive at|Depart from|Lunch at|Dinner at|Breakfast at)\s+([^,.\n]+)/gi,
  
  // Action-based patterns (e.g., "Visit the Vasa Museum")
  /(?:Visit|Explore|Head to|Walk to|See|Tour|Check out)\s+(?:the\s+)?([A-Z][^,.\n]+?)(?:\.|,|\n|$)/gi,
  
  // Meal patterns (e.g., "Lunch at Restaurant Name")
  /(?:Breakfast|Lunch|Dinner|Dine)\s+at\s+([^,.\n]+)/gi,
  
  // Location phrases (e.g., "located at Central Station")
  /(?:located at|near|in)\s+([A-Z][^,.\n]+?)(?:\.|,|\n|$)/gi,
];

/**
 * Check if text already contains an HTML link
 */
function hasHtmlLink(text: string): boolean {
  return /<a[^>]*>.*?<\/a>/.test(text);
}

/**
 * Extract location names from itinerary text
 */
export function extractLocationNames(content: string): Set<string> {
  const locations = new Set<string>();
  
  // Strip HTML tags to get plain text for parsing
  const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  
  // Split by lines to process each line
  const lines = plainText.split('\n');
  
  for (const line of lines) {
    // Skip if line already has HTML links (check original content)
    if (hasHtmlLink(content) && line.includes('href=')) continue;
    
    // Try each pattern
    for (const pattern of LOCATION_PATTERNS) {
      const matches = [...line.matchAll(pattern)];
      for (const match of matches) {
        // Get the captured location name (usually the last capture group)
        const locationName = match[match.length - 1]?.trim();
        if (locationName && locationName.length > 2) {
          // Clean up the location name - remove descriptive phrases
          let cleaned = locationName
            .replace(/^(the|at|in|to)\s+/i, '')
            .replace(/[.,;!?*]+$/, '')  // Also remove asterisks
            .trim();
          
          // Remove common descriptive suffixes that confuse geocoding
          cleaned = cleaned
            .replace(/\s+(End|Start|Finish|Continue).*$/i, '') // Remove action words
            .replace(/\s+(your|the|a|an)\s+(day|morning|afternoon|evening|night|trip|tour|visit).*$/i, '') // Remove time phrases
            .replace(/\s+(to|for|and|with|including|featuring).*$/i, '')
            .replace(/\s+(to see|to visit|to explore|to learn|to enjoy|to walk).*$/i, '')
            .replace(/\s+(and surrounding areas|and castle|and museum).*$/i, '')
            .replace(/\*+$/, '')  // Remove trailing asterisks
            .trim();
          
          // Only add if it looks like a proper location name
          if (cleaned && /[A-Z]/.test(cleaned[0])) {
            locations.add(cleaned);
          }
        }
      }
    }
  }
  
  return locations;
}

/**
 * Enrich HTML content with location links
 */
export async function enrichItineraryWithLocations(
  content: string,
  progressCallback?: (progress: number) => void
): Promise<string> {
  try {
    // Extract context from the itinerary
    const context = extractContextFromItinerary(content);
    
    // Extract location names
    const locationNames = Array.from(extractLocationNames(content));
    
    if (locationNames.length === 0) {
      return content;
    }
    
    // Geocode all locations
    const geocodedMap = new Map<string, GeocodedLocation>();
    let processed = 0;
    
    for (const name of locationNames) {
      const geocoded = await geocodeLocation(name, context);
      if (geocoded) {
        geocodedMap.set(name, geocoded);
      }
      processed++;
      if (progressCallback) {
        progressCallback((processed / locationNames.length) * 100);
      }
    }
    
    // Replace location names with enriched HTML links
    let enrichedContent = content;
    
    for (const [name, geocoded] of geocodedMap.entries()) {
      // Create a regex that matches the location name but not if it's already in a link
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // For HTML, we need to avoid replacing text that's already in an <a> tag
      const regex = new RegExp(
        `(?<!<a[^>]*>)(?![^<]*</a>)\\b${escapedName}\\b(?![^<>]*>)`,
        'gi'
      );
      
      // Replace with HTML link
      const replacement = `<a href="${geocoded.url}" target="_blank" rel="noopener noreferrer">${name}</a>`;
      enrichedContent = enrichedContent.replace(regex, replacement);
    }
    
    return enrichedContent;
  } catch (error) {
    console.error('Error enriching itinerary:', error);
    return content; // Return original content on error
  }
}

/**
 * Parse existing location links from HTML or Markdown
 */
export function parseLocationLinks(content: string): Map<string, string> {
  const links = new Map<string, string>();
  
  // Try HTML links first
  const htmlLinkPattern = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = htmlLinkPattern.exec(content)) !== null) {
    const [, url, text] = match;  // Note: url comes before text in HTML regex
    // Check if it's a Google Maps link
    if (url.includes('google.com/maps') || url.includes('maps.google.com')) {
      links.set(text, url);
    }
  }
  
  // Also try markdown links as fallback
  const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  while ((match = markdownLinkPattern.exec(content)) !== null) {
    const [, text, url] = match;  // Note: text comes before url in markdown
    // Check if it's a Google Maps link and not already added
    if ((url.includes('google.com/maps') || url.includes('maps.google.com')) && !links.has(text)) {
      links.set(text, url);
    }
  }
  
  return links;
}

/**
 * Extract coordinates from a Google Maps URL
 */
export function extractCoordinatesFromUrl(url: string): [number, number] | null {
  // Try to extract from place_id URL
  const placeIdMatch = url.match(/place_id[:=]([A-Za-z0-9_-]+)/);
  if (placeIdMatch) {
    // We'd need to call the Places API to get coordinates from place_id
    // For now, return null and handle this case separately
    return null;
  }
  
  // Try to extract from @lat,lng pattern
  const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coordMatch) {
    return [Number.parseFloat(coordMatch[2]), Number.parseFloat(coordMatch[1])]; // [lng, lat]
  }
  
  // Try to extract from q=lat,lng pattern
  const queryMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (queryMatch) {
    return [Number.parseFloat(queryMatch[2]), Number.parseFloat(queryMatch[1])]; // [lng, lat]
  }
  
  // Try to extract from query=lat,lng pattern (Google Maps search API)
  const queryApiMatch = url.match(/[?&]query=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (queryApiMatch) {
    return [Number.parseFloat(queryApiMatch[2]), Number.parseFloat(queryApiMatch[1])]; // [lng, lat]
  }
  
  return null;
}