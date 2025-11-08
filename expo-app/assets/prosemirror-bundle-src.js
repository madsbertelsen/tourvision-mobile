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

// Import Hocuspocus provider for WebSocket collaboration (legacy)
import { HocuspocusProvider } from '@hocuspocus/provider';

// Import y-websocket provider for Cloudflare Workers (legacy)
import { WebsocketProvider } from 'y-websocket';

// Import y-partyserver provider (NEW - production-ready)
import YProvider from 'y-partyserver/provider';

// Import old collaboration plugin (will be deprecated)
// import { CollabConnection, createCollabPlugin, initializeCollaboration } from './prosemirror-collab-plugin';
// Stub for missing collab plugin
const CollabConnection = null;
const createCollabPlugin = null;
const initializeCollaboration = null;

// Create a custom schema with list support, geo-mark, and map
const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, 'paragraph block*', 'block')
    .addToEnd('map', {
      attrs: {
        height: { default: 400 }
      },
      group: 'block',
      atom: true,
      parseDOM: [{
        tag: 'div.prosemirror-map',
        getAttrs(dom) {
          return {
            height: parseInt(dom.getAttribute('data-height') || '400')
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
            coordSource: dom.getAttribute('data-coord-source') || 'manual',
            transportFrom: dom.getAttribute('data-transport-from') || null,
            transportProfile: dom.getAttribute('data-transport-profile') || null,
            waypoints: dom.getAttribute('data-waypoints') ? JSON.parse(dom.getAttribute('data-waypoints')) : null
          };
        }
      }],
      toDOM(mark) {
        // Apply background color based on colorIndex
        // IMPORTANT: This must match the COLORS array in DocumentSplitMap.tsx
        const colors = [
          '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
          '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
        ];
        const colorIndex = mark.attrs.colorIndex || 0;
        const color = colors[colorIndex % colors.length];
        const backgroundColor = color + '33'; // 33 = 20% opacity

        const attrs = {
          class: 'geo-mark',
          'data-geo-id': mark.attrs.geoId,
          'data-place-name': mark.attrs.placeName,
          'data-lat': mark.attrs.lat,
          'data-lng': mark.attrs.lng,
          'data-color-index': mark.attrs.colorIndex,
          'data-coord-source': mark.attrs.coordSource,
          style: `background-color: ${backgroundColor}; padding: 2px 4px; border-radius: 3px; cursor: pointer; transition: all 0.2s ease;`
        };

        // Add transport attributes if they exist
        if (mark.attrs.transportFrom) attrs['data-transport-from'] = mark.attrs.transportFrom;
        if (mark.attrs.transportProfile) attrs['data-transport-profile'] = mark.attrs.transportProfile;
        if (mark.attrs.waypoints) attrs['data-waypoints'] = JSON.stringify(mark.attrs.waypoints);

        return ['span', attrs, 0];
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

// Custom Enter key handler for tool picker
// When text is selected and Enter is pressed, show tool picker instead of inserting newline
function handleEnterWithSelection(view) {
  return (state, dispatch) => {
    const { selection } = state;

    // If there's selected text, show tool picker
    if (!selection.empty) {
      const selectedText = state.doc.textBetween(selection.from, selection.to, ' ');

      // Get selection coordinates for positioning
      const coordsStart = view.coordsAtPos(selection.from);
      const coordsEnd = view.coordsAtPos(selection.to);

      // This will be called from HTML, where sendMessageToNative is available
      console.log('[handleEnterWithSelection] Selection detected, showing tool picker');
      console.log('[handleEnterWithSelection] Selected text:', selectedText);
      console.log('[handleEnterWithSelection] From:', selection.from, 'To:', selection.to);

      // Return selection data for the HTML handler to use
      return {
        showToolPicker: true,
        data: {
          selectedText: selectedText,
          from: selection.from,
          to: selection.to,
          coordsStart: coordsStart,
          coordsEnd: coordsEnd
        }
      };
    }

    // No selection - return false to allow default Enter behavior
    return false;
  };
}

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
  // Hocuspocus provider for WebSocket collaboration (legacy)
  HocuspocusProvider: HocuspocusProvider,
  // y-websocket provider for Cloudflare Workers (legacy)
  WebsocketProvider: WebsocketProvider,
  // y-partyserver provider (NEW - production-ready)
  YProvider: YProvider,
  // Custom Enter key handler for tool picker
  handleEnterWithSelection: handleEnterWithSelection
};

console.log('[ProseMirror Bundle] Loaded successfully with Y.js, Hocuspocus, and PartyKit support');
