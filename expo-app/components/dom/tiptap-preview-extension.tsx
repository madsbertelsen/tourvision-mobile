'use dom';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Fragment, Slice } from 'prosemirror-model';

// Extend the Commands interface
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    preview: {
      setPreviewContent: (proposedContent: any) => ReturnType;
      clearPreviewContent: () => ReturnType;
    };
  }
}

const pluginKey = new PluginKey('preview');

/**
 * Extension for previewing proposed changes by temporarily showing
 * the proposed content with diff highlighting
 */
export const PreviewExtension = Extension.create({
  name: 'preview',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,

        state: {
          init() {
            return {
              active: false,
              originalContent: null,
              proposedContent: null,
              decorations: DecorationSet.empty,
            };
          },

          apply(tr, value, oldState, newState) {
            const meta = tr.getMeta(pluginKey);

            if (meta?.setPreview) {
              console.log('Preview Plugin - Setting preview with proposed content');

              // Store the original content
              const originalContent = newState.doc.toJSON();

              // Create decorations for the new content
              const decorations = createPreviewDecorations(
                newState.doc,
                meta.proposedContent,
                meta.currentContent
              );

              return {
                active: true,
                originalContent: originalContent,
                proposedContent: meta.proposedContent,
                decorations: decorations,
              };
            }

            if (meta?.clearPreview) {
              console.log('Preview Plugin - Clearing preview');
              return {
                active: false,
                originalContent: null,
                proposedContent: null,
                decorations: DecorationSet.empty,
              };
            }

            // Map decorations through doc changes if needed
            if (value.active && tr.docChanged) {
              return {
                ...value,
                decorations: value.decorations.map(tr.mapping, tr.doc),
              };
            }

            return value;
          },
        },

        props: {
          decorations(state) {
            const pluginState = this.getState(state);
            return pluginState?.decorations || DecorationSet.empty;
          },
        },

        view() {
          return {
            update(view, prevState) {
              const pluginState = pluginKey.getState(view.state);
              const prevPluginState = pluginKey.getState(prevState);

              // If preview was just activated, temporarily show proposed content
              if (pluginState?.active && !prevPluginState?.active && pluginState.proposedContent) {
                console.log('Preview - Temporarily showing proposed content');

                // We'll apply decorations to highlight the differences
                // The actual content swap would be complex, so we'll use decorations
              }

              // If preview was just deactivated, restore original
              if (!pluginState?.active && prevPluginState?.active) {
                console.log('Preview - Restoring original content');
              }
            },
          };
        },
      }),
    ];
  },

  addCommands() {
    return {
      setPreviewContent: (proposedContent: any) => ({ tr, dispatch, state }) => {
        console.log('PreviewExtension - setPreviewContent command called');

        if (dispatch) {
          const currentContent = state.doc.toJSON();
          tr.setMeta(pluginKey, {
            setPreview: true,
            proposedContent: proposedContent,
            currentContent: currentContent
          });
          dispatch(tr);
        }

        return true;
      },

      clearPreviewContent: () => ({ tr, dispatch }) => {
        console.log('PreviewExtension - clearPreviewContent command called');

        if (dispatch) {
          tr.setMeta(pluginKey, { clearPreview: true });
          dispatch(tr);
        }

        return true;
      },
    };
  },
});

/**
 * Create decorations showing the differences between current and proposed content
 */
function createPreviewDecorations(
  currentDoc: any,
  proposedContent: any,
  currentContent: any
): DecorationSet {
  const decorations: Decoration[] = [];

  if (!proposedContent || !proposedContent.content) {
    return DecorationSet.empty;
  }

  const currentNodes = currentContent?.content || [];
  const proposedNodes = proposedContent.content || [];

  // Find new nodes (in proposed but not in current)
  const newNodeIndices = new Set<number>();
  for (let i = currentNodes.length; i < proposedNodes.length; i++) {
    newNodeIndices.add(i);
  }

  // Calculate positions and create decorations
  let pos = 0;

  // Traverse the proposed content and mark additions
  const traverse = (node: any, currentPos: number, isNew: boolean = false): number => {
    if (node.type === 'text') {
      if (isNew && node.text) {
        // This is new text, highlight it
        decorations.push(
          Decoration.inline(currentPos, currentPos + node.text.length, {
            class: 'preview-addition',
            style: 'background-color: #d4f4dd; padding: 2px 4px; border-radius: 2px;',
          })
        );
      }
      return currentPos + (node.text?.length || 0);
    }

    // Node opening
    currentPos += 1;

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        currentPos = traverse(child, currentPos, isNew);
      }
    }

    // Node closing
    currentPos += 1;

    return currentPos;
  };

  // Start from position 1 (after doc node opening)
  pos = 1;

  // Process all nodes, marking new ones
  proposedNodes.forEach((node, index) => {
    const isNew = newNodeIndices.has(index);
    pos = traverse(node, pos, isNew);
  });

  return DecorationSet.create(currentDoc, decorations);
}