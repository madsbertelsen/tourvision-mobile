import { createSignal } from 'solid-js';
import type { EditorView } from 'prosemirror-view';
import { COLORS } from '../lib/prosemirror-schema';

// Global counter for color cycling
let geoMarkColorIndex = 0;

// Create editor store
function createEditorStore() {
  const [editorView, setEditorView] = createSignal<EditorView | null>(null);

  // Add a geo-mark at a specific position in the document
  // Inserts text with a geo-mark just before the specified map position
  function addGeoMarkAtMapPosition(
    mapDocPos: number,
    lat: number,
    lng: number,
    placeName: string
  ): boolean {
    const view = editorView();
    if (!view) {
      console.error('[EditorStore] No editor view available');
      return false;
    }

    const { state } = view;
    const { schema } = state;

    // Find insertion position - just before the map node
    // We want to insert at the end of the paragraph/text before the map
    let insertPos = mapDocPos;

    // Find the node just before the map and insert at the end of it
    if (mapDocPos > 0) {
      const $pos = state.doc.resolve(mapDocPos);
      // Go to the end of the previous node if there is one
      if ($pos.nodeBefore) {
        // Insert just before the map (at the end of previous content)
        insertPos = mapDocPos;
      }
    }

    // Create unique ID for this geo mark
    const geoId = `geo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const colorIndex = geoMarkColorIndex++;

    // Create the geo mark
    const markType = schema.marks.geoMark;
    const mark = markType.create({
      geoId,
      displayText: placeName,
      placeName,
      lat: lat.toString(),
      lng: lng.toString(),
      colorIndex: colorIndex % COLORS.length,
      coordSource: 'map-click'
    });

    // Create text node with the mark
    const textNode = schema.text(placeName, [mark]);

    // Insert a newline, the marked text, and another newline before the map
    const paragraph = schema.nodes.paragraph.create(null, [textNode]);

    // Create transaction to insert the paragraph before the map
    const tr = state.tr.insert(insertPos, paragraph);
    view.dispatch(tr);

    console.log('[EditorStore] Added geo-mark at position', insertPos, {
      geoId,
      placeName,
      lat,
      lng,
      colorIndex: colorIndex % COLORS.length
    });

    return true;
  }

  return {
    editorView,
    setEditorView,
    addGeoMarkAtMapPosition
  };
}

// Singleton instance
let editorStore: ReturnType<typeof createEditorStore> | null = null;

export function getEditorStore() {
  if (!editorStore) {
    editorStore = createEditorStore();
  }
  return editorStore;
}
