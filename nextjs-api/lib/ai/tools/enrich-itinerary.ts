import { geocodeLocation } from '@/artifacts/itinerary/geocoding-service';

interface MarkedLocation {
  name: string;
  context: string;
  originalTag: string;
}

/**
 * Extract locations marked by the LLM with <location> tags
 */
function extractMarkedLocations(content: string): MarkedLocation[] {
  const locations: MarkedLocation[] = [];
  const regex = /<location\s+data-context="([^"]+)">([^<]+)<\/location>/gi;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    locations.push({
      context: match[1].trim(),
      name: match[2].trim(),
      originalTag: match[0]
    });
  }
  
  return locations;
}

/**
 * Enrich an itinerary document with geocoded location links
 * This runs after the document has been created/updated
 */
export async function enrichItinerary(content: string): Promise<string> {
  try {
    // Extract locations marked by the LLM
    const markedLocations = extractMarkedLocations(content);
    
    if (markedLocations.length === 0) {
      console.log('No marked locations found in itinerary');
      return content;
    }
    
    console.log(`Enriching ${markedLocations.length} marked locations in itinerary`);
    
    let enrichedContent = content;
    
    for (const loc of markedLocations) {
      console.log(`Geocoding: "${loc.name}" with context "${loc.context}"`);
      
      try {
        // Try to geocode with the provided context
        const geocoded = await geocodeLocation(loc.name, loc.context);
        
        if (geocoded?.coordinates) {
          // Success: Use exact coordinates
          const coordUrl = `https://www.google.com/maps/search/?api=1&query=${geocoded.coordinates[1]},${geocoded.coordinates[0]}`;
          
          // Create JSON data for the location
          const locationData = {
            name: loc.name,
            lat: geocoded.coordinates[1],
            lng: geocoded.coordinates[0],
            placeId: geocoded.placeId,
            context: loc.context
          };
          
          // Escape JSON for HTML attribute (replace quotes with HTML entities)
          const jsonData = JSON.stringify(locationData).replace(/"/g, '&quot;');
          
          const replacement = `<a href="${coordUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline location-link" data-location="${jsonData}">${loc.name}</a>`;
          enrichedContent = enrichedContent.replace(loc.originalTag, replacement);
          console.log(`✓ Geocoded ${loc.name} to coordinates: ${geocoded.coordinates[1]}, ${geocoded.coordinates[0]}`);
        } else {
          // Fallback: Create a Google Maps search URL with name and context
          const searchQuery = `${loc.name}, ${loc.context}`;
          const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
          
          // Create JSON data for fallback (no coordinates)
          const locationData = {
            name: loc.name,
            context: loc.context,
            fallback: true
          };
          
          // Escape JSON for HTML attribute
          const jsonData = JSON.stringify(locationData).replace(/"/g, '&quot;');
          
          const replacement = `<a href="${fallbackUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline location-link location-fallback" data-location="${jsonData}">${loc.name}</a>`;
          enrichedContent = enrichedContent.replace(loc.originalTag, replacement);
          console.log(`⚠ Using fallback search for ${loc.name}`);
        }
      } catch (error) {
        // Error fallback: Create a Google Maps search URL
        console.error(`Error geocoding ${loc.name}:`, error);
        const searchQuery = `${loc.name}, ${loc.context}`;
        const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;
        
        // Create JSON data for error fallback
        const locationData = {
          name: loc.name,
          context: loc.context,
          error: true
        };
        
        // Escape JSON for HTML attribute
        const jsonData = JSON.stringify(locationData).replace(/"/g, '&quot;');
        
        const replacement = `<a href="${fallbackUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline location-link location-error" data-location="${jsonData}">${loc.name}</a>`;
        enrichedContent = enrichedContent.replace(loc.originalTag, replacement);
      }
    }
    
    console.log(`Successfully enriched ${markedLocations.length} locations`);
    return enrichedContent;
  } catch (error) {
    console.error('Error enriching itinerary:', error);
    return content; // Return original content on error
  }
}

/**
 * Check if content is an itinerary that needs enrichment
 */
export function isItinerary(content: string): boolean {
  const itineraryIndicators = [
    /itinerary/i,
    /day\s+\d+:/i,
    /morning.*afternoon.*evening/i,
    /\d+:\d+\s*(AM|PM)/i,
    /<location\s+data-context=/i, // Check for location tags
  ];
  
  return itineraryIndicators.some(pattern => pattern.test(content));
}