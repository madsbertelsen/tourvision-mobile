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
      applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => ReturnType;
      revertTransactionSteps: () => ReturnType;
    };
  }
}

export interface DiffDecoration {
  from: number;
  to: number;
  type: 'addition' | 'deletion' | 'modification';
  content?: string | any;  // Can be string or ProseMirror content
}

export interface TransactionStep {
  stepType: string;
  from: number;
  to: number;
  slice?: {
    content: any[];
    openStart: number;
    openEnd: number;
  };
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
              appliedSteps: [] as any[],
              inverseSteps: [] as any[],
              originalDoc: null as any,
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
                    'background-color: rgba(212, 244, 221, 0.3); ' +
                    'border-left: 3px solid #10B981; ' +
                    'padding: 8px 12px; ' +
                    'margin: 8px 0; ' +
                    'color: #047857; ' +
                    'font-family: inherit; ' +
                    'font-size: inherit; ' +
                    'line-height: 1.6; ' +
                    'white-space: pre-wrap;';

                  // Just show the content directly, no header
                  const contentDiv = document.createElement('div');
                  contentDiv.style.cssText = 'white-space: pre-wrap;';

                  // Parse and display the content properly
                  // Content can be either a string or a ProseMirror doc structure
                  if (typeof content === 'string') {
                    // Legacy string content
                    const lines = content.split('\n').filter(line => line.trim());
                    lines.forEach((line, index) => {
                      const lineDiv = document.createElement('div');
                      lineDiv.style.cssText = index === 0 ? 'font-weight: 600; margin-bottom: 4px;' : '';
                      lineDiv.textContent = line;
                      contentDiv.appendChild(lineDiv);
                    });
                  } else if (content && typeof content === 'object') {
                    // ProseMirror doc structure
                    console.log('DiffVisualization - Rendering ProseMirror content:', content);

                    // Simple rendering of ProseMirror content
                    const renderNode = (node: any, container: HTMLElement) => {
                      if (!node) return;

                      if (node.type === 'doc' && node.content) {
                        node.content.forEach((child: any) => renderNode(child, container));
                      } else if (node.type === 'destination') {
                        // Render destination node
                        const destDiv = document.createElement('div');
                        destDiv.style.cssText = 'margin: 8px 0; padding: 12px; border-left: 3px solid #10B981;';

                        const title = document.createElement('h3');
                        title.style.cssText = 'margin: 0 0 8px 0; color: #10B981;';
                        title.textContent = '📍 ' + (node.attrs?.name || 'New Destination');
                        destDiv.appendChild(title);

                        if (node.attrs?.description) {
                          const desc = document.createElement('p');
                          desc.style.cssText = 'margin: 4px 0;';
                          desc.textContent = node.attrs.description;
                          destDiv.appendChild(desc);
                        }

                        if (node.content) {
                          node.content.forEach((child: any) => renderNode(child, destDiv));
                        }

                        container.appendChild(destDiv);
                      } else if (node.type === 'heading') {
                        const heading = document.createElement(`h${node.attrs?.level || 2}`);
                        heading.style.cssText = 'margin: 8px 0; color: #10B981;';
                        if (node.content) {
                          node.content.forEach((child: any) => {
                            if (child.type === 'text') {
                              heading.textContent += child.text || '';
                            }
                          });
                        }
                        container.appendChild(heading);
                      } else if (node.type === 'paragraph') {
                        const para = document.createElement('p');
                        para.style.cssText = 'margin: 4px 0;';
                        if (node.content) {
                          node.content.forEach((child: any) => {
                            if (child.type === 'text') {
                              const span = document.createElement('span');
                              span.textContent = child.text || '';
                              // Apply marks if any (like location marks)
                              if (child.marks) {
                                child.marks.forEach((mark: any) => {
                                  if (mark.type === 'location') {
                                    span.style.cssText = 'color: #10B981; font-weight: 500;';
                                  }
                                });
                              }
                              para.appendChild(span);
                            }
                          });
                        }
                        container.appendChild(para);
                      } else if (node.type === 'bulletList') {
                        const list = document.createElement('ul');
                        list.style.cssText = 'margin: 8px 0; padding-left: 20px;';
                        if (node.content) {
                          node.content.forEach((child: any) => renderNode(child, list));
                        }
                        container.appendChild(list);
                      } else if (node.type === 'listItem') {
                        const item = document.createElement('li');
                        item.style.cssText = 'margin: 4px 0;';
                        if (node.content) {
                          node.content.forEach((child: any) => renderNode(child, item));
                        }
                        container.appendChild(item);
                      } else if (node.type === 'text') {
                        const text = document.createTextNode(node.text || '');
                        container.appendChild(text);
                      }
                    };

                    renderNode(content, contentDiv);
                  } else {
                    // Fallback
                    contentDiv.textContent = 'Content to be added';
                  }

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
                appliedSteps: [],
                inverseSteps: [],
                originalDoc: null,
              };
            }

            if (meta?.applySteps) {
              console.log('DiffVisualization Plugin - Applying preview with decorations:', meta.steps);

              // Store the original document from meta or fallback to oldState
              const originalDoc = meta.originalDoc || value.originalDoc || oldState.doc.toJSON();

              // Create decorations for the inserted content
              const decorations: Decoration[] = [];

              // Track the ranges of inserted content for highlighting
              // We need to track what was inserted based on the steps
              meta.steps.forEach((step: any) => {
                if (step.stepType === 'replace') {
                  const from = step.from;

                  // For insertions, the "to" position should be the same as "from" (inserting at a position)
                  // The content being inserted determines the end position in the NEW document
                  let insertedSize = 0;
                  if (step.slice && step.slice.content) {
                    step.slice.content.forEach((node: any) => {
                      insertedSize += estimateNodeSize(node);
                    });
                  }

                  // The decoration should cover the range in the NEW document
                  // After applying the step, the content is inserted starting at 'from'
                  if (insertedSize > 0) {
                    // Since we're applying this AFTER the transformation,
                    // the inserted content is now at position 'from' to 'from + insertedSize'
                    const startPos = from;
                    const endPos = from + insertedSize;

                    console.log('Adding highlight decoration from', startPos, 'to', endPos);

                    // Check if positions are valid in the new document
                    if (startPos >= 0 && endPos <= newState.doc.nodeSize - 2) {
                      decorations.push(
                        Decoration.inline(startPos, endPos, {
                          class: 'diff-preview-addition',
                          style: 'background-color: rgba(16, 185, 129, 0.1); border-left: 3px solid #10B981; padding-left: 4px;',
                        })
                      );
                    }
                  }
                }
              });

              console.log('Created decorations:', decorations);

              return {
                decorations: DecorationSet.create(newState.doc, decorations),
                active: true,
                diffData: value.diffData,
                appliedSteps: meta.steps,
                inverseSteps: meta.inverseSteps || [],
                originalDoc,
                isPreview: true,
              };
            }

            if (meta?.revertSteps) {
              console.log('DiffVisualization Plugin - Reverting transaction steps');

              // Clear decorations and restore original state
              return {
                decorations: DecorationSet.empty,
                active: false,
                diffData: [],
                appliedSteps: [],
                inverseSteps: [],
                originalDoc: null,
              };
            }

            // Map decorations through doc changes
            return {
              decorations: value.decorations.map(tr.mapping, newState.doc),
              active: value.active,
              diffData: value.diffData,
              appliedSteps: value.appliedSteps,
              inverseSteps: value.inverseSteps,
              originalDoc: value.originalDoc,
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

      applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => ({ tr, state, dispatch }) => {
        console.log('DiffVisualization - applyTransactionSteps command called with:', steps);

        if (!steps || steps.length === 0) {
          console.warn('No steps to apply');
          return false;
        }

        // Save the original document state before applying changes
        const originalDoc = state.doc.toJSON();

        // Apply the actual steps to transform the document temporarily
        // The plugin will track the original state and add decorations
        steps.forEach((step) => {
          if (step.stepType === 'replace' && step.slice) {
            const { from, to, slice } = step;

            // Create ProseMirror nodes from the slice content
            const nodes: any[] = [];
            slice.content.forEach((nodeData: any) => {
              const node = createNodeFromJSON(state.schema, nodeData);
              if (node) nodes.push(node);
            });

            // Apply the transformation
            if (nodes.length > 0) {
              tr.replaceWith(from, to || from, nodes);
            }
          }
        });

        // Set metadata for the plugin to track this as a preview
        tr.setMeta(pluginKey, {
          applySteps: true,
          steps,
          inverseSteps,
          originalDoc,  // Save the original document
          isPreview: true,
        });

        if (dispatch) {
          dispatch(tr);
        }

        return true;
      },

      revertTransactionSteps: () => ({ tr, state, dispatch }) => {
        console.log('DiffVisualization - revertTransactionSteps command called');

        const pluginState = pluginKey.getState(state);
        console.log('Plugin state:', pluginState);

        // Check if we have an original document to restore
        if (pluginState?.originalDoc) {
          console.log('Restoring original document from saved state');
          console.log('Original doc:', pluginState.originalDoc);

          // Create nodes from the original document JSON
          const originalContent: any[] = [];
          if (pluginState.originalDoc.content) {
            pluginState.originalDoc.content.forEach((nodeData: any) => {
              const node = createNodeFromJSON(state.schema, nodeData);
              if (node) originalContent.push(node);
            });
          }

          // Replace the entire document content with the original
          tr.replaceWith(0, state.doc.nodeSize - 2, originalContent);

          // Clear the preview state
          tr.setMeta(pluginKey, { revertSteps: true });
        } else {
          // Fallback: apply inverse steps if available
          if (pluginState?.inverseSteps && pluginState.inverseSteps.length > 0) {
            console.log('Applying inverse steps to restore document');
            pluginState.inverseSteps.forEach((step: any) => {
              if (step.stepType === 'replace' && step.slice) {
                const { from, to, slice } = step;

                // Create ProseMirror nodes from the slice content
                const nodes: any[] = [];
                if (slice.content && slice.content.length > 0) {
                  slice.content.forEach((nodeData: any) => {
                    const node = createNodeFromJSON(state.schema, nodeData);
                    if (node) nodes.push(node);
                  });

                  // Apply the transformation
                  tr.replaceWith(from, to || from, nodes);
                } else {
                  // Delete content if slice is empty
                  tr.delete(from, to || from);
                }
              }
            });
          }

          // Clear the preview state
          tr.setMeta(pluginKey, { revertSteps: true });
        }

        if (dispatch) {
          dispatch(tr);
        }

        return true;
      },
    };
  },
});

// Helper function to estimate node size
function estimateNodeSize(node: any): number {
  if (!node) return 0;

  let size = 2; // Node markers

  if (node.content && Array.isArray(node.content)) {
    node.content.forEach((child: any) => {
      size += estimateNodeSize(child);
    });
  } else if (node.text) {
    size += node.text.length;
  }

  return size;
}

// Helper function to create ProseMirror node from JSON
function createNodeFromJSON(schema: any, json: any): any {
  if (!json) return null;

  try {
    // Handle text nodes
    if (json.type === 'text') {
      return schema.text(json.text, json.marks);
    }

    // Get the node type from schema
    const nodeType = schema.nodes[json.type];
    if (!nodeType) {
      console.warn('Unknown node type:', json.type);
      return null;
    }

    // Process content recursively
    const content: any[] = [];
    if (json.content) {
      json.content.forEach((child: any) => {
        const childNode = createNodeFromJSON(schema, child);
        if (childNode) content.push(childNode);
      });
    }

    // Create the node
    return nodeType.create(json.attrs || {}, content.length > 0 ? content : null, json.marks);
  } catch (error) {
    console.error('Error creating node from JSON:', error, json);
    return null;
  }
}

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