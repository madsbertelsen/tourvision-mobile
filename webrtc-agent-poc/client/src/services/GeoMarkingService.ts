/**
 * GeoMarkingService - LLM-powered location extraction and geo-mark creation
 *
 * This service processes document text, uses LLM to extract location names,
 * geocodes them, and creates geo-marks in the ProseMirror document.
 */

import { EditorView } from 'prosemirror-view';
import { Schema } from 'prosemirror-model';
import { GeocodingService } from './GeocodingService';

export interface GeoMarkingCallbacks {
  onLocationExtracted?: (locations: string[]) => void;
  onGeoMarkCreated?: (geoId: string, locationName: string) => void;
  onError?: (error: any) => void;
}

export class GeoMarkingService {
  private editorView: EditorView;
  private schema: Schema;
  private geocodingService: GeocodingService;
  private callbacks: GeoMarkingCallbacks;

  constructor(
    editorView: EditorView,
    schema: Schema,
    geocodingService: GeocodingService,
    callbacks: GeoMarkingCallbacks = {}
  ) {
    this.editorView = editorView;
    this.schema = schema;
    this.geocodingService = geocodingService;
    this.callbacks = callbacks;

    console.log('[GeoMarkingService] Initialized');
  }

  /**
   * Process the document to extract locations and create geo-marks
   */
  async processDocument(): Promise<void> {
    try {
      // 1. Get document text
      const documentText = this.getDocumentText();
      console.log('[GeoMarkingService] Processing document, text length:', documentText.length);

      if (!documentText.trim()) {
        console.log('[GeoMarkingService] No text to process');
        return;
      }

      // 2. Extract location names using LLM
      const locationNames = await this.extractLocationsWithLLM(documentText);
      console.log('[GeoMarkingService] Extracted locations:', locationNames);

      if (this.callbacks.onLocationExtracted) {
        this.callbacks.onLocationExtracted(locationNames);
      }

      if (locationNames.length === 0) {
        console.log('[GeoMarkingService] No locations found');
        return;
      }

      // 3. For each location, geocode and create geo-mark
      for (const locationName of locationNames) {
        try {
          await this.createGeoMarkForLocation(locationName);
        } catch (error) {
          console.error(`[GeoMarkingService] Failed to create geo-mark for "${locationName}":`, error);
          if (this.callbacks.onError) {
            this.callbacks.onError(error);
          }
        }
      }

      console.log('[GeoMarkingService] Document processing complete');
    } catch (error) {
      console.error('[GeoMarkingService] Error processing document:', error);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }

  /**
   * Get all text content from the document
   */
  private getDocumentText(): string {
    const { state } = this.editorView;
    return state.doc.textContent;
  }

  /**
   * Extract location names from text using LLM
   *
   * TODO: Replace this placeholder with actual LLM API call
   * For now, uses simple regex to find capitalized place names
   */
  private async extractLocationsWithLLM(text: string): Promise<string[]> {
    console.log('[GeoMarkingService] Calling LLM to extract locations...');

    // PLACEHOLDER: Simple regex-based extraction
    // This should be replaced with actual LLM API call (OpenAI, Anthropic, etc.)
    const locations: string[] = [];

    // Match capitalized words/phrases that might be locations
    // Pattern: Capitalized word optionally followed by more capitalized words
    const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const matches = text.matchAll(locationPattern);

    for (const match of matches) {
      const candidate = match[1];

      // Filter out common non-location words (pronouns, articles, common verbs)
      const blacklist = [
        // Articles and pronouns
        'The', 'A', 'An', 'This', 'That', 'These', 'Those', 'I', 'We', 'You', 'He', 'She', 'It', 'They',
        // Common verbs that might start a sentence
        'Drive', 'Walk', 'Go', 'Visit', 'See', 'Take', 'Get', 'Make', 'Have', 'Do', 'Be', 'Start', 'Stop',
        'Travel', 'Fly', 'Stay', 'Arrive', 'Leave', 'Return', 'Explore', 'Discover', 'Find', 'Meet',
        // Days and common words
        'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
        'Today', 'Tomorrow', 'Yesterday', 'Morning', 'Afternoon', 'Evening', 'Night'
      ];
      if (!blacklist.includes(candidate) && candidate.length > 2) {
        // Avoid duplicates
        if (!locations.includes(candidate)) {
          locations.push(candidate);
        }
      }
    }

    // Limit to first 5 locations to avoid overwhelming the geocoder
    const limitedLocations = locations.slice(0, 5);

    console.log(`[GeoMarkingService] LLM extraction complete: ${limitedLocations.length} locations found`);
    return limitedLocations;
  }

  /**
   * Create a geo-mark for a specific location name
   */
  private async createGeoMarkForLocation(locationName: string): Promise<void> {
    console.log(`[GeoMarkingService] Creating geo-mark for: "${locationName}"`);

    // 1. Geocode the location
    const geocodeResult = await this.geocodingService.geocode(locationName);

    if (!geocodeResult) {
      console.warn(`[GeoMarkingService] Could not geocode: "${locationName}"`);
      return;
    }

    console.log(`[GeoMarkingService] Geocoded "${locationName}":`, geocodeResult);

    // 2. Find the location name in the document
    const position = this.findTextPosition(locationName);
    if (position === null) {
      console.warn(`[GeoMarkingService] Could not find "${locationName}" in document`);
      return;
    }

    const { from, to } = position;

    // 3. Generate unique geoId
    const geoId = `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 4. Create the geo-mark
    const geoMarkType = this.schema.marks.geoMark;
    if (!geoMarkType) {
      throw new Error('geoMark mark type not found in schema');
    }

    const mark = geoMarkType.create({
      geoId,
      displayText: locationName,
      placeName: geocodeResult.placeName || locationName,
      lat: geocodeResult.lat,
      lng: geocodeResult.lng,
      colorIndex: Math.floor(Math.random() * 10),
      coordSource: 'nominatim'
    });

    // 5. Apply the mark to the text
    const { state } = this.editorView;
    const tr = state.tr.addMark(from, to, mark);
    this.editorView.dispatch(tr);

    console.log(`[GeoMarkingService] Created geo-mark:`, {
      geoId,
      locationName,
      placeName: geocodeResult.placeName,
      lat: geocodeResult.lat,
      lng: geocodeResult.lng
    });

    // 6. Trigger callback
    if (this.callbacks.onGeoMarkCreated) {
      this.callbacks.onGeoMarkCreated(geoId, locationName);
    }

    // 7. Auto-insert block map if document doesn't have one
    this.insertBlockMapIfNeeded();
  }

  /**
   * Insert a map node at the end of the document if one doesn't exist
   */
  private insertBlockMapIfNeeded(): void {
    const { state } = this.editorView;
    const { doc } = state;

    // Check if map already exists in document
    let hasMap = false;
    doc.descendants((node) => {
      if (node.type.name === 'map') {
        hasMap = true;
        return false; // Stop iteration
      }
      return true;
    });

    if (hasMap) {
      console.log('[GeoMarkingService] Map already exists, skipping insertion');
      return;
    }

    // Insert map at end of document
    const mapType = this.schema.nodes.map;
    if (!mapType) {
      console.warn('[GeoMarkingService] map node type not found in schema');
      return;
    }

    const mapNode = mapType.create({ height: 400 });
    const tr = state.tr.insert(doc.content.size, mapNode);
    this.editorView.dispatch(tr);
    console.log('[GeoMarkingService] Auto-inserted map at end of document');
  }

  /**
   * Find the position of text in the document by traversing ProseMirror nodes
   * Returns the first occurrence with correct document positions
   */
  private findTextPosition(searchText: string): { from: number; to: number } | null {
    const { state } = this.editorView;
    const doc = state.doc;
    let result: { from: number; to: number } | null = null;

    // Traverse all text nodes in the document
    doc.descendants((node, pos) => {
      // Skip if already found
      if (result) return false;

      // Only process text nodes
      if (node.isText && node.text) {
        const text = node.text;
        const index = text.indexOf(searchText);

        if (index !== -1) {
          // Found! Calculate ProseMirror positions
          // pos is the position before the node, add index for text position within node
          result = {
            from: pos + index,
            to: pos + index + searchText.length
          };
          return false; // Stop traversal
        }
      }

      return true; // Continue traversal
    });

    if (result) {
      console.log(`[GeoMarkingService] Found "${searchText}" at ProseMirror positions:`, result);
    }

    return result;
  }
}
