import type { Location } from './location-parser';
import type { 
  TipTapDocument, 
  TipTapNode, 
} from './types/tiptap-json';
import { isTransportationNode, isDestinationNode } from './types/tiptap-json';

export interface TransportationSegment {
  mode: 'walking' | 'driving' | 'cycling';
  duration?: number;
  distance?: number;
  fromLocation?: string;
  toLocation?: string;
  fromCoordinates?: [number, number];
  toCoordinates?: [number, number];
  waypoints?: Array<[number, number]>; // Intermediate waypoints
  notes?: string;
  index?: number; // Position in document
}


/**
 * Parse locations from TipTap JSON document
 * This is much simpler and more reliable than HTML parsing
 */
export function parseLocationsFromJSON(jsonContent: string | TipTapDocument): Location[] {
  const locations: Location[] = [];
  
  try {
    // Parse JSON if string provided
    const doc: TipTapDocument = typeof jsonContent === 'string' 
      ? JSON.parse(jsonContent) 
      : jsonContent;
    
    if (!doc || doc.type !== 'doc') {
      console.warn('[LocationParserJSON] Invalid document format');
      return locations;
    }
  
  // First, check for metadata paragraph with places pool
  // This is the new format used by server-json-stream-object.ts
  for (const node of doc.content) {
    if (node.type === 'paragraph' && node.attrs?.['data-places-pool']) {
      try {
        const placesPool = JSON.parse(node.attrs['data-places-pool']);
        console.log('[LocationParserJSON] Found places pool in metadata:', placesPool.length);
        
        // Convert places pool to locations
        placesPool.forEach((place: any, index: number) => {
          if (place.coordinates) {
            locations.push({
              name: place.placeName || place.name,
              coordinates: place.coordinates,
              placeId: place.placeId,
              colorIndex: index, // Use index for consistent coloring
              description: place.description || place.whyVisit || '',
              day: 1, // Default to day 1, will be updated if we find day info
              time: undefined,
            });
          }
        });
        
        // If we found locations in metadata, return them
        if (locations.length > 0) {
          console.log('[LocationParserJSON] Using locations from metadata:', locations.length);
          return deduplicateLocations(locations);
        }
      } catch (error) {
        console.warn('[LocationParserJSON] Failed to parse places pool from metadata:', error);
      }
    }
  }
  
  // Track current context while traversing
  let currentDay = 1;
  let currentSection = '';
  let currentTime: string | undefined;
  
  // Traverse the document tree (fallback for documents without metadata)
  function traverseNode(node: TipTapNode, depth = 0) {
    // Handle destination nodes
    if (isDestinationNode(node)) {
      const { name, context, coordinates, placeId, colorIndex } = node.attrs;
      if (name) {
        locations.push({
          name,
          coordinates: coordinates || undefined,
          placeId: placeId || undefined,
          colorIndex: colorIndex !== undefined ? colorIndex : locations.length,
          description: context || '',
          day: currentDay,
          time: currentTime,
        });
      }
      // Process destination content
      if (node.content) {
        node.content.forEach(child => traverseNode(child, depth + 1));
      }
      return;
    }
    
    // Handle details nodes (collapsible sections)
    if (node.type === 'details' && node.content) {
      // Process details content
      node.content.forEach(child => traverseNode(child, depth + 1));
      return;
    }
    
    // Handle details summary nodes (usually contains the location)
    if (node.type === 'detailsSummary' && node.content) {
      // Process summary content (locations are typically here)
      node.content.forEach(child => traverseNode(child, depth + 1));
      return;
    }
    
    // Handle details content nodes - skip location extraction from descriptions
    if (node.type === 'detailsContent') {
      // We don't extract locations from the content, only from summary
      return;
    }
    
    // Extract context from headings
    if (node.type === 'heading') {
      const headingText = extractText(node);
      
      // Check for day markers
      const dayMatch = headingText.match(/Day\s*(\d+)/i);
      if (dayMatch) {
        currentDay = Number.parseInt(dayMatch[1]);
      }
      
      // Update section
      if (headingText.match(/Morning|Afternoon|Evening/i)) {
        currentSection = headingText;
      }
    }
    
    // Extract time from paragraph text
    if (node.type === 'paragraph') {
      const paragraphText = extractText(node);
      const timeMatch = paragraphText.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
      if (timeMatch) {
        currentTime = timeMatch[1];
      }
      
      // Check for travel mode indicators
      const lineLower = paragraphText.toLowerCase();
      let travelMode: 'walking' | 'driving' | 'cycling' | undefined;
      if (lineLower.includes('walk') || lineLower.includes('stroll')) {
        travelMode = 'walking';
      } else if (lineLower.includes('drive') || lineLower.includes('car') || lineLower.includes('taxi')) {
        travelMode = 'driving';  
      } else if (lineLower.includes('bike') || lineLower.includes('cycle')) {
        travelMode = 'cycling';
      }
      
      // Process location links in this paragraph
      processLocationLinks(node, {
        day: currentDay,
        section: currentSection,
        time: currentTime,
        travelMode
      });
    }
    
    // Process text nodes with location links
    if (node.type === 'text' && node.marks) {
      for (const mark of node.marks) {
        if (mark.type === 'link' && mark.attrs?.locationData) {
          const locationData = mark.attrs.locationData;
          
          // Create location entry with all metadata
          locations.push({
            name: locationData.name,
            coordinates: locationData.coordinates,
            time: locationData.time || currentTime,
            description: currentSection,
            day: locationData.day || currentDay,
            travelMode: locationData.travelMode,
            url: mark.attrs.href,
            placeId: locationData.placeId,
            colorIndex: locationData.colorIndex
          });
        }
      }
    }
    
    // Traverse child nodes
    if (node.content) {
      for (const child of node.content) {
        traverseNode(child, depth + 1);
      }
    }
  }
  
  // Process location links within a node
  function processLocationLinks(
    node: TipTapNode, 
    context: { 
      day: number; 
      section: string; 
      time?: string; 
      travelMode?: 'walking' | 'driving' | 'cycling' 
    }
  ) {
    if (!node.content) return;
    
    for (const child of node.content) {
      if (child.type === 'text' && child.marks) {
        for (const mark of child.marks) {
          if (mark.type === 'link' && mark.attrs?.locationData) {
            const locationData = mark.attrs.locationData;
            
            // Skip if this is a "Distance from" reference
            const textBefore = extractTextBefore(node, child);
            if (textBefore.toLowerCase().includes('distance from') || 
                textBefore.toLowerCase().includes('distance:')) {
              continue;
            }
            
            locations.push({
              name: locationData.name,
              coordinates: locationData.coordinates,
              time: locationData.time || context.time,
              description: context.section,
              day: locationData.day || context.day,
              travelMode: locationData.travelMode || context.travelMode,
              url: mark.attrs.href,
              placeId: locationData.placeId,
              colorIndex: locationData.colorIndex
            });
          }
        }
      }
    }
  }
  
  // Extract plain text from a node
  function extractText(node: TipTapNode): string {
    if (node.type === 'text') {
      return node.text || '';
    }
    
    if (node.content) {
      return node.content.map(extractText).join('');
    }
    
    return '';
  }
  
  // Extract text before a specific child node
  function extractTextBefore(parent: TipTapNode, targetChild: TipTapNode): string {
    if (!parent.content) return '';
    
    let text = '';
    for (const child of parent.content) {
      if (child === targetChild) break;
      text += extractText(child);
    }
    return text;
  }
  
  // Start traversing from root
  for (const node of doc.content) {
    traverseNode(node);
  }
  
  console.log('[LocationParserJSON] Found locations:', locations.length, locations.map(l => ({
    name: l.name,
    coords: l.coordinates,
    day: l.day,
    colorIndex: l.colorIndex
  })));
  
  // Deduplicate locations (same name and day)
  return deduplicateLocations(locations);
  } catch (error) {
    console.warn('[LocationParserJSON] Failed to parse JSON, likely partial content during streaming:', error);
    return locations; // Return whatever we've parsed so far
  }
}

function deduplicateLocations(locations: Location[]): Location[] {
  const seen = new Map<string, Location>();
  
  for (const location of locations) {
    const key = `${location.name}:${location.day || 1}`;
    
    if (!seen.has(key)) {
      seen.set(key, location);
    } else {
      // Keep the one with more metadata
      const existing = seen.get(key)!;
      if (!existing.time && location.time) {
        seen.set(key, location);
      } else if (!existing.coordinates && location.coordinates) {
        seen.set(key, location);
      }
    }
  }
  
  return Array.from(seen.values()).sort((a, b) => {
    const dayA = a.day || 1;
    const dayB = b.day || 1;
    return dayA - dayB;
  });
}

/**
 * Parse transportation nodes from TipTap JSON document
 */
export function parseTransportationFromJSON(jsonContent: string | TipTapDocument): TransportationSegment[] {
  const segments: TransportationSegment[] = [];
  const destinations: Array<{name: string, coordinates?: [number, number]}> = [];
  
  try {
    // Parse JSON if string provided
    const doc: TipTapDocument = typeof jsonContent === 'string' 
      ? JSON.parse(jsonContent) 
      : jsonContent;
    
    if (!doc || doc.type !== 'doc') {
      console.warn('[TransportationParser] Invalid document format');
      return segments;
    }
    
    let nodeIndex = 0;
    let lastDestination: {name: string, coordinates?: [number, number]} | null = null;
    
    // First pass: collect all destinations
    function collectDestinations(node: TipTapNode) {
      if (isDestinationNode(node)) {
        const dest = {
          name: node.attrs.name,
          coordinates: node.attrs.coordinates as [number, number] | undefined
        };
        destinations.push(dest);
      }
      
      // Traverse child nodes
      if (node.content) {
        for (const child of node.content) {
          collectDestinations(child);
        }
      }
    }
    
    // Second pass: collect transportation nodes and connect with destinations
    function traverseNode(node: TipTapNode) {
      // Track the current destination context
      if (isDestinationNode(node)) {
        lastDestination = {
          name: node.attrs.name,
          coordinates: node.attrs.coordinates as [number, number] | undefined
        };
      }
      
      // Check if this is a transportation node
      if (isTransportationNode(node)) {
        const { mode, duration, distance, fromLocation, toLocation, waypoints, notes } = node.attrs;
        
        // Determine from coordinates
        let fromCoords: [number, number] | undefined;
        let actualFromLocation = fromLocation;
        
        if (!fromLocation && lastDestination) {
          // Use the last destination as the from location
          fromCoords = lastDestination.coordinates;
          actualFromLocation = lastDestination.name;
        } else if (fromLocation) {
          // Find destination by name
          const fromDest = destinations.find(d => d.name === fromLocation);
          fromCoords = fromDest?.coordinates;
        }
        
        // Determine to coordinates
        let toCoords: [number, number] | undefined;
        let actualToLocation = toLocation;
        
        if (toLocation) {
          // Find destination by name
          const toDest = destinations.find(d => d.name === toLocation);
          toCoords = toDest?.coordinates;
        } else {
          // Try to find the next destination after this transportation node
          const currentIndex = destinations.findIndex(d => d.name === lastDestination?.name);
          if (currentIndex >= 0 && currentIndex < destinations.length - 1) {
            const nextDest = destinations[currentIndex + 1];
            toCoords = nextDest.coordinates;
            actualToLocation = nextDest.name;
          }
        }
        
        segments.push({
          mode: mode || 'walking',
          duration,
          distance,
          fromLocation: actualFromLocation,
          toLocation: actualToLocation,
          fromCoordinates: fromCoords,
          toCoordinates: toCoords,
          waypoints,
          notes,
          index: nodeIndex++
        });
      }
      
      // Traverse child nodes
      if (node.content) {
        for (const child of node.content) {
          traverseNode(child);
        }
      }
    }
    
    // First collect all destinations
    for (const node of doc.content) {
      collectDestinations(node);
    }
    
    // Then traverse and connect transportation nodes
    for (const node of doc.content) {
      traverseNode(node);
    }
    
    console.log('[TransportationParser] Found destinations:', destinations.length, destinations);
    console.log('[TransportationParser] Found segments:', segments.length, segments);
    
    return segments;
  } catch (error) {
    console.warn('[TransportationParser] Failed to parse JSON:', error);
    return segments;
  }
}