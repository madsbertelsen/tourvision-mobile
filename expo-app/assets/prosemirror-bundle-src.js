// Entry file for bundling ProseMirror with esbuild
// This will be bundled into a single UMD module for WebView

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser, DOMSerializer } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';

// Create a custom schema with list support and geo-mark
const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block'),
  marks: schema.spec.marks.addToEnd('geoMark', {
    attrs: {
      geoId: { default: null },
      placeName: { default: '' },
      lat: { default: '' },
      lng: { default: '' },
      colorIndex: { default: 0 },
      coordSource: { default: 'manual' }
    },
    inclusive: false,
    parseDOM: [{
      tag: 'span.geo-mark',
      getAttrs(dom) {
        return {
          geoId: dom.getAttribute('data-geo-id'),
          placeName: dom.getAttribute('data-place-name'),
          lat: dom.getAttribute('data-lat'),
          lng: dom.getAttribute('data-lng'),
          colorIndex: parseInt(dom.getAttribute('data-color-index') || '0'),
          coordSource: dom.getAttribute('data-coord-source') || 'manual'
        };
      }
    }],
    toDOM(mark) {
      return ['span', {
        class: 'geo-mark',
        'data-geo-id': mark.attrs.geoId,
        'data-place-name': mark.attrs.placeName,
        'data-lat': mark.attrs.lat,
        'data-lng': mark.attrs.lng,
        'data-color-index': mark.attrs.colorIndex,
        'data-coord-source': mark.attrs.coordSource,
        style: 'background-color: rgba(59, 130, 246, 0.2); padding: 2px 4px; border-radius: 3px; cursor: pointer;'
      }, 0];
    }
  })
});

// Export everything to window.PM for the HTML to use
window.PM = {
  state: { EditorState },
  view: { EditorView },
  model: { Schema, DOMParser, DOMSerializer },
  schema: mySchema,
  keymap: keymap,
  history: { history, undo, redo },
  commands: { baseKeymap }
};

console.log('[ProseMirror Bundle] Loaded successfully');
