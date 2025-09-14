import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProsemirrorNode } from '@tiptap/pm/model';
import { getMarkerColor, getLighterShade } from '@/artifacts/itinerary/marker-colors';
import { getLocationColorIndex, type LocationColorMap } from '@/artifacts/itinerary/location-color-assignment';

export const locationDecorationsKey = new PluginKey('locationDecorations');

interface LocationData {
  name: string;
  index: number;
  start: number;
  end: number;
}

/**
 * Find all Google Maps links in the document and assign colors consistently
 */
function findLocationLinks(doc: ProsemirrorNode, colorMap: LocationColorMap | null): LocationData[] {
  const locations: LocationData[] = [];
  const locationIndices = new Map<string, number>();
  let nextIndex = 0;

  doc.descendants((node, pos) => {
    if (node.isText && node.marks.some(mark => mark.type.name === 'link')) {
      const linkMark = node.marks.find(mark => mark.type.name === 'link');
      if (linkMark?.attrs.href?.includes('google.com/maps')) {
        const text = node.text || '';
        
        // Assign consistent color index to each unique location
        let index: number;
        if (locationIndices.has(text)) {
          index = locationIndices.get(text)!;
        } else {
          // If we have a color map, use it; otherwise assign sequentially
          if (colorMap) {
            index = getLocationColorIndex(text, colorMap);
          } else {
            index = nextIndex++;
          }
          locationIndices.set(text, index);
        }
        
        locations.push({
          name: text,
          index,
          start: pos,
          end: pos + node.nodeSize,
        });
      }
    }
    return true;
  });

  return locations;
}

/**
 * Create decorations for location links
 */
function createLocationDecorations(doc: ProsemirrorNode, colorMap: LocationColorMap | null = null): DecorationSet {
  const locations = findLocationLinks(doc, colorMap);
  const decorations: Decoration[] = [];

  locations.forEach(loc => {
    const color = getMarkerColor(loc.index);
    const lighterColor = getLighterShade(color, 0.15);
    
    // Create inline decoration with colored background
    decorations.push(
      Decoration.inline(
        loc.start,
        loc.end,
        {
          class: 'location-highlight',
          style: `
            background-color: ${lighterColor} !important;
            color: ${color} !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            text-decoration: none !important;
            font-weight: 600 !important;
            display: inline-block !important;
            border: 1px solid ${color}20 !important;
            transition: all 0.2s !important;
          `.replace(/\s+/g, ' ').trim(),
        },
        {
          locationIndex: loc.index,
          locationName: loc.name,
        }
      )
    );
  });

  return DecorationSet.create(doc, decorations);
}

// TipTap Location Decorations Extension
export const LocationDecorationsExtension = Extension.create({
  name: 'locationDecorations',

  addOptions() {
    return {
      colorMap: null as LocationColorMap | null,
    };
  },

  addProseMirrorPlugins() {
    let currentColorMap = this.options.colorMap;

    return [
      new Plugin({
        key: locationDecorationsKey,
        state: {
          init(_, { doc }) {
            return createLocationDecorations(doc, currentColorMap);
          },
          apply(tr, decorations) {
            // Check if color map was updated via metadata
            const newColorMap = tr.getMeta('locationColorMap');
            if (newColorMap !== undefined) {
              currentColorMap = newColorMap;
              return createLocationDecorations(tr.doc, newColorMap);
            }
            
            // If document changed, recreate decorations with current color map
            if (tr.docChanged) {
              return createLocationDecorations(tr.doc, currentColorMap);
            }
            
            // Otherwise, just map existing decorations
            return decorations.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },

  // Add command to update color map
  addCommands() {
    return {
      updateLocationColorMap: (colorMap: LocationColorMap) => ({ tr, dispatch }) => {
        if (dispatch) {
          tr.setMeta('locationColorMap', colorMap);
        }
        return true;
      },
    };
  },
});