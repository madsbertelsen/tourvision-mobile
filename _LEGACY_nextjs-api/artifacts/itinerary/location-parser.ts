import { geocodeLocation, extractContextFromItinerary, type GeocodedLocation } from './geocoding-service';
import { parseLocationLinks, extractCoordinatesFromUrl } from './location-enrichment';

export interface Location {
  name: string;
  coordinates?: [number, number];
  time?: string;
  description?: string;
  travelMode?: 'walking' | 'driving' | 'cycling';
  day?: number;
  url?: string;
  placeId?: string;
  colorIndex?: number; // Color index for consistent coloring
}

/**
 * Parse locations from TipTap JSON document
 */
export function parseLocationsFromTipTapJSON(content: string): Location[] {
  try {
    const doc = JSON.parse(content);
    if (!doc || doc.type !== 'doc' || !doc.content) {
      return [];
    }

    const locations: Location[] = [];
    let nextColorIndex = 0;

    // Recursively find all destination nodes
    function findDestinations(nodes: any[]): void {
      for (const node of nodes) {
        if (node.type === 'destination' && node.attrs) {
          const { name, context, coordinates, placeId, colorIndex } = node.attrs;
          if (name) {
            locations.push({
              name,
              coordinates: coordinates || undefined,
              placeId: placeId || undefined,
              colorIndex: colorIndex !== undefined ? colorIndex : nextColorIndex++,
              description: context || '',
            });
          }
        }
        // Recursively check content
        if (node.content && Array.isArray(node.content)) {
          findDestinations(node.content);
        }
      }
    }

    findDestinations(doc.content);
    return locations;
  } catch (error) {
    console.error('Error parsing TipTap JSON for locations:', error);
    return [];
  }
}

/**
 * Parse locations from itinerary content synchronously (from existing links)
 * This is used for immediate rendering while async geocoding happens
 */
export function parseLocationsFromItinerary(content: string): Location[] {
  const locations: Location[] = [];
  const lines = content.split('\n');
  
  // Patterns to match locations and times
  const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i;
  const locationLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g; // Markdown links
  const headingPattern = /^#+\s*(Day\s*\d+|Morning|Afternoon|Evening)|<h[1-6][^>]*>\s*(Day\s*\d+|Morning|Afternoon|Evening)/i;
  const dayPattern = /Day\s*(\d+)/i;
  
  let currentSection = '';
  let currentDay = 1;
  
  // Track unique locations for consistent color assignment across entire document
  const locationColorMap = new Map<string, number>();
  let nextColorIndex = 0;
  
  // First, try to extract locations from markdown links
  const locationLinks = parseLocationLinks(content);
  
  for (const line of lines) {
    // Check for day markers
    const dayMatch = line.match(dayPattern);
    if (dayMatch) {
      currentDay = Number.parseInt(dayMatch[1]);
    }
    
    // Check for section headings
    const headingMatch = line.match(headingPattern);
    if (headingMatch) {
      currentSection = headingMatch[1] || headingMatch[2];
      continue;
    }
    
    // Extract time from line
    const timeMatch = line.match(timePattern);
    const time = timeMatch ? timeMatch[1] : undefined;
    
    // Detect travel mode from line content
    const lineLower = line.toLowerCase();
    let travelMode: 'walking' | 'driving' | 'cycling' | undefined;
    if (lineLower.includes('walk') || lineLower.includes('stroll')) {
      travelMode = 'walking';
    } else if (lineLower.includes('drive') || lineLower.includes('car') || lineLower.includes('taxi') || lineLower.includes('metro')) {
      travelMode = 'driving';
    } else if (lineLower.includes('bike') || lineLower.includes('cycle')) {
      travelMode = 'cycling';
    }
    
    // Look for HTML links with Google Maps URLs (handle both regular and HTML-encoded ampersands)
    const googleMapsLinkPattern = /<a[^>]*href="([^"]*google\.com\/maps[^"]*)"[^>]*>([^<]+)<\/a>/gi;
    let htmlMatch;
    while ((htmlMatch = googleMapsLinkPattern.exec(line)) !== null) {
      const [fullMatch, url, linkText] = htmlMatch;
      
      // Decode HTML entities in URL (e.g., &amp; to &)
      const decodedUrl = url.replace(/&amp;/g, '&');
      
      // Skip if this is just a reference in "Distance from" context
      const beforeMatch = line.substring(0, htmlMatch.index).toLowerCase();
      if (beforeMatch.includes('distance from') || beforeMatch.includes('distance:')) {
        continue;
      }
      
      // Parse data-location attribute if present
      const dataLocationMatch = fullMatch.match(/data-location="([^"]+)"/);
      let coordinates: [number, number] | undefined;
      let locationName = linkText;
      
      let colorIndex: number | undefined;
      
      if (dataLocationMatch) {
        // Parse JSON from data-location attribute
        try {
          // Unescape HTML entities in JSON
          const jsonStr = dataLocationMatch[1].replace(/&quot;/g, '"');
          const locationData = JSON.parse(jsonStr);
          
          // Extract coordinates if available
          if (locationData.lat && locationData.lng) {
            coordinates = [locationData.lng, locationData.lat];
          }
          
          // Use name from JSON if available
          if (locationData.name) {
            locationName = locationData.name;
          }
          
          // Extract color index if available
          if (typeof locationData.colorIndex === 'number') {
            colorIndex = locationData.colorIndex;
          }
        } catch (e) {
          console.warn('Failed to parse data-location JSON:', e);
        }
      }
      
      // Also check for data-color-index attribute
      const colorIndexMatch = fullMatch.match(/data-color-index="(\d+)"/);
      if (colorIndexMatch && colorIndex === undefined) {
        colorIndex = Number.parseInt(colorIndexMatch[1], 10);
      }
      
      // If no color index found, assign based on unique location name
      if (colorIndex === undefined) {
        if (locationColorMap.has(locationName.trim())) {
          colorIndex = locationColorMap.get(locationName.trim());
        } else {
          colorIndex = nextColorIndex++;
          locationColorMap.set(locationName.trim(), colorIndex);
        }
      }
      
      // Fallback to extracting from URL if no coordinates from JSON
      if (!coordinates && decodedUrl) {
        coordinates = extractCoordinatesFromUrl(decodedUrl);
      }
      
      // Always add location if we have a URL (Google Maps link)
      locations.push({
        name: locationName.trim(),
        coordinates,
        time,
        description: currentSection,
        day: currentDay,
        travelMode,
        url: decodedUrl,
        colorIndex
      });
    }
    
    // Also look for markdown links (fallback for older format)
    let linkMatch;
    locationLinkPattern.lastIndex = 0; // Reset regex
    while ((linkMatch = locationLinkPattern.exec(line)) !== null) {
      const [fullMatch, locationName, url] = linkMatch;
      
      // Skip if this is just a reference in "Distance from" context
      const beforeMatch = line.substring(0, linkMatch.index).toLowerCase();
      if (beforeMatch.includes('distance from') || beforeMatch.includes('distance:')) {
        continue;
      }
      
      // Skip if we already found this location as HTML link
      if (locations.some(l => l.name === locationName.trim() && l.day === currentDay)) {
        continue;
      }
      
      // Assign color index for markdown links too
      let colorIndex: number;
      if (locationColorMap.has(locationName.trim())) {
        colorIndex = locationColorMap.get(locationName.trim())!;
      } else {
        colorIndex = nextColorIndex++;
        locationColorMap.set(locationName.trim(), colorIndex);
      }
      
      // Try to extract coordinates from URL
      const coordinates = extractCoordinatesFromUrl(url);
      
      locations.push({
        name: locationName.trim(),
        coordinates,
        time,
        description: currentSection,
        day: currentDay,
        travelMode,
        url,
        colorIndex
      });
    }
  }
  
  // DEBUG: Check what attributes we're finding in the content
  const debugSampleLink = content.match(/<a[^>]*>[^<]+<\/a>/)?.[0];
  const googleMapsLinkPattern = /<a[^>]*href="([^"]*google\.com\/maps[^"]*)"[^>]*>([^<]+)<\/a>/gi;
  const googleMapsLinks = content.match(googleMapsLinkPattern) || [];
  
  console.log('[LocationParser] Content analysis:', {
    hasDataLocation: content.includes('data-location'),
    hasDataColorIndex: content.includes('data-color-index'),
    hasStyles: content.includes('style='),
    totalLinks: (content.match(/<a[^>]*>/g) || []).length,
    googleMapsLinks: googleMapsLinks.length,
    sampleLink: debugSampleLink,
    firstGoogleMapsLink: googleMapsLinks[0]
  });
  
  console.log('[LocationParser] Raw locations found:', locations.length, locations.map(l => ({
    name: l.name,
    coords: l.coordinates,
    day: l.day,
    time: l.time,
    colorIndex: l.colorIndex
  })));
  
  const dedupedLocations = deduplicateLocations(locations);
  console.log('[LocationParser] After deduplication:', dedupedLocations.length, dedupedLocations.map(l => ({
    name: l.name,
    coords: l.coordinates,
    day: l.day,
    time: l.time,
    colorIndex: l.colorIndex
  })));
  
  return dedupedLocations;
}

/**
 * Parse and geocode locations from itinerary content asynchronously
 * This provides full geocoding for all locations
 */
export async function parseAndGeocodeLocations(
  content: string,
  progressCallback?: (progress: number) => void
): Promise<Location[]> {
  const locations: Location[] = [];
  const lines = content.split('\n');
  
  // Extract context for geocoding
  const context = extractContextFromItinerary(content);
  
  // Patterns to match locations and times
  const timePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i;
  const locationPatterns = [
    /(?:Visit|Explore|Head to|Walk to|Arrive at|Depart from)\s+([^,.\n]+)/gi,
    /(?:Breakfast|Lunch|Dinner|Dine)\s+at\s+([^,.\n]+)/gi,
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, // Existing links
  ];
  const dayPattern = /Day\s*(\d+)/i;
  
  let currentDay = 1;
  const locationCandidates: Array<{
    name: string;
    time?: string;
    day: number;
    travelMode?: 'walking' | 'driving' | 'cycling';
    url?: string;
    line: string;
  }> = [];
  
  // First pass: collect all location candidates
  for (const line of lines) {
    // Check for day markers
    const dayMatch = line.match(dayPattern);
    if (dayMatch) {
      currentDay = Number.parseInt(dayMatch[1]);
    }
    
    // Extract time from line
    const timeMatch = line.match(timePattern);
    const time = timeMatch ? timeMatch[1] : undefined;
    
    // Detect travel mode
    const lineLower = line.toLowerCase();
    let travelMode: 'walking' | 'driving' | 'cycling' | undefined;
    if (lineLower.includes('walk') || lineLower.includes('stroll')) {
      travelMode = 'walking';
    } else if (lineLower.includes('drive') || lineLower.includes('car') || lineLower.includes('taxi')) {
      travelMode = 'driving';
    } else if (lineLower.includes('bike') || lineLower.includes('cycle')) {
      travelMode = 'cycling';
    }
    
    // Check each pattern
    for (const pattern of locationPatterns) {
      const matches = [...line.matchAll(pattern)];
      for (const match of matches) {
        let locationName = '';
        let url: string | undefined;
        
        if (match[2]?.startsWith('http')) {
          // This is a markdown link
          locationName = match[1].trim();
          url = match[2];
        } else {
          // Regular text match
          locationName = match[1]?.trim() || '';
        }
        
        if (locationName && locationName.length > 2) {
          // Clean up the location name
          const cleaned = locationName
            .replace(/^(the|at|in|to)\s+/i, '')
            .replace(/[.,;!?]+$/, '')
            .trim();
          
          if (cleaned && /[A-Z]/.test(cleaned[0])) {
            locationCandidates.push({
              name: cleaned,
              time,
              day: currentDay,
              travelMode,
              url,
              line
            });
          }
        }
      }
    }
  }
  
  // Second pass: geocode all unique locations
  const uniqueNames = Array.from(new Set(locationCandidates.map(c => c.name)));
  const geocodedMap = new Map<string, GeocodedLocation | null>();
  
  let processed = 0;
  for (const name of uniqueNames) {
    const candidate = locationCandidates.find(c => c.name === name);
    
    // If we already have a URL with coordinates, skip geocoding
    if (candidate?.url) {
      const coords = extractCoordinatesFromUrl(candidate.url);
      if (coords) {
        geocodedMap.set(name, {
          name,
          coordinates: coords,
          url: candidate.url,
          source: 'mapbox'
        });
        processed++;
        if (progressCallback) {
          progressCallback((processed / uniqueNames.length) * 100);
        }
        continue;
      }
    }
    
    // Geocode the location
    const geocoded = await geocodeLocation(name, context);
    geocodedMap.set(name, geocoded);
    
    processed++;
    if (progressCallback) {
      progressCallback((processed / uniqueNames.length) * 100);
    }
  }
  
  // Third pass: build final location list with geocoded data
  for (const candidate of locationCandidates) {
    const geocoded = geocodedMap.get(candidate.name);
    
    if (geocoded) {
      locations.push({
        name: candidate.name,
        coordinates: geocoded.coordinates,
        time: candidate.time,
        day: candidate.day,
        travelMode: candidate.travelMode,
        url: geocoded.url,
        placeId: geocoded.placeId,
        description: `Day ${candidate.day}`
      });
    } else if (candidate.url) {
      // Include even if geocoding failed but we have a URL
      locations.push({
        name: candidate.name,
        time: candidate.time,
        day: candidate.day,
        travelMode: candidate.travelMode,
        url: candidate.url,
        description: `Day ${candidate.day}`
      });
    }
  }
  
  return deduplicateLocations(locations);
}

function deduplicateLocations(locations: Location[]): Location[] {
  // Group locations by name and day
  const grouped = new Map<string, Location[]>();
  
  for (const location of locations) {
    const key = `${location.name}:${location.day || '1'}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)?.push(location);
  }
  
  // For each group, prefer the location with a time over one without
  const deduped: Location[] = [];
  
  for (const [key, group] of grouped) {
    if (group.length === 1) {
      deduped.push(group[0]);
    } else {
      // Sort to prioritize locations with times
      group.sort((a, b) => {
        // Prefer locations with times
        if (a.time && !b.time) return -1;
        if (!a.time && b.time) return 1;
        return 0;
      });
      
      // Keep only the first (best) location for this name/day combination
      deduped.push(group[0]);
    }
  }
  
  // Sort by day and preserve original order within each day
  return deduped.sort((a, b) => {
    const dayA = a.day || 1;
    const dayB = b.day || 1;
    return dayA - dayB;
  });
}