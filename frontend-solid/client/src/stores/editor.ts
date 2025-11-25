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

  // Update a geo-mark's transport settings by geoId
  function updateGeoMarkTransport(
    geoId: string,
    transportFrom: string,
    transportProfile: 'walking' | 'driving' | 'cycling'
  ): boolean {
    const view = editorView();
    if (!view) {
      console.error('[EditorStore] No editor view available');
      return false;
    }

    const { state } = view;
    const { doc, schema, tr } = state;
    let found = false;

    // Find the geo-mark with matching geoId
    doc.descendants((node, pos) => {
      if (found) return false; // Stop if already found

      node.marks.forEach((mark) => {
        if (mark.type.name === 'geoMark' && mark.attrs.geoId === geoId) {
          // Found the geo-mark - update it
          const nodeEnd = pos + node.nodeSize;

          // Create new mark with updated transport attrs
          const newMark = schema.marks.geoMark.create({
            ...mark.attrs,
            transportFrom,
            transportProfile
          });

          // Remove old mark and add new one
          tr.removeMark(pos, nodeEnd, mark.type);
          tr.addMark(pos, nodeEnd, newMark);

          found = true;
          console.log('[EditorStore] Updated geo-mark transport:', {
            geoId,
            transportFrom,
            transportProfile
          });
        }
      });

      return !found;
    });

    if (found) {
      console.log('[EditorStore] Dispatching transport update transaction');
      view.dispatch(tr);
      console.log('[EditorStore] Transport update dispatched successfully');
    } else {
      console.warn('[EditorStore] Geo-mark not found:', geoId);
    }

    return found;
  }

  // Update a geo-mark's waypoints by geoId
  function updateGeoMarkWaypoints(
    geoId: string,
    waypoints: Array<{ lng: number; lat: number }>
  ): boolean {
    const view = editorView();
    if (!view) {
      console.error('[EditorStore] No editor view available');
      return false;
    }

    const { state } = view;
    const { doc, schema, tr } = state;
    let found = false;

    // Find the geo-mark with matching geoId
    doc.descendants((node, pos) => {
      if (found) return false; // Stop if already found

      node.marks.forEach((mark) => {
        if (mark.type.name === 'geoMark' && mark.attrs.geoId === geoId) {
          // Found the geo-mark - update it
          const nodeEnd = pos + node.nodeSize;

          // Create new mark with updated waypoints
          const newMark = schema.marks.geoMark.create({
            ...mark.attrs,
            waypoints
          });

          // Remove old mark and add new one
          tr.removeMark(pos, nodeEnd, mark.type);
          tr.addMark(pos, nodeEnd, newMark);

          found = true;
          console.log('[EditorStore] Updated geo-mark waypoints:', {
            geoId,
            waypointCount: waypoints.length
          });
        }
      });

      return !found;
    });

    if (found) {
      console.log('[EditorStore] Dispatching waypoints update transaction');
      view.dispatch(tr);
      console.log('[EditorStore] Waypoints update dispatched successfully');
    } else {
      console.warn('[EditorStore] Geo-mark not found for waypoints update:', geoId);
    }

    return found;
  }

  return {
    editorView,
    setEditorView,
    addGeoMarkAtMapPosition,
    updateGeoMarkTransport,
    updateGeoMarkWaypoints
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
