// Entry file for bundling ProseMirror with esbuild
// This will be bundled into a single UMD module for WebView

import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser, DOMSerializer } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { keymap } from 'prosemirror-keymap';
import { history, undo, redo } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { Step } from 'prosemirror-transform';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Plugin, PluginKey } from 'prosemirror-state';

// Import Y.js for CRDT-based collaboration
import * as Y from 'yjs';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as awarenessProtocol from 'y-protocols/awareness';

// Import Hocuspocus provider for WebSocket collaboration
import { HocuspocusProvider } from '@hocuspocus/provider';

// Import old collaboration plugin (will be deprecated)
import { CollabConnection, createCollabPlugin, initializeCollaboration } from './prosemirror-collab-plugin';

// Create a custom schema with list support and geo-mark
const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block'),
  marks: schema.spec.marks
    .addToEnd('geoMark', {
      attrs: {
        geoId: { default: null },
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
      inclusive: false,  // KEY: Prevents mark from extending on Enter
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
        // Apply background color based on colorIndex
        const colors = [
          '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
          '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
        ];
        const colorIndex = mark.attrs.colorIndex || 0;
        const color = colors[colorIndex % colors.length];
        const backgroundColor = color + '33'; // 33 = 20% opacity

        return ['span', {
          class: 'geo-mark',
          'data-geo-id': mark.attrs.geoId,
          'data-place-name': mark.attrs.placeName,
          'data-lat': mark.attrs.lat,
          'data-lng': mark.attrs.lng,
          'data-color-index': mark.attrs.colorIndex,
          'data-coord-source': mark.attrs.coordSource,
          style: `background-color: ${backgroundColor}; padding: 2px 4px; border-radius: 3px; cursor: pointer; transition: all 0.2s ease;`
        }, 0];
      }
    })
    .addToEnd('comment', {
      attrs: {
        commentId: { default: null },
        userId: { default: null },
        userName: { default: '' },
        content: { default: '' },
        createdAt: { default: null },
        resolved: { default: false },
        replies: { default: null },
        aiReply: { default: null }
      },
      inclusive: false,
      parseDOM: [{
        tag: 'span.comment-mark',
        getAttrs(dom) {
          const repliesStr = dom.getAttribute('data-replies');
          let replies = null;
          if (repliesStr) {
            try {
              replies = JSON.parse(repliesStr);
            } catch (e) {
              console.error('Failed to parse replies:', e);
            }
          }

          return {
            commentId: dom.getAttribute('data-comment-id'),
            userId: dom.getAttribute('data-user-id'),
            userName: dom.getAttribute('data-user-name') || '',
            content: dom.getAttribute('data-content') || '',
            createdAt: dom.getAttribute('data-created-at'),
            resolved: dom.getAttribute('data-resolved') === 'true',
            replies
          };
        }
      }],
      toDOM(mark) {
        const attrs = {
          class: 'comment-mark',
          'data-comment': 'true',
          style: 'background-color: rgba(251, 191, 36, 0.3); border-bottom: 2px solid rgba(251, 191, 36, 0.6); cursor: pointer; padding: 1px 0;'
        };

        if (mark.attrs.commentId) attrs['data-comment-id'] = mark.attrs.commentId;
        if (mark.attrs.userId) attrs['data-user-id'] = mark.attrs.userId;
        if (mark.attrs.userName) attrs['data-user-name'] = mark.attrs.userName;
        if (mark.attrs.content) attrs['data-content'] = mark.attrs.content;
        if (mark.attrs.createdAt) attrs['data-created-at'] = mark.attrs.createdAt;
        if (mark.attrs.resolved !== undefined) attrs['data-resolved'] = mark.attrs.resolved.toString();
        if (mark.attrs.replies) attrs['data-replies'] = JSON.stringify(mark.attrs.replies);

        // Change appearance if resolved
        if (mark.attrs.resolved) {
          attrs.style = 'background-color: rgba(156, 163, 175, 0.2); border-bottom: 2px solid rgba(156, 163, 175, 0.4); cursor: pointer; padding: 1px 0; text-decoration: line-through;';
        }

        return ['span', attrs, 0];
      }
    })
});

// Export everything to window.PM for the HTML to use
window.PM = {
  state: { EditorState, TextSelection, Plugin, PluginKey },
  view: { EditorView, Decoration, DecorationSet },
  model: { Schema, DOMParser, DOMSerializer },
  transform: { Step },
  schema: mySchema,
  keymap: keymap,
  history: { history, undo, redo },
  commands: { baseKeymap },
  collab: { CollabConnection, createCollabPlugin, initializeCollaboration },
  // Y.js exports for CRDT collaboration
  Y: Y,
  yProsemirror: { ySyncPlugin, yCursorPlugin, yUndoPlugin, prosemirrorToYXmlFragment },
  Awareness: awarenessProtocol.Awareness,
  awarenessProtocol: awarenessProtocol,
  // Hocuspocus provider for WebSocket collaboration
  HocuspocusProvider: HocuspocusProvider
};

console.log('[ProseMirror Bundle] Loaded successfully with Y.js and Hocuspocus support');
