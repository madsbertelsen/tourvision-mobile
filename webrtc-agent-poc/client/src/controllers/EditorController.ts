/**
 * EditorController - Manages ProseMirror editor state and geo-mark operations
 *
 * Consolidates editor-related logic from main.ts:
 * - Editor view management (globalEditorView)
 * - Geo-mark creation (lines 1835-1889)
 * - Geo-mark updates (duplicate code at lines 294-313, 620-643, 793-811)
 * - Observer pattern for change notifications
 */

import type { EditorView } from 'prosemirror-view';
import type { Schema } from 'prosemirror-model';
import type { Location } from '../types';
import { GeocodingService } from '../services/GeocodingService';

export interface EditorControllerCallbacks {
  updateStatus?: (message: string, state: string) => void;
}

export class EditorController {
  private editorView: EditorView | null = null;
  private schema: Schema | null = null;
  private changeListeners: Set<() => void> = new Set();
  private geocodingService: GeocodingService;
  private callbacks: EditorControllerCallbacks;

  constructor(geocodingService: GeocodingService, callbacks: EditorControllerCallbacks = {}) {
    this.geocodingService = geocodingService;
    this.callbacks = callbacks;
  }

  /**
   * Set the editor view instance
   */
  setView(view: EditorView): void {
    this.editorView = view;
    this.schema = view.state.schema;
  }

  /**
   * Get the current editor view
   */
  getView(): EditorView | null {
    return this.editorView;
  }

  /**
   * Add a change listener (observer pattern)
   */
  addChangeListener(listener: () => void): void {
    this.changeListeners.add(listener);
  }

  /**
   * Remove a change listener
   */
  removeChangeListener(listener: () => void): void {
    this.changeListeners.delete(listener);
  }

  /**
   * Notify all change listeners
   */
  private notifyChange(): void {
    this.changeListeners.forEach(listener => listener());
  }

  /**
   * Create a geo-mark on the selected text
   * Extracted from main.ts:1835-1889
   */
  async createGeoMark(): Promise<void> {
    if (!this.editorView || !this.schema) {
      console.error('[EditorController] Editor not initialized');
      return;
    }

    const { state } = this.editorView;
    const { from, to } = state.selection;

    if (from === to) {
      alert('Please select some text to create a geo mark');
      return;
    }

    // Get the selected text
    const selectedText = state.doc.textBetween(from, to);

    // Show loading state
    this.callbacks.updateStatus?.('Geocoding location...', 'connecting');

    // Geocode the selected text
    const geocodeResult = await this.geocodingService.geocode(selectedText);

    if (!geocodeResult) {
      this.callbacks.updateStatus?.('Could not find location', 'disconnected');
      alert(`Could not find coordinates for "${selectedText}". Please try a different location name.`);
      return;
    }

    // Generate a unique ID
    const geoId = `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create the geo mark
    const geoMarkType = this.schema.marks.geoMark;
    const mark = geoMarkType.create({
      geoId,
      displayText: selectedText,
      placeName: geocodeResult.placeName,
      lat: geocodeResult.lat,
      lng: geocodeResult.lng,
      colorIndex: Math.floor(Math.random() * 10),
      coordSource: 'nominatim'
    });

    // Apply the mark to the selection
    const tr = state.tr.addMark(from, to, mark);
    this.editorView.dispatch(tr);

    this.callbacks.updateStatus?.('Geo mark created', 'connected');
    console.log('[EditorController] Created geo mark:', {
      geoId,
      selectedText,
      placeName: geocodeResult.placeName,
      lat: geocodeResult.lat,
      lng: geocodeResult.lng
    });

    // Notify listeners
    this.notifyChange();
  }

  /**
   * Update a geo-mark's attributes
   * Extracted from duplicate code at main.ts:294-313, 620-643, 793-811
   *
   * @param geoId - The geo mark ID to update
   * @param updatedAttrs - Partial attributes to update
   * @returns true if updated successfully, false if not found
   */
  updateGeoMark(geoId: string, updatedAttrs: Partial<Location>): boolean {
    if (!this.editorView || !this.schema) {
      console.error('[EditorController] Editor not initialized');
      return false;
    }

    let updated = false;

    this.editorView.state.doc.descendants((node, pos) => {
      if (updated) return false;

      if (node.isText && node.marks.length > 0) {
        const geoMark = node.marks.find(m => m.type.name === 'geoMark');
        if (geoMark && geoMark.attrs.geoId === geoId) {
          console.log('[EditorController] Updating geo-mark:', geoId, updatedAttrs);

          // Create updated mark with merged attributes
          const updatedMark = this.schema!.marks.geoMark.create({
            ...geoMark.attrs,
            ...updatedAttrs
          });

          // Apply the update
          const tr = this.editorView!.state.tr
            .removeMark(pos, pos + node.nodeSize, this.schema!.marks.geoMark)
            .addMark(pos, pos + node.nodeSize, updatedMark);

          this.editorView!.dispatch(tr);
          console.log('[EditorController] Geo-mark updated successfully');

          // Notify listeners
          this.notifyChange();
          updated = true;
          return false;
        }
      }
    });

    if (!updated) {
      console.warn('[EditorController] Geo-mark not found:', geoId);
    }

    return updated;
  }

  /**
   * Insert a map block at the current cursor position
   * Extracted from main.ts:1892+
   */
  insertMap(): void {
    if (!this.editorView || !this.schema) {
      console.error('[EditorController] Editor not initialized');
      return;
    }

    const { state } = this.editorView;
    const { $from } = state.selection;

    // Create the map node
    const mapNode = this.schema.nodes.map.create();

    // Insert at the current position
    const tr = state.tr.insert($from.pos, mapNode);
    this.editorView.dispatch(tr);

    console.log('[EditorController] Map block inserted');
  }
}
