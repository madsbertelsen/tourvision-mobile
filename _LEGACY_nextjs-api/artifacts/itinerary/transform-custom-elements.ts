/**
 * Transform custom HTML elements (destination, transportation) into TipTap-compatible structures
 */

import { getModeIcon } from '@/lib/editor/transportation-helpers';
import { getMarkerColor } from './marker-colors';

/**
 * Extract text content from a tag
 */
function extractTag(html: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = html.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Strip HTML tags but preserve text content
 */
function stripHtmlTags(html: string): string {
  // Remove all HTML tags but keep the text content
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Extract attribute value from HTML attributes string
 */
function extractAttr(attrs: string, attrName: string): string {
  const regex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const match = attrs.match(regex);
  return match ? match[1] : '';
}

/**
 * Extract geometry information from location element
 */
function extractGeometry(locationHtml: string): { type: string; coordinates?: string } {
  const geometryMatch = locationHtml.match(/<geometry\s+type="([^"]*)"(?:\s+coordinates="([^"]*)")?/i);
  if (geometryMatch) {
    return {
      type: geometryMatch[1],
      coordinates: geometryMatch[2]
    };
  }
  return { type: 'point' };
}

/**
 * Transform custom destination and transportation elements into TipTap-compatible HTML
 */
export function transformCustomElements(html: string, colorMap?: { [key: string]: number } | null): string {
  // Keep track of destination index for color assignment
  let destinationIndex = 0;
  
  // Transform <destination> elements to details structure
  html = html.replace(
    /<destination>([\s\S]*?)<\/destination>/gi,
    (match, content) => {
      const summaryHtml = extractTag(content, 'summary');
      const summary = stripHtmlTags(summaryHtml); // Get plain text without HTML tags
      const details = extractTag(content, 'details');
      const locationContent = extractTag(content, 'location');
      const context = extractTag(locationContent, 'context');
      const geometry = extractGeometry(locationContent);
      
      // Get color for this destination (use plain text name for lookup)
      const colorIndex = colorMap ? (colorMap[summary] ?? destinationIndex) : destinationIndex;
      const color = getMarkerColor(colorIndex);
      
      // Create a data attribute for the destination
      const destinationData = {
        name: summary,
        context: context,
        geometry: geometry,
        type: 'destination'
      };
      
      // Apply color styling
      const bgOpacity = '08'; // Very subtle background (8% opacity)
      const borderOpacity = 'FF'; // Full opacity for border
      const style = `border-left: 4px solid ${color}${borderOpacity}; background-color: ${color}${bgOpacity}; --destination-color: ${color};`;
      
      destinationIndex++;
      
      return `<details class="destination-node" data-destination='${JSON.stringify(destinationData)}' data-color-index="${colorIndex}" data-color="${color}" style="${style}" open>
  <summary><span data-context="${context}">${summary}</span></summary>
  <div class="details-content">${details}</div>
</details>`;
    }
  );
  
  // Transform <transportation> elements to details structure
  html = html.replace(
    /<transportation([^>]*)>([\s\S]*?)<\/transportation>/gi,
    (match, attrs, content) => {
      const mode = extractAttr(attrs, 'mode') || 'walking';
      const duration = extractAttr(attrs, 'duration');
      const distance = extractAttr(attrs, 'distance');
      const summary = extractTag(content, 'summary');
      const details = extractTag(content, 'details');
      const from = extractTag(content, 'from');
      const to = extractTag(content, 'to');
      const locationContent = extractTag(content, 'location');
      const geometry = extractGeometry(locationContent);
      
      // Create transportation data
      const transportationData = {
        mode: mode,
        duration: duration ? Number.parseInt(duration) : undefined,
        distance: distance ? Number.parseInt(distance) : undefined,
        from: from,
        to: to,
        geometry: geometry,
        type: 'transportation'
      };
      
      // Get the appropriate icon for the mode
      const modeIcon = getModeIcon(mode as 'walking' | 'driving' | 'cycling');
      
      return `<details class="transportation-node" data-transportation='${JSON.stringify(transportationData)}'>
  <summary>${modeIcon} ${summary}</summary>
  <div class="details-content">
    <div class="transport-meta">
      <span class="transport-from">From: ${from}</span>
      <span class="transport-to">To: ${to}</span>
      ${duration ? `<span class="transport-duration">${duration} min</span>` : ''}
      ${distance ? `<span class="transport-distance">${(Number.parseInt(distance) / 1000).toFixed(1)} km</span>` : ''}
    </div>
    <div class="transport-details">${details}</div>
  </div>
</details>`;
    }
  );
  
  return html;
}

/**
 * Check if HTML contains custom elements
 */
export function hasCustomElements(html: string): boolean {
  return /<(destination|transportation)[^>]*>/.test(html);
}

/**
 * Extract destination names from custom elements for color mapping
 */
export function extractDestinationNames(html: string): string[] {
  const destinations: string[] = [];
  const regex = /<destination>([\s\S]*?)<\/destination>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const content = match[1];
    const summaryHtml = extractTag(content, 'summary');
    const summary = stripHtmlTags(summaryHtml); // Get plain text without HTML tags
    if (summary) {
      destinations.push(summary);
    }
  }
  
  return destinations;
}

/**
 * Extract all destinations from HTML
 */
export function extractDestinations(html: string): Array<{ name: string; context: string }> {
  const destinations: Array<{ name: string; context: string }> = [];
  const regex = /<destination>([\s\S]*?)<\/destination>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const content = match[1];
    const summaryHtml = extractTag(content, 'summary');
    const summary = stripHtmlTags(summaryHtml); // Get plain text without HTML tags
    const locationContent = extractTag(content, 'location');
    const context = extractTag(locationContent, 'context');
    
    if (summary) {
      destinations.push({
        name: summary,
        context: context || ''
      });
    }
  }
  
  return destinations;
}

/**
 * Extract all transportation segments from HTML
 */
export function extractTransportation(html: string): Array<{
  mode: string;
  from: string;
  to: string;
  duration?: number;
  distance?: number;
}> {
  const segments: Array<any> = [];
  const regex = /<transportation([^>]*)>([\s\S]*?)<\/transportation>/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];
    
    segments.push({
      mode: extractAttr(attrs, 'mode') || 'walking',
      from: extractTag(content, 'from'),
      to: extractTag(content, 'to'),
      duration: Number.parseInt(extractAttr(attrs, 'duration')) || undefined,
      distance: Number.parseInt(extractAttr(attrs, 'distance')) || undefined
    });
  }
  
  return segments;
}