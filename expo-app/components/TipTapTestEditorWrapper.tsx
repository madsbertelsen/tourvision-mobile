import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { Platform } from 'react-native';
import { WebView } from '@/components/dom/WebView';

interface TipTapTestEditorWrapperProps {
  initialDocument: any;
  onReady?: () => void;
  editable?: boolean;
}

export interface TipTapTestEditorHandle {
  applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => void;
  revertTransactionSteps: () => void;
}

const TipTapTestEditorWrapper = forwardRef<TipTapTestEditorHandle, TipTapTestEditorWrapperProps>(
  ({ initialDocument, onReady, editable = true }, ref) => {
    const webViewRef = useRef<HTMLIFrameElement>(null);

    useImperativeHandle(ref, () => ({
      applyTransactionSteps: (steps: any[], inverseSteps?: any[]) => {
        if (Platform.OS === 'web' && webViewRef.current) {
          const iframe = webViewRef.current as any;
          if (iframe.contentWindow) {
            iframe.contentWindow.applyTransactionSteps(steps, inverseSteps);
          }
        }
      },
      revertTransactionSteps: () => {
        if (Platform.OS === 'web' && webViewRef.current) {
          const iframe = webViewRef.current as any;
          if (iframe.contentWindow) {
            iframe.contentWindow.revertTransactionSteps();
          }
        }
      },
    }), []);

    React.useEffect(() => {
      if (Platform.OS === 'web' && webViewRef.current) {
        const iframe = webViewRef.current as any;
        // Set up message listener for ready event
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'editor-ready') {
            onReady?.();
          }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
      }
    }, [onReady]);

    if (Platform.OS !== 'web') {
      return null;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            margin: 0;
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 16px;
            line-height: 1.5;
          }
          .editor {
            min-height: 300px;
            outline: none;
          }
          .editor h1 { font-size: 24px; margin: 0.5em 0; font-weight: 600; }
          .editor h2 { font-size: 20px; margin: 0.5em 0; font-weight: 600; }
          .editor p { margin: 0.5em 0; }
          .preview-badge {
            position: fixed;
            top: 8px;
            right: 8px;
            background: #10b981;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            display: none;
            z-index: 1000;
          }
          .preview-mode .preview-badge {
            display: block;
          }
          /* Diff styles */
          .diff-addition-widget {
            background-color: #dcfce7;
            padding: 8px 12px;
            margin: 8px 0;
            border-left: 3px solid #10b981;
            border-radius: 4px;
          }
          .diff-addition-widget h1,
          .diff-addition-widget h2,
          .diff-addition-widget p {
            margin: 0.25em 0;
          }
        </style>
      </head>
      <body>
        <div id="editor-container">
          <div id="editor" class="editor"></div>
          <div class="preview-badge">PREVIEW MODE</div>
        </div>
        <script type="module">
          import { Editor } from 'https://esm.sh/@tiptap/core@2.1.13';
          import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.1.13';
          import { Plugin, PluginKey } from 'https://esm.sh/prosemirror-state@1.4.3';
          import { Decoration, DecorationSet } from 'https://esm.sh/prosemirror-view@1.32.5';
          import { Transform, ReplaceStep, Slice } from 'https://esm.sh/prosemirror-transform@1.8.0';
          import { Node as PMNode } from 'https://esm.sh/prosemirror-model@1.19.4';

          // DiffVisualization extension
          const pluginKey = new PluginKey('diffVisualization');

          const DiffVisualization = {
            name: 'diffVisualization',

            addProseMirrorPlugins() {
              return [
                new Plugin({
                  key: pluginKey,
                  state: {
                    init() {
                      return {
                        decorations: DecorationSet.empty,
                        originalDoc: null,
                        isPreview: false,
                      };
                    },
                    apply(tr, state) {
                      const meta = tr.getMeta(pluginKey);
                      if (meta?.applySteps) {
                        // Save original and create decorations
                        const decorations = meta.steps.flatMap((step, index) => {
                          if (step.stepType === 'replace' && step.slice?.content?.length > 0) {
                            return Decoration.widget(step.from, () => {
                              const container = document.createElement('div');
                              container.className = 'diff-addition-widget';

                              step.slice.content.forEach(nodeData => {
                                const elem = document.createElement(
                                  nodeData.type === 'heading' ?
                                    \`h\${nodeData.attrs?.level || 1}\` : 'p'
                                );
                                if (nodeData.content) {
                                  nodeData.content.forEach(child => {
                                    if (child.type === 'text') {
                                      elem.appendChild(document.createTextNode(child.text));
                                    }
                                  });
                                }
                                container.appendChild(elem);
                              });

                              return container;
                            }, { side: 1 });
                          }
                          return [];
                        });

                        return {
                          decorations: DecorationSet.create(tr.doc, decorations),
                          originalDoc: meta.originalDoc,
                          isPreview: true,
                          steps: meta.steps,
                          inverseSteps: meta.inverseSteps,
                        };
                      }

                      if (meta?.revertSteps) {
                        return {
                          decorations: DecorationSet.empty,
                          originalDoc: null,
                          isPreview: false,
                        };
                      }

                      return state;
                    },
                  },
                  props: {
                    decorations(state) {
                      return this.getState(state).decorations;
                    },
                  },
                }),
              ];
            },

            addCommands() {
              return {
                applyTransactionSteps: (steps, inverseSteps) => ({ tr, state, dispatch }) => {
                  const originalDoc = state.doc.toJSON();

                  // Apply the actual ProseMirror steps to transform the document
                  steps.forEach(stepData => {
                    if (stepData.stepType === 'replace') {
                      try {
                        // Create the slice from the step data
                        const sliceContent = [];
                        if (stepData.slice?.content) {
                          stepData.slice.content.forEach(nodeData => {
                            const node = state.schema.nodeFromJSON(nodeData);
                            if (node) sliceContent.push(node);
                          });
                        }

                        // Apply the replacement
                        if (sliceContent.length > 0) {
                          tr.insert(stepData.from, sliceContent);
                        } else if (stepData.to > stepData.from) {
                          tr.delete(stepData.from, stepData.to);
                        }
                      } catch (e) {
                        console.error('Error applying step:', e);
                      }
                    }
                  });

                  // Save the original document for reverting
                  tr.setMeta(pluginKey, {
                    applySteps: true,
                    steps,
                    inverseSteps,
                    originalDoc,
                  });

                  dispatch(tr);
                  document.body.classList.add('preview-mode');
                  return true;
                },
                revertTransactionSteps: () => ({ tr, state, dispatch }) => {
                  const pluginState = pluginKey.getState(state);
                  if (pluginState?.originalDoc) {
                    const { schema } = state;
                    const doc = schema.nodeFromJSON(pluginState.originalDoc);
                    tr.replaceWith(0, state.doc.content.size, doc.content);
                    tr.setMeta(pluginKey, { revertSteps: true });
                    dispatch(tr);
                    document.body.classList.remove('preview-mode');
                    return true;
                  }
                  return false;
                },
              };
            },
          };

          // Initialize editor
          const editor = new Editor({
            element: document.getElementById('editor'),
            extensions: [
              StarterKit,
              DiffVisualization,
            ],
            content: ${JSON.stringify(initialDocument)},
            editable: ${editable},
          });

          // Expose methods for parent using raw ProseMirror API
          window.applyTransactionSteps = (steps, inverseSteps) => {
            console.log('Applying transaction steps:', steps);

            // Get the current editor view and state
            const view = editor.view;
            const state = view.state;
            const { schema } = state;

            // Save the original document
            const originalDoc = state.doc.toJSON();

            // Create a new transaction
            let tr = state.tr;

            // Apply each step using raw ProseMirror Transform API
            steps.forEach(stepData => {
              if (stepData.stepType === 'replace') {
                try {
                  if (stepData.slice?.content && stepData.slice.content.length > 0) {
                    // Build nodes from the slice content
                    const nodes = stepData.slice.content.map(nodeData =>
                      schema.nodeFromJSON(nodeData)
                    );

                    // Insert the nodes at the specified position
                    nodes.forEach((node, index) => {
                      const insertPos = stepData.from + (index > 0 ? nodes.slice(0, index).reduce((sum, n) => sum + n.nodeSize, 0) : 0);
                      tr = tr.insert(insertPos, node);
                    });
                  } else if (stepData.to > stepData.from) {
                    // Delete range
                    tr = tr.delete(stepData.from, stepData.to);
                  }
                } catch (e) {
                  console.error('Error applying step:', e);
                }
              }
            });

            // Store metadata for reverting
            tr.setMeta('diffPreview', {
              originalDoc,
              steps,
              inverseSteps,
              isPreview: true
            });

            // Apply the transaction
            view.dispatch(tr);

            // Make editor read-only during preview
            editor.setEditable(false);
            document.body.classList.add('preview-mode');

            // Store original doc for revert
            window._originalDoc = originalDoc;

            return true;
          };

          window.revertTransactionSteps = () => {
            console.log('Reverting transaction steps');

            const view = editor.view;
            const state = view.state;
            const { schema } = state;

            if (window._originalDoc) {
              // Create a new transaction to restore the original document
              const tr = state.tr;

              // Restore the original document
              const originalDoc = schema.nodeFromJSON(window._originalDoc);
              tr.replaceWith(0, state.doc.content.size, originalDoc.content);

              // Clear metadata
              tr.setMeta('diffPreview', { isPreview: false });

              // Apply the transaction
              view.dispatch(tr);

              // Re-enable editing
              editor.setEditable(${editable});
              document.body.classList.remove('preview-mode');

              // Clear stored doc
              window._originalDoc = null;

              return true;
            }

            return false;
          };

          // Notify parent that editor is ready
          setTimeout(() => {
            window.parent.postMessage({ type: 'editor-ready' }, '*');
          }, 100);
        </script>
      </body>
      </html>
    `;

    return (
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={{ flex: 1, minHeight: 400 }}
        javaScriptEnabled={true}
      />
    );
  }
);

TipTapTestEditorWrapper.displayName = 'TipTapTestEditorWrapper';

export default TipTapTestEditorWrapper;