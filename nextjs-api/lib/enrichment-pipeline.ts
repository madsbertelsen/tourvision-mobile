import { geocodeLocation } from './geocoding-service';

/**
 * Enrichment pipeline for processing HTML content before streaming to client
 */
export class EnrichmentPipeline {
  private googleApiKey?: string;
  private buffer: string = '';
  private isProcessing: boolean = false;

  constructor(googleApiKey?: string) {
    this.googleApiKey = googleApiKey;
    console.log('[EnrichmentPipeline] Initialized with API key:', googleApiKey ? 'Yes' : 'No');
  }

  /**
   * Process a chunk of HTML content
   * Accumulates content until a complete geo-mark is found, then enriches it
   */
  async processChunk(chunk: string): Promise<string> {
    // Add chunk to buffer
    this.buffer += chunk;

    if (chunk.includes('geo-mark')) {
      console.log('[EnrichmentPipeline] Processing chunk with geo-mark, buffer size:', this.buffer.length);
    }

    // Check if we have complete geo-marks to process
    const processedContent = await this.processBuffer();

    return processedContent;
  }

  /**
   * Process the buffer and extract complete elements
   */
  private async processBuffer(): Promise<string> {
    let result = '';
    let currentBuffer = this.buffer;

    // Find and process complete geo-marks
    const geoMarkRegex = /<span class="geo-mark"[^>]*>.*?<\/span>/g;
    let lastIndex = 0;
    let match;

    while ((match = geoMarkRegex.exec(currentBuffer)) !== null) {
      console.log('[EnrichmentPipeline] Found complete geo-mark:', match[0].substring(0, 100));
      // Add content before the geo-mark
      result += currentBuffer.slice(lastIndex, match.index);

      // Process the geo-mark
      const enrichedGeoMark = await this.enrichGeoMark(match[0]);
      result += enrichedGeoMark;

      lastIndex = match.index + match[0].length;
    }

    // Check if we have an incomplete geo-mark at the end
    const incompleteGeoMarkStart = currentBuffer.lastIndexOf('<span class="geo-mark"');
    if (incompleteGeoMarkStart > lastIndex) {
      // We might have an incomplete geo-mark
      const possibleIncomplete = currentBuffer.slice(incompleteGeoMarkStart);
      if (!possibleIncomplete.includes('</span>')) {
        // It's incomplete, keep it in buffer
        result += currentBuffer.slice(lastIndex, incompleteGeoMarkStart);
        this.buffer = possibleIncomplete;
        return result;
      }
    }

    // Add remaining content and clear buffer
    result += currentBuffer.slice(lastIndex);
    this.buffer = '';

    return result;
  }

  /**
   * Enrich a geo-mark with coordinates
   */
  private async enrichGeoMark(geoMarkHtml: string): Promise<string> {
    console.log('[EnrichmentPipeline] enrichGeoMark called with:', geoMarkHtml.substring(0, 150));
    // Extract attributes
    const placeNameMatch = geoMarkHtml.match(/data-place-name="([^"]*)"/);
    const latMatch = geoMarkHtml.match(/data-lat="([^"]*)"/);

    // If already has valid coordinates, return as-is
    if (latMatch && latMatch[1] !== 'PENDING') {
      console.log('[EnrichmentPipeline] Geo-mark already has coordinates, skipping');
      return geoMarkHtml;
    }

    // Extract place name
    const placeName = placeNameMatch ? placeNameMatch[1] : null;
    console.log('[EnrichmentPipeline] Extracted place name:', placeName);
    if (!placeName) {
      console.log('[EnrichmentPipeline] No place name found, returning original');
      return geoMarkHtml;
    }

    // Get coordinates
    console.log('[EnrichmentPipeline] Calling geocodeLocation for:', placeName);
    const coords = await geocodeLocation(placeName, this.googleApiKey);
    console.log('[EnrichmentPipeline] Geocoding result:', coords);
    if (!coords) {
      console.log('[EnrichmentPipeline] No coordinates found, returning original');
      return geoMarkHtml;
    }

    // Replace PENDING with actual coordinates
    let enriched = geoMarkHtml;
    enriched = enriched.replace(/data-lat="[^"]*"/, `data-lat="${coords.lat}"`);
    enriched = enriched.replace(/data-lng="[^"]*"/, `data-lng="${coords.lng}"`);

    // Add a data attribute to indicate the source
    enriched = enriched.replace(
      'data-geo="true"',
      `data-geo="true" data-coord-source="${coords.source}"`
    );

    console.log('[EnrichmentPipeline] Enriched geo-mark:', enriched.substring(0, 150));
    return enriched;
  }

  /**
   * Flush any remaining buffer content
   */
  async flush(): Promise<string> {
    const remaining = this.buffer;
    this.buffer = '';

    // Process any remaining geo-marks
    if (remaining.includes('<span class="geo-mark"')) {
      return this.enrichGeoMark(remaining);
    }

    return remaining;
  }
}

/**
 * Create a transform stream for enriching HTML content
 */
export function createEnrichmentTransform(googleApiKey?: string) {
  const pipeline = new EnrichmentPipeline(googleApiKey);

  return new TransformStream({
    async transform(chunk: string, controller) {
      const enriched = await pipeline.processChunk(chunk);
      if (enriched) {
        controller.enqueue(enriched);
      }
    },

    async flush(controller) {
      const remaining = await pipeline.flush();
      if (remaining) {
        controller.enqueue(remaining);
      }
    }
  });
}