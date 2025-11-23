/**
 * LocationExtractor - Extracts geo-marks from ProseMirror document
 *
 * Consolidates duplicate extraction logic from main.ts:
 * - Lines 366-392 (extractLocationsForFullscreen)
 * - Lines 1223-1247 (block map extraction)
 */

import type { EditorView } from 'prosemirror-view';
import type { Location } from '../types';

export class LocationExtractor {
  /** Geo mark colors (matching frontend-prosemirror) */
  static readonly COLORS = [
    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  /**
   * Extract all geo-marked locations from the document
   *
   * @param editorView - ProseMirror editor view
   * @returns Array of locations
   */
  static extractAll(editorView: EditorView | null): Location[] {
    if (!editorView) {
      console.warn('[LocationExtractor] No editor view provided');
      return [];
    }

    const locations: Location[] = [];
    const seenGeoIds = new Set<string>(); // Prevent duplicates

    editorView.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.length > 0) {
        for (const mark of node.marks) {
          if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
            const geoId = mark.attrs.geoId;

            // Skip if already seen (same geo-mark can span multiple text nodes)
            if (seenGeoIds.has(geoId)) {
              continue;
            }
            seenGeoIds.add(geoId);

            const colorIndex = mark.attrs.colorIndex ?? 0;
            locations.push({
              geoId,
              displayText: mark.attrs.displayText || node.text,
              placeName: mark.attrs.placeName,
              lat: parseFloat(mark.attrs.lat),
              lng: parseFloat(mark.attrs.lng),
              colorIndex,
              color: LocationExtractor.COLORS[colorIndex % LocationExtractor.COLORS.length],
              transportFrom: mark.attrs.transportFrom,
              transportProfile: mark.attrs.transportProfile,
              waypoints: mark.attrs.waypoints || [],
            });
          }
        }
      }
    });

    console.log(`[LocationExtractor] Extracted ${locations.length} locations`);
    return locations;
  }

  /**
   * Find a specific location by geoId
   *
   * @param editorView - ProseMirror editor view
   * @param geoId - The geo ID to find
   * @returns Location or null if not found
   */
  static findByGeoId(editorView: EditorView | null, geoId: string): Location | null {
    const locations = LocationExtractor.extractAll(editorView);
    return locations.find(loc => loc.geoId === geoId) || null;
  }

  /**
   * Get color for a color index
   *
   * @param colorIndex - The color index
   * @returns Hex color string
   */
  static getColor(colorIndex: number): string {
    return LocationExtractor.COLORS[colorIndex % LocationExtractor.COLORS.length];
  }

  /**
   * Count total geo-marks in document
   *
   * @param editorView - ProseMirror editor view
   * @returns Number of geo-marks
   */
  static count(editorView: EditorView | null): number {
    return LocationExtractor.extractAll(editorView).length;
  }
}
