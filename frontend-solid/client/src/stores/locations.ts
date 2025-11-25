import { createStore } from 'solid-js/store';
import type { EditorView } from 'prosemirror-view';
import type { Location } from '../lib/prosemirror-schema';

export interface LocationsState {
  locations: Location[];
}

export function createLocationsStore() {
  const [state, setState] = createStore<LocationsState>({
    locations: []
  });

  // Extract locations from ProseMirror document
  function extractLocations(editorView: EditorView | null): Location[] {
    if (!editorView) return [];

    const locations: Location[] = [];
    const doc = editorView.state.doc;

    doc.descendants((node) => {
      if (node.isText && node.marks.length > 0) {
        for (const mark of node.marks) {
          if (mark.type.name === 'geoMark' && mark.attrs.lat && mark.attrs.lng) {
            locations.push({
              geoId: mark.attrs.geoId,
              displayText: mark.attrs.displayText || node.text || '',
              placeName: mark.attrs.placeName || '',
              lat: parseFloat(mark.attrs.lat),
              lng: parseFloat(mark.attrs.lng),
              colorIndex: mark.attrs.colorIndex || 0,
              transportFrom: mark.attrs.transportFrom,
              transportProfile: mark.attrs.transportProfile,
              waypoints: mark.attrs.waypoints
            });
          }
        }
      }
    });

    console.log('[Locations] Extracted', locations.length, 'locations');
    return locations;
  }

  // Update locations from editor
  function updateLocations(editorView: EditorView | null) {
    const extracted = extractLocations(editorView);
    setState({ locations: extracted });
  }

  // Get location by geoId
  function getLocationById(geoId: string): Location | undefined {
    return state.locations.find((loc) => loc.geoId === geoId);
  }

  return {
    state,
    updateLocations,
    getLocationById
  };
}

// Singleton instance
let locationsStore: ReturnType<typeof createLocationsStore> | null = null;

export function getLocationsStore() {
  if (!locationsStore) {
    locationsStore = createLocationsStore();
  }
  return locationsStore;
}
