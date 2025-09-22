'use dom';

import React, { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ProseMirror } from '@nytimes/react-prosemirror';
import { EditorState, Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { Schema, Node, DOMSerializer, DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { baseKeymap } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { history } from 'prosemirror-history';
import { JSONContent } from '@tiptap/react'; // For type compatibility during migration
import './prosemirror-editor-styles.css';

// Plugin key for diff visualization
const diffPluginKey = new PluginKey('diff');

// Create diff visualization plugin
const createDiffPlugin = () => {
  return new Plugin({
    key: diffPluginKey,
    state: {
      init() {
        return {
          decorations: DecorationSet.empty,
          originalDoc: null,
          isPreview: false,
        };
      },
      apply(tr, pluginState) {
        const meta = tr.getMeta(diffPluginKey);

        if (meta?.setDeview) {
          // Create decorations for the added content
          const decorations = meta.decorations || DecorationSet.empty;
          return {
            decorations,
            originalDoc: meta.originalDoc,
            isPreview: true,
          };
        }

        if (meta?.clearPreview) {
          return {
            decorations: DecorationSet.empty,
            originalDoc: null,
            isPreview: false,
          };
        }

        // Map decorations through the transaction
        return {
          ...pluginState,
          decorations: pluginState.decorations.map(tr.mapping, tr.doc),
        };
      },
    },
    props: {
      decorations(state) {
        const pluginState = this.getState(state);
        return pluginState?.decorations || DecorationSet.empty;
      },
    },
  });
};

interface ProseMirrorEditorProps {
  content?: JSONContent | string;
  onChange?: (content: JSONContent) => void;
  editable?: boolean;
  placeholder?: string;
}

const ProseMirrorEditorDOM = forwardRef<any, ProseMirrorEditorProps>((
  {
    content = '',
    onChange,
    editable = true,
    placeholder = 'Start planning your itinerary...'
  },
  ref
) => {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  // Convert JSONContent to ProseMirror Node
  const initialDoc = useMemo(() => {
    if (!content || content === '') {
      return basicSchema.node('doc', null, [
        basicSchema.node('paragraph', null, [])
      ]);
    }

    if (typeof content === 'string') {
      // Parse HTML string
      const parser = ProseMirrorDOMParser.fromSchema(basicSchema);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      return parser.parse(tempDiv);
    }

    // Convert JSONContent to ProseMirror Node
    const convertContent = (jsonContent: any): any => {
      if (!jsonContent) return null;

      // Handle text nodes
      if (jsonContent.type === 'text') {
        return basicSchema.text(jsonContent.text || '');
      }

      // Map node types
      let nodeType = jsonContent.type;

      // Map TipTap node types to ProseMirror schema types
      const typeMap: Record<string, string> = {
        'doc': 'doc',
        'paragraph': 'paragraph',
        'heading': 'heading',
        'bulletList': 'bullet_list',
        'orderedList': 'ordered_list',
        'listItem': 'list_item',
        'blockquote': 'blockquote',
        'codeBlock': 'code_block',
        'hardBreak': 'hard_break',
        'horizontalRule': 'horizontal_rule',
      };

      nodeType = typeMap[nodeType] || nodeType;

      // Skip custom nodes for now (will be added later)
      if (!basicSchema.nodes[nodeType]) {
        // Fallback to paragraph for unknown nodes
        return basicSchema.node('paragraph', null, [
          basicSchema.text(JSON.stringify(jsonContent))
        ]);
      }

      // Process children
      const children = jsonContent.content?.map(convertContent).filter(Boolean) || [];

      // Create the node with attributes
      const attrs = jsonContent.attrs || null;
      return basicSchema.node(nodeType, attrs, children);
    };

    const doc = convertContent(content as any);
    return doc || basicSchema.node('doc', null, [basicSchema.node('paragraph', null, [])]);
  }, [content]);

  // Create editor state
  const editorState = useMemo(() => {
    return EditorState.create({
      doc: initialDoc,
      schema: basicSchema,
      plugins: [
        createDiffPlugin(),
        history(),
        keymap(baseKeymap),
      ]
    });
  }, [initialDoc]);

  const [state, setState] = useState(editorState);

  // Handle state changes
  const dispatchTransaction = (tr: Transaction) => {
    const newState = state.apply(tr);
    setState(newState);

    // Convert ProseMirror doc to JSONContent for onChange callback
    if (onChange && tr.docChanged) {
      const convertToJSON = (node: Node): any => {
        if (node.isText) {
          return {
            type: 'text',
            text: node.text
          };
        }

        // Map ProseMirror types back to TipTap types
        const reverseTypeMap: Record<string, string> = {
          'doc': 'doc',
          'paragraph': 'paragraph',
          'heading': 'heading',
          'bullet_list': 'bulletList',
          'ordered_list': 'orderedList',
          'list_item': 'listItem',
          'blockquote': 'blockquote',
          'code_block': 'codeBlock',
          'hard_break': 'hardBreak',
          'horizontal_rule': 'horizontalRule',
        };

        const type = reverseTypeMap[node.type.name] || node.type.name;
        const result: any = { type };

        if (node.attrs && Object.keys(node.attrs).length > 0) {
          result.attrs = node.attrs;
        }

        if (node.content.size > 0) {
          result.content = [];
          node.content.forEach((child) => {
            result.content.push(convertToJSON(child));
          });
        }

        return result;
      };

      const jsonContent = convertToJSON(newState.doc);
      onChange(jsonContent);
    }
  };

  // Update state when content prop changes
  useEffect(() => {
    // Only update if content is different
    const currentJSON = JSON.stringify(state.doc.toJSON());
    const newJSON = JSON.stringify(content);

    if (currentJSON !== newJSON && content) {
      const newDoc = (() => {
        if (typeof content === 'string') {
          const parser = ProseMirrorDOMParser.fromSchema(basicSchema);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = content;
          return parser.parse(tempDiv);
        }
        // Convert JSONContent to doc
        // ... (same conversion logic as in initialDoc)
        return initialDoc;
      })();

      const newState = EditorState.create({
        doc: newDoc,
        schema: basicSchema,
        plugins: state.plugins,
      });
      setState(newState);
    }
  }, [content]);

  // Listen for diff decoration messages from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('ProseMirrorEditorDOM - Received message:', event.data?.type);

      if (event.data?.type === 'show-proposed-content') {
        const { proposedContent } = event.data;
        if (proposedContent) {
          // Convert and set the proposed content
          // For now, just set it directly without decorations
          const newDoc = (() => {
            // Convert JSONContent to ProseMirror doc
            const convertContent = (jsonContent: any): any => {
              if (!jsonContent) return null;
              if (jsonContent.type === 'text') {
                return basicSchema.text(jsonContent.text || '');
              }
              const typeMap: Record<string, string> = {
                'doc': 'doc',
                'paragraph': 'paragraph',
                'heading': 'heading',
                'bulletList': 'bullet_list',
                'orderedList': 'ordered_list',
                'listItem': 'list_item',
              };
              const nodeType = typeMap[jsonContent.type] || 'paragraph';
              if (!basicSchema.nodes[nodeType]) {
                return basicSchema.node('paragraph', null, [
                  basicSchema.text(JSON.stringify(jsonContent))
                ]);
              }
              const children = jsonContent.content?.map(convertContent).filter(Boolean) || [];
              const attrs = jsonContent.attrs || null;
              return basicSchema.node(nodeType, attrs, children);
            };
            return convertContent(proposedContent);
          })();

          if (newDoc) {
            const newState = EditorState.create({
              doc: newDoc,
              schema: basicSchema,
              plugins: state.plugins,
            });
            setState(newState);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [state.plugins]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    setDiffDecorations: (decorations: any[]) => {
      console.log('ProseMirrorEditorDOM - setDiffDecorations called');
      // Will implement when we add the diff visualization
    },
    clearDiffDecorations: () => {
      console.log('ProseMirrorEditorDOM - clearDiffDecorations called');
      // Will implement when we add the diff visualization
    },
    getContent: () => {
      // Return current content as JSON
      const convertToJSON = (node: Node): any => {
        if (node.isText) {
          return {
            type: 'text',
            text: node.text
          };
        }
        const reverseTypeMap: Record<string, string> = {
          'doc': 'doc',
          'paragraph': 'paragraph',
          'heading': 'heading',
          'bullet_list': 'bulletList',
          'ordered_list': 'orderedList',
          'list_item': 'listItem',
        };
        const type = reverseTypeMap[node.type.name] || node.type.name;
        const result: any = { type };
        if (node.attrs && Object.keys(node.attrs).length > 0) {
          result.attrs = node.attrs;
        }
        if (node.content.size > 0) {
          result.content = [];
          node.content.forEach((child) => {
            result.content.push(convertToJSON(child));
          });
        }
        return result;
      };
      return convertToJSON(state.doc);
    }
  }));

  return (
    <div className="prosemirror-editor-container">
      <ProseMirror
        mount={mount}
        state={state}
        dispatchTransaction={dispatchTransaction}
      >
        <div
          ref={setMount}
          className="prosemirror-editor"
          data-placeholder={placeholder}
        />
      </ProseMirror>
    </div>
  );
});

export default ProseMirrorEditorDOM;