import { getMarkerColor } from './marker-colors';

/**
 * Centralized location color assignment system
 * This ensures consistent colors between map markers and text decorations
 */

export interface LocationColorMap {
  [locationName: string]: number; // Maps location name to color index
}

/**
 * Extract unique location names from enriched content
 * This matches how ProseMirror and the map parse locations
 */
export function extractLocationNamesFromContent(content: string): string[] {
  const locationNames: string[] = [];
  const seen = new Set<string>();
  
  // Try to parse as HTML first (for saved content)
  if (content.includes('<a') && content.includes('google.com/maps')) {
    try {
      // Create a temporary DOM element to parse HTML
      if (typeof window !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        const links = doc.querySelectorAll('a[href*="google.com/maps"]');
        
        links.forEach(link => {
          const locationName = link.textContent?.trim();
          if (locationName && !seen.has(locationName)) {
            locationNames.push(locationName);
            seen.add(locationName);
          }
        });
        
        if (locationNames.length > 0) {
          return locationNames;
        }
      }
    } catch (e) {
      console.warn('Failed to parse as HTML, falling back to regex', e);
    }
  }
  
  // Fallback: Regular expression to match Google Maps links in markdown
  const linkPattern = /\[([^\]]+)\]\(https?:\/\/[^)]*google\.com\/maps[^)]*\)/g;
  
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const locationName = match[1].trim();
    // Remove any numbering prefix but keep the actual name
    const cleanName = locationName.replace(/^\d+\s*/, '').trim();
    
    if (cleanName && !seen.has(cleanName)) {
      locationNames.push(cleanName);
      seen.add(cleanName);
    }
  }
  
  return locationNames;
}

/**
 * Create a stable color assignment map for locations
 * This ensures each location gets a consistent color index
 */
export function createLocationColorMap(content: string): LocationColorMap {
  const locationNames = extractLocationNamesFromContent(content);
  const colorMap: LocationColorMap = {};
  
  locationNames.forEach((name, index) => {
    colorMap[name] = index;
  });
  
  return colorMap;
}

/**
 * Get the color for a specific location name
 */
export function getLocationColor(locationName: string, colorMap: LocationColorMap): string {
  // Remove any numbering prefix to match the clean name
  const cleanName = locationName.replace(/^\d+\s*/, '').trim();
  const index = colorMap[cleanName];
  
  if (index === undefined) {
    // Fallback to first color if location not found
    return getMarkerColor(0);
  }
  
  return getMarkerColor(index);
}

/**
 * Get the color index for a specific location name
 */
export function getLocationColorIndex(locationName: string, colorMap: LocationColorMap): number {
  // Remove any numbering prefix to match the clean name
  const cleanName = locationName.replace(/^\d+\s*/, '').trim();
  const index = colorMap[cleanName];
  
  return index !== undefined ? index : 0;
}

/**
 * Get the next available color index for a new destination
 * This counts existing destinations and returns the next index
 */
export function getNextColorIndex(existingCount: number): number {
  return existingCount;
}

/**
 * Update color map with a new destination
 */
export function addDestinationToColorMap(
  colorMap: LocationColorMap,
  destinationName: string,
  colorIndex: number
): LocationColorMap {
  return {
    ...colorMap,
    [destinationName]: colorIndex,
  };
}