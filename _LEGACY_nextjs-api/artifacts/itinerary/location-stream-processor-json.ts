import { geocodeLocation } from './geocoding-service';
import { getMarkerColor, getLighterShade } from './marker-colors';
import type { TipTapDocument, TipTapNode, TextNode, LocationMetadata } from './types/tiptap-json';

/**
 * Stream processor that enriches location references in real-time
 * Processes JSON content and enriches location marks with geocoding data
 */
export class LocationStreamProcessorJSON {
  private buffer = '';
  private geocodeCache = new Map<string, { coordinates: [number, number]; placeId?: string }>();
  private pendingGeocodes = new Map<string, Promise<any>>();
  private locationColorMap = new Map<string, number>();
  private nextColorIndex = 0;
  
  /**
   * Process a chunk of streaming JSON text
   * Returns enriched JSON content
   */
  async processChunk(chunk: string): Promise<{ json: string; complete: boolean }> {
    this.buffer += chunk;
    
    // Try to parse the buffer as JSON
    try {
      const doc = JSON.parse(this.buffer) as TipTapDocument;
      
      // Process the document to enrich locations
      const enrichedDoc = await this.enrichDocument(doc);
      
      return { 
        json: JSON.stringify(enrichedDoc), 
        complete: true 
      };
    } catch (error) {
      // If JSON is incomplete, wait for more chunks
      // Check if we have a closing brace to know if JSON might be complete
      const openBraces = (this.buffer.match(/{/g) || []).length;
      const closeBraces = (this.buffer.match(/}/g) || []).length;
      const openBrackets = (this.buffer.match(/\[/g) || []).length;
      const closeBrackets = (this.buffer.match(/]/g) || []).length;
      
      const isLikelyComplete = openBraces === closeBraces && openBrackets === closeBrackets;
      
      if (isLikelyComplete && this.buffer.trim()) {
        console.error('[LocationStreamProcessorJSON] Failed to parse complete JSON:', error);
        // Return a basic document structure
        return {
          json: JSON.stringify({
            type: 'doc',
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: this.buffer
              }]
            }]
          }),
          complete: true
        };
      }
      
      // Still waiting for more content
      return { 
        json: JSON.stringify({
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Loading...'
            }]
          }]
        }), 
        complete: false 
      };
    }
  }
  
  /**
   * Enrich a TipTap document with geocoding data
   */
  private async enrichDocument(doc: TipTapDocument): Promise<TipTapDocument> {
    if (!doc.content || !Array.isArray(doc.content)) {
      return doc;
    }
    
    // Process each node in the document
    const enrichedContent = await Promise.all(
      doc.content.map(node => this.enrichNode(node))
    );
    
    return {
      ...doc,
      content: enrichedContent
    };
  }
  
  /**
   * Enrich a single node and its children
   */
  private async enrichNode(node: TipTapNode): Promise<TipTapNode> {
    if (!node) return node;
    
    // Process content array if it exists
    if (node.content && Array.isArray(node.content)) {
      const enrichedContent = await Promise.all(
        node.content.map(child => this.enrichNode(child))
      );
      return {
        ...node,
        content: enrichedContent
      };
    }
    
    // Process text nodes with marks
    if (node.type === 'text' && node.marks && Array.isArray(node.marks)) {
      const enrichedMarks = await Promise.all(
        node.marks.map(async mark => {
          if (mark.type === 'link' && mark.attrs?.locationData) {
            // Enrich the location data
            const locationData = mark.attrs.locationData;
            const name = locationData.name || (node as TextNode).text;
            const context = locationData.context || '';
            
            // Assign color index
            let colorIndex: number;
            if (this.locationColorMap.has(name)) {
              colorIndex = this.locationColorMap.get(name)!;
            } else {
              colorIndex = this.nextColorIndex++;
              this.locationColorMap.set(name, colorIndex);
              console.log(`[LocationStreamProcessorJSON] Assigned color index ${colorIndex} to "${name}"`);
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
                console.log(`[LocationStreamProcessorJSON] Geocoded ${name}:`, coordinates);
              } catch (error) {
                console.error(`[LocationStreamProcessorJSON] Failed to geocode ${name}:`, error);
              }
            }
            
            // Create enriched location data
            const color = getMarkerColor(colorIndex);
            const bgColor = getLighterShade(color, 0.15);
            
            return {
              ...mark,
              attrs: {
                ...mark.attrs,
                href: coordinates 
                  ? `https://www.google.com/maps/search/?api=1&query=${coordinates[1]},${coordinates[0]}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${context}`)}`,
                target: '_blank',
                rel: 'noopener noreferrer',
                locationData: {
                  name,
                  coordinates: coordinates || [0, 0],
                  colorIndex,
                  placeId,
                  bgColor,
                  color
                } as LocationMetadata
              }
            };
          }
          return mark;
        })
      );
      
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
      const doc = JSON.parse(this.buffer) as TipTapDocument;
      const enrichedDoc = await this.enrichDocument(doc);
      
      console.log('[LocationStreamProcessorJSON] Flush complete with enrichment');
      console.log('[LocationStreamProcessorJSON] Total unique locations:', this.locationColorMap.size);
      
      return JSON.stringify(enrichedDoc);
    } catch (error) {
      console.error('[LocationStreamProcessorJSON] Failed to parse final JSON:', error);
      
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