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

// Create a custom schema with list support
const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block'),
  marks: schema.spec.marks
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
