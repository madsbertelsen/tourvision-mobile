interface PresentationBlock {
  id: string;
  content: string; // HTML content
  locations: Array<{
    name: string;
    lat: number;
    lng: number;
  }>;
}

/**
 * Parse HTML message content into presentation blocks
 * Each block element (p, h1-h6, ul, ol) becomes a separate slide
 */
export function parsePresentationBlocks(htmlContent: string): PresentationBlock[] {
  const blocks: PresentationBlock[] = [];

  // Match block-level HTML elements
  const blockRegex = /<(p|h[1-6]|ul|ol|blockquote)[^>]*>(.*?)<\/\1>/gis;
  let match;
  let blockIndex = 0;

  while ((match = blockRegex.exec(htmlContent)) !== null) {
    const [fullMatch, tagName, innerContent] = match;

    // Extract locations from geo-mark spans in this block
    const locations = extractLocationsFromHTML(innerContent);

    blocks.push({
      id: `block-${blockIndex}`,
      content: fullMatch, // Keep the full HTML for rendering
      locations,
    });

    blockIndex++;
  }

  return blocks;
}

/**
 * Extract location data from geo-mark spans in HTML content
 */
function extractLocationsFromHTML(html: string): Array<{
  name: string;
  lat: number;
  lng: number;
}> {
  const locations: Array<{ name: string; lat: number; lng: number }> = [];
  const geoMarkRegex = /<span[^>]*class="geo-mark"[^>]*data-place-name="([^"]*)"[^>]*data-lat="([^"]*)"[^>]*data-lng="([^"]*)"[^>]*>([^<]*)<\/span>/gi;

  let match;
  while ((match = geoMarkRegex.exec(html)) !== null) {
    const [, placeName, lat, lng, text] = match;

    // Only add if we have valid coordinates
    if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
      locations.push({
        name: placeName || text,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      });
    }
  }

  return locations;
}

/**
 * Calculate the center point and zoom level for a set of locations
 */
export function calculateMapBounds(locations: Array<{ lat: number; lng: number }>) {
  if (locations.length === 0) {
    return null;
  }

  if (locations.length === 1) {
    return {
      center: { lat: locations[0].lat, lng: locations[0].lng },
      zoom: 12,
    };
  }

  // Calculate bounds
  let minLat = locations[0].lat;
  let maxLat = locations[0].lat;
  let minLng = locations[0].lng;
  let maxLng = locations[0].lng;

  locations.forEach(loc => {
    minLat = Math.min(minLat, loc.lat);
    maxLat = Math.max(maxLat, loc.lat);
    minLng = Math.min(minLng, loc.lng);
    maxLng = Math.max(maxLng, loc.lng);
  });

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Calculate appropriate zoom level based on span
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const maxSpan = Math.max(latSpan, lngSpan);

  let zoom = 12; // Default zoom
  if (maxSpan > 10) zoom = 6;
  else if (maxSpan > 5) zoom = 8;
  else if (maxSpan > 2) zoom = 10;
  else if (maxSpan > 0.5) zoom = 11;

  return {
    center: { lat: centerLat, lng: centerLng },
    zoom,
  };
}
