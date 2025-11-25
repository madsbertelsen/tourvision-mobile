import { Schema } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

// Color palette for geo-marks (10 colors)
export const COLORS = [
  '#3B82F6',  // Blue
  '#8B5CF6',  // Purple
  '#10B981',  // Green
  '#F59E0B',  // Amber
  '#EF4444',  // Red
  '#EC4899',  // Pink
  '#06B6D4',  // Cyan
  '#84CC16',  // Lime
  '#F97316',  // Orange
  '#6366F1'   // Indigo
];

// Geo-mark attributes type
export interface GeoMarkAttrs {
  geoId: string | null;
  displayText: string;
  placeName: string;
  lat: string;
  lng: string;
  colorIndex: number;
  coordSource: string;
  description: string | null;
  transportFrom: string | null;
  transportProfile: string | null;
  waypoints: Array<{ lng: number; lat: number }> | null;
  visitDocument: string | null;
  photoName: string | null;
}

// Location type for extracted locations
export interface Location {
  geoId: string;
  displayText: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex: number;
  transportFrom?: string | null;
  transportProfile?: string | null;
  waypoints?: Array<{ lng: number; lat: number }> | null;
}

// Create custom schema with geo-marks and maps
export const customSchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block')
    .addToEnd('map', {
      attrs: {
        height: { default: 400 }
      },
      group: 'block',
      atom: true,  // Atomic (non-editable unit)
      parseDOM: [{
        tag: 'div.prosemirror-map',
        getAttrs(dom) {
          if (!(dom instanceof HTMLElement)) return false;
          return {
            height: parseInt(dom.getAttribute('data-height') || '400', 10)
          };
        }
      }],
      toDOM(node) {
        return ['div', {
          class: 'prosemirror-map',
          'data-height': node.attrs.height,
          style: `height: ${node.attrs.height}px; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; margin: 16px 0; position: relative;`
        }, ['div', {
          style: 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #6b7280;'
        }, '🗺️ Map will be rendered here']];
      }
    }),
  marks: schema.spec.marks
    .addToEnd('geoMark', {
      attrs: {
        geoId: { default: null },
        displayText: { default: '' },
        placeName: { default: '' },
        lat: { default: '' },
        lng: { default: '' },
        colorIndex: { default: 0 },
        coordSource: { default: 'manual' },
        description: { default: null },
        transportFrom: { default: null },
        transportProfile: { default: null },
        waypoints: { default: null },
        visitDocument: { default: null },
        photoName: { default: null }
      },
      inclusive: false,  // Prevents mark from extending on Enter
      parseDOM: [{
        tag: 'span.geo-mark',
        getAttrs(dom) {
          if (!(dom instanceof HTMLElement)) return false;

          const waypointsStr = dom.getAttribute('data-waypoints');
          let waypoints = null;
          if (waypointsStr) {
            try {
              waypoints = JSON.parse(waypointsStr);
            } catch (e) {
              console.error('Failed to parse waypoints:', e);
            }
          }

          return {
            geoId: dom.getAttribute('data-geo-id'),
            displayText: dom.textContent || '',
            placeName: dom.getAttribute('data-place-name') || '',
            lat: dom.getAttribute('data-lat') || '',
            lng: dom.getAttribute('data-lng') || '',
            colorIndex: parseInt(dom.getAttribute('data-color-index') || '0', 10),
            coordSource: dom.getAttribute('data-coord-source') || 'manual',
            transportFrom: dom.getAttribute('data-transport-from') || null,
            transportProfile: dom.getAttribute('data-transport-profile') || null,
            waypoints
          };
        }
      }],
      toDOM(mark) {
        const colorIndex = (mark.attrs.colorIndex || 0) as number;
        const color = COLORS[colorIndex % COLORS.length];
        const backgroundColor = color + '33'; // 33 = 20% opacity

        const attrs: Record<string, string> = {
          class: 'geo-mark',
          'data-geo-id': mark.attrs.geoId || '',
          'data-place-name': mark.attrs.placeName || '',
          'data-lat': mark.attrs.lat || '',
          'data-lng': mark.attrs.lng || '',
          'data-color-index': String(mark.attrs.colorIndex || 0),
          'data-coord-source': mark.attrs.coordSource || 'manual',
          style: `background-color: ${backgroundColor}; padding: 2px 4px; border-radius: 3px; cursor: pointer; transition: all 0.2s ease;`
        };

        // Add transport attributes if they exist
        if (mark.attrs.transportFrom) {
          attrs['data-transport-from'] = mark.attrs.transportFrom;
        }
        if (mark.attrs.transportProfile) {
          attrs['data-transport-profile'] = mark.attrs.transportProfile;
        }
        if (mark.attrs.waypoints) {
          attrs['data-waypoints'] = JSON.stringify(mark.attrs.waypoints);
        }

        return ['span', attrs, 0];
      }
    })
    .addToEnd('question', {
      attrs: {
        questionId: { default: null }
      },
      inclusive: false,
      parseDOM: [{
        tag: 'span.question-mark',
        getAttrs(dom) {
          if (!(dom instanceof HTMLElement)) return false;
          return {
            questionId: dom.getAttribute('data-question-id')
          };
        }
      }],
      toDOM(mark) {
        return ['span', {
          class: 'question-mark',
          'data-question-id': mark.attrs.questionId || '',
          style: 'background-color: rgba(251, 191, 36, 0.2); border-bottom: 2px dashed #f59e0b; padding: 2px 4px; border-radius: 3px; cursor: help; transition: all 0.2s ease;'
        }, 0];
      }
    })
    .addToEnd('aiResponse', {
      attrs: {
        questionId: { default: null }
      },
      inclusive: false,
      parseDOM: [{
        tag: 'span.ai-response',
        getAttrs(dom) {
          if (!(dom instanceof HTMLElement)) return false;
          return {
            questionId: dom.getAttribute('data-question-id')
          };
        }
      }],
      toDOM(mark) {
        return ['span', {
          class: 'ai-response',
          'data-question-id': mark.attrs.questionId || ''
        }, 0];
      }
    })
});
