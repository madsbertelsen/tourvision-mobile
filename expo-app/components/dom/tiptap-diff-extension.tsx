'use dom';

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

// Extend the Commands interface to include our custom commands
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diffVisualization: {
      setDiffDecorations: (decorations: DiffDecoration[]) => ReturnType;
      clearDiffDecorations: () => ReturnType;
      toggleDiffView: () => ReturnType;
    };
  }
}

export interface DiffDecoration {
  from: number;
  to: number;
  type: 'addition' | 'deletion' | 'modification';
  content?: string;
}

const pluginKey = new PluginKey('diffVisualization');

export const DiffVisualization = Extension.create({
  name: 'diffVisualization',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,

        state: {
          init() {
            return {
              decorations: DecorationSet.empty,
              active: false,
              diffData: [] as DiffDecoration[],
            };
          },

          apply(tr, value, oldState, newState) {
            const meta = tr.getMeta(pluginKey);

            if (meta?.setDecorations) {
              console.log('DiffVisualization Plugin - Setting decorations:', meta.decorations);
              console.log('DiffVisualization Plugin - Document size:', newState.doc.content.size);
              console.log('DiffVisualization Plugin - Document text:', newState.doc.textContent);

              const decorations: Decoration[] = [];

              meta.decorations.forEach((deco: DiffDecoration) => {
                console.log('DiffVisualization Plugin - Processing decoration:', deco);
                const { from, to, type, content } = deco;

                // Ensure positions are within document bounds
                const docSize = newState.doc.content.size;
                const safeFrom = Math.min(Math.max(0, from), docSize);
                const safeTo = Math.min(Math.max(safeFrom, to), docSize);

                console.log('DiffVisualization Plugin - Adjusted positions:', { from: safeFrom, to: safeTo, docSize });

                // Special handling for additions at the end of document or empty documents
                if (safeFrom === safeTo && (type === 'addition' || (from === 1 && to === 1 && docSize <= 2))) {
                  // Show a widget decoration for proposed additions
                  console.log('DiffVisualization Plugin - Adding widget for addition at position', safeFrom);
                  console.log('DiffVisualization Plugin - Content to show:', content);

                  const widget = document.createElement('div');
                  widget.className = 'diff-addition-preview';
                  widget.style.cssText =
                    'background-color: #d4f4dd; ' +
                    'border: 2px solid #10B981; ' +
                    'border-radius: 8px; ' +
                    'padding: 12px 16px; ' +
                    'margin: 12px 0; ' +
                    'color: #065F46; ' +
                    'font-family: inherit; ' +
                    'line-height: 1.6; ' +
                    'white-space: pre-wrap;';

                  // Create structured content display
                  const contentLines = (content || 'New content').split('\n');
                  const headerDiv = document.createElement('div');
                  headerDiv.style.cssText = 'font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;';

                  const icon = document.createElement('span');
                  icon.textContent = '✨';
                  icon.style.fontSize = '16px';

                  const headerText = document.createElement('span');
                  headerText.textContent = 'Proposed addition:';

                  headerDiv.appendChild(icon);
                  headerDiv.appendChild(headerText);
                  widget.appendChild(headerDiv);

                  const contentDiv = document.createElement('div');
                  contentDiv.style.cssText = 'font-style: normal; white-space: pre-wrap;';
                  contentDiv.textContent = content || 'New content';
                  widget.appendChild(contentDiv);

                  // Place widget at the safe position
                  decorations.push(
                    Decoration.widget(safeFrom, widget, { side: 1 })
                  );
                } else if (safeTo > safeFrom) {
                  // Regular inline decorations for existing content
                  if (type === 'addition') {
                    decorations.push(
                      Decoration.inline(safeFrom, safeTo, {
                        class: 'diff-addition',
                        style: 'background-color: #d4f4dd; border-bottom: 2px solid #10B981; padding: 2px 0;',
                      })
                    );
                  } else if (type === 'deletion') {
                    decorations.push(
                      Decoration.inline(safeFrom, safeTo, {
                        class: 'diff-deletion',
                        style: 'background-color: #fee2e2; text-decoration: line-through; opacity: 0.7;',
                      })
                    );
                  } else if (type === 'modification') {
                    decorations.push(
                      Decoration.inline(safeFrom, safeTo, {
                        class: 'diff-modification',
                        style: 'background-color: #fef3c7; border-bottom: 2px solid #F59E0B; padding: 2px 0;',
                      })
                    );
                  }
                } else {
                  console.log('DiffVisualization Plugin - Skipping decoration, invalid range');
                }
              });

              return {
                decorations: DecorationSet.create(newState.doc, decorations),
                active: true,
                diffData: meta.decorations,
              };
            }

            if (meta?.clearDecorations) {
              console.log('DiffVisualization Plugin - Clearing decorations');
              return {
                decorations: DecorationSet.empty,
                active: false,
                diffData: [],
              };
            }

            // Map decorations through doc changes
            return {
              decorations: value.decorations.map(tr.mapping, newState.doc),
              active: value.active,
              diffData: value.diffData,
            };
          },
        },

        props: {
          decorations(state) {
            const pluginState = this.getState(state);
            return pluginState?.decorations || DecorationSet.empty;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setDiffDecorations: (decorations: DiffDecoration[]) => ({ tr, dispatch }) => {
        console.log('DiffVisualization - setDiffDecorations command called with:', decorations);

        if (dispatch) {
          tr.setMeta(pluginKey, { setDecorations: true, decorations });
          dispatch(tr);
        }

        return true;
      },

      clearDiffDecorations: () => ({ tr, dispatch }) => {
        console.log('DiffVisualization - clearDiffDecorations command called');

        if (dispatch) {
          tr.setMeta(pluginKey, { clearDecorations: true });
          dispatch(tr);
        }

        return true;
      },

      toggleDiffView: () => ({ tr, state, dispatch }) => {
        const pluginState = pluginKey.getState(state);

        if (pluginState?.active) {
          // Clear if active
          if (dispatch) {
            tr.setMeta(pluginKey, { clearDecorations: true });
            dispatch(tr);
          }
        } else if (pluginState?.diffData?.length > 0) {
          // Restore if we have data
          if (dispatch) {
            tr.setMeta(pluginKey, { setDecorations: true, decorations: pluginState.diffData });
            dispatch(tr);
          }
        }

        return true;
      },
    };
  },
});

// Helper function to apply diff decorations from a proposal
export function applyProposalDiffs(editor: any, proposal: any) {
  if (!proposal.diff_decorations) {
    console.log('No diff decorations found in proposal');
    return;
  }

  // Apply the decorations
  editor.commands.setDiffDecorations(proposal.diff_decorations);
}

// Helper function to clear diff view
export function clearDiffView(editor: any) {
  editor.commands.clearDiffDecorations();
}