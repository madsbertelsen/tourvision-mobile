import { generateJSON } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import { Destination } from '@/lib/editor/destination-extension';
import { geocodeLocation } from './geocoding-service';
import { getMarkerColor, getLighterShade } from './marker-colors';
import { transformCustomElements, extractDestinationNames } from './transform-custom-elements';
import type { TipTapDocument, TipTapNode, LocationMetadata } from './types/tiptap-json';

// Custom Link extension that preserves locationData
const CustomLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      locationData: {
        default: null,
        parseHTML: element => {
          const dataLocation = element.getAttribute('data-location');
          if (dataLocation) {
            try {
              return JSON.parse(dataLocation);
            } catch {
              return null;
            }
          }
          return null;
        },
        renderHTML: attributes => {
          if (!attributes.locationData) {
            return {};
          }
          return {
            'data-location': JSON.stringify(attributes.locationData),
          };
        }
      }
    };
  }
});

/**
 * Stream processor that converts HTML to TipTap JSON and enriches location references
 */
export class LocationStreamProcessorHTMLToJSON {
  private buffer = '';
  private geocodeCache = new Map<string, { coordinates: [number, number]; placeId?: string }>();
  private pendingGeocodes = new Map<string, Promise<any>>();
  private locationColorMap = new Map<string, number>();
  private nextColorIndex = 0;
  private extensions = [
    StarterKit,
    CustomLink,
    Details.configure({
      persist: true,
      openClassName: 'is-open',
      HTMLAttributes: {
        class: 'details-node',
      },
    }),
    DetailsSummary.configure({
      HTMLAttributes: {
        class: 'details-summary',
      },
    }),
    DetailsContent.configure({
      HTMLAttributes: {
        class: 'details-content',
      },
    }),
    Destination,
  ];
  
  /**
   * Unescape HTML entities
   */
  private unescapeHTML(html: string): string {
    const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
    if (textarea) {
      textarea.innerHTML = html;
      return textarea.value;
    }
    // Fallback for server-side
    return html
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  /**
   * Process a chunk of streaming HTML text
   * Returns enriched JSON content
   */
  async processChunk(chunk: string): Promise<{ json: string; complete: boolean }> {
    this.buffer += chunk;
    
    // Unescape HTML entities if present
    const unescapedBuffer = this.unescapeHTML(this.buffer);
    
    // Create color map for destinations
    const destinationNames = extractDestinationNames(unescapedBuffer);
    const colorMap: { [key: string]: number } = {};
    destinationNames.forEach((name, index) => {
      colorMap[name] = index;
    });
    
    // First transform custom elements to details/summary structure with colors
    const transformedHTML = transformCustomElements(unescapedBuffer, colorMap);
    
    // Process destination and location tags to enrich them with geocoding data
    const enrichedHTML = await this.enrichLocationsInHTML(transformedHTML);
    
    // Try to parse complete sections progressively
    const partialDoc = this.parsePartialHTML(enrichedHTML);
    
    if (partialDoc) {
      // We have some parseable content
      try {
        // Further enrich the JSON with location metadata
        const enrichedDoc = await this.enrichJSONDocument(partialDoc);
        
        // Check if HTML structure is complete
        const isComplete = this.hasCompleteStructure(enrichedHTML);
        
        return { 
          json: JSON.stringify(enrichedDoc), 
          complete: isComplete 
        };
      } catch (error) {
        console.log('[LocationStreamProcessorHTMLToJSON] Error enriching partial document:', error);
      }
    }
    
    // Fallback: show plain text version of content
    const visibleText = this.extractVisibleText(enrichedHTML);
    
    return { 
      json: JSON.stringify({
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: visibleText || 'Generating itinerary...'
          }]
        }]
      }), 
      complete: false 
    };
  }
  
  /**
   * Check if HTML has complete structure
   */
  private hasCompleteStructure(html: string): boolean {
    // Check for common complete patterns
    const trimmed = html.trim();
    
    // Check if ends with a closing tag
    if (!trimmed.endsWith('>')) return false;
    
    // Check for unclosed location tags
    if (trimmed.includes('<location') && !trimmed.includes('</location>')) return false;
    
    // Check for unclosed paragraphs or headings
    const openP = (trimmed.match(/<p[^>]*>/gi) || []).length;
    const closeP = (trimmed.match(/<\/p>/gi) || []).length;
    if (openP !== closeP) return false;
    
    const openH = (trimmed.match(/<h[1-6][^>]*>/gi) || []).length;
    const closeH = (trimmed.match(/<\/h[1-6]>/gi) || []).length;
    if (openH !== closeH) return false;
    
    return true;
  }
  
  /**
   * Try to parse partial HTML into a valid TipTap document
   */
  private parsePartialHTML(html: string): TipTapDocument | null {
    if (!html.trim()) return null;
    
    // Try to parse what we have
    try {
      // First attempt: parse as-is
      const doc = generateJSON(html, this.extensions) as TipTapDocument;
      return doc;
    } catch {
      // Second attempt: try to close unclosed tags
      try {
        const closedHTML = this.autoCloseHTML(html);
        const doc = generateJSON(closedHTML, this.extensions) as TipTapDocument;
        return doc;
      } catch {
        // Can't parse even with auto-closing
        return null;
      }
    }
  }
  
  /**
   * Attempt to auto-close unclosed HTML tags
   */
  private autoCloseHTML(html: string): string {
    let result = html;
    
    // Track open tags
    const tagStack: string[] = [];
    const tagRegex = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
    let match;
    
    while ((match = tagRegex.exec(html)) !== null) {
      const [fullMatch, tagName] = match;
      const isClosing = fullMatch.startsWith('</');
      const isSelfClosing = fullMatch.endsWith('/>') || ['br', 'hr', 'img', 'input'].includes(tagName.toLowerCase());
      
      if (!isClosing && !isSelfClosing) {
        tagStack.push(tagName);
      } else if (isClosing) {
        const lastIndex = tagStack.lastIndexOf(tagName);
        if (lastIndex >= 0) {
          tagStack.splice(lastIndex, 1);
        }
      }
    }
    
    // Close any remaining open tags
    while (tagStack.length > 0) {
      const tag = tagStack.pop();
      result += `</${tag}>`;
    }
    
    return result;
  }
  
  /**
   * Extract visible text from partial HTML
   */
  private extractVisibleText(html: string): string {
    // Strip HTML tags to get plain text
    const text = html
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return text;
  }
  
  /**
   * Enrich location tags in HTML with geocoding data
   */
  private async enrichLocationsInHTML(html: string): Promise<string> {
    // Find all span tags with data-context (from transformed destinations)
    const locationPattern = /<span\s+data-context="([^"]+)">([^<]+)<\/span>/g;
    const matches = [];
    let match;
    
    while ((match = locationPattern.exec(html)) !== null) {
      matches.push({
        fullMatch: match[0],
        context: match[1],
        name: match[2],
        index: match.index
      });
    }
    
    if (matches.length === 0) {
      return html;
    }
    
    // Process each location
    let enrichedHTML = html;
    let offset = 0;
    
    for (const locationMatch of matches) {
      const { fullMatch, context, name, index } = locationMatch;
      
      // Assign color index
      let colorIndex: number;
      if (this.locationColorMap.has(name)) {
        colorIndex = this.locationColorMap.get(name)!;
      } else {
        colorIndex = this.nextColorIndex++;
        this.locationColorMap.set(name, colorIndex);
        console.log(`[LocationStreamProcessorHTMLToJSON] Assigned color index ${colorIndex} to "${name}"`);
      }
      
      // Try to geocode
      const cacheKey = `${name}:${context}`;
      let coordinates: [number, number] | undefined;
      let placeId: string | undefined;
      
      if (this.geocodeCache.has(cacheKey)) {
        const cached = this.geocodeCache.get(cacheKey)!;
        coordinates = cached.coordinates;
        placeId = cached.placeId;
      } else {
        try {
          const result = await this.performGeocode(name, context);
          coordinates = result.coordinates;
          placeId = result.placeId;
          this.geocodeCache.set(cacheKey, result);
          console.log(`[LocationStreamProcessorHTMLToJSON] Geocoded ${name}:`, coordinates);
        } catch (error) {
          console.error(`[LocationStreamProcessorHTMLToJSON] Failed to geocode ${name}:`, error);
        }
      }
      
      // Create enriched location data
      const color = getMarkerColor(colorIndex);
      const bgColor = getLighterShade(color, 0.15);
      
      const locationData: LocationMetadata = {
        name,
        coordinates: coordinates || [0, 0],
        colorIndex,
        placeId,
        bgColor,
        color,
        context
      };
      
      // Convert to a link with location data
      const locationTag = `<a href="https://maps.google.com/?q=${encodeURIComponent(`${name}, ${context}`)}" data-location='${JSON.stringify(locationData)}' style="background-color: ${bgColor}; color: ${color}; padding: 2px 8px; border-radius: 4px; font-weight: 500; text-decoration: none; display: inline-block;">${name}</a>`;
      
      // Replace in HTML
      const adjustedIndex = index + offset;
      enrichedHTML = enrichedHTML.substring(0, adjustedIndex) + locationTag + enrichedHTML.substring(adjustedIndex + fullMatch.length);
      offset += locationTag.length - fullMatch.length;
    }
    
    return enrichedHTML;
  }
  
  /**
   * Further enrich the JSON document with location metadata
   */
  private async enrichJSONDocument(doc: TipTapDocument): Promise<TipTapDocument> {
    if (!doc.content || !Array.isArray(doc.content)) {
      return doc;
    }
    
    // Process each node in the document
    const enrichedContent = await Promise.all(
      doc.content.map(node => this.enrichJSONNode(node))
    );
    
    return {
      ...doc,
      content: enrichedContent
    };
  }
  
  /**
   * Enrich a single JSON node
   */
  private async enrichJSONNode(node: TipTapNode): Promise<TipTapNode> {
    if (!node) return node;
    
    // Process content array if it exists
    if (node.content && Array.isArray(node.content)) {
      const enrichedContent = await Promise.all(
        node.content.map(child => this.enrichJSONNode(child))
      );
      return {
        ...node,
        content: enrichedContent
      };
    }
    
    // Process text nodes with link marks
    if (node.type === 'text' && node.marks && Array.isArray(node.marks)) {
      const enrichedMarks = node.marks.map(mark => {
        if (mark.type === 'link' && mark.attrs?.locationData) {
          // The locationData should already be enriched from HTML processing
          return mark;
        }
        return mark;
      });
      
      return {
        ...node,
        marks: enrichedMarks
      };
    }
    
    return node;
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
   * Flush any remaining buffer and return final JSON
   */
  async flush(): Promise<string> {
    if (!this.buffer.trim()) {
      return JSON.stringify({
        type: 'doc',
        content: []
      });
    }
    
    try {
      // First transform custom elements to details/summary structure
      const transformedHTML = transformCustomElements(this.buffer);
      
      // Then enrich with geocoding data
      const enrichedHTML = await this.enrichLocationsInHTML(transformedHTML);
      
      // Convert to JSON
      const doc = generateJSON(enrichedHTML, this.extensions) as TipTapDocument;
      const enrichedDoc = await this.enrichJSONDocument(doc);
      
      console.log('[LocationStreamProcessorHTMLToJSON] Flush complete with enrichment');
      console.log('[LocationStreamProcessorHTMLToJSON] Total unique locations:', this.locationColorMap.size);
      
      return JSON.stringify(enrichedDoc);
    } catch (error) {
      console.error('[LocationStreamProcessorHTMLToJSON] Failed to convert final HTML:', error);
      
      // Return basic structure with raw text
      return JSON.stringify({
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: this.buffer
          }]
        }]
      });
    }
  }
  
  /**
   * Reset the processor for a new stream
   */
  reset() {
    this.buffer = '';
    this.locationColorMap.clear();
    this.nextColorIndex = 0;
  }
}