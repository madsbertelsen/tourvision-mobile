import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type TransportInsertionOptions = {}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    transportInsertion: {
      insertTransportationAtPosition: (pos: number) => ReturnType;
    };
  }
}

export const TransportInsertion = Extension.create<TransportInsertionOptions>({
  name: 'transportInsertion',

  addOptions() {
    return {};
  },

  addCommands() {
    return {
      insertTransportationAtPosition: (pos: number) => ({ state, dispatch, editor }) => {
        const { schema } = state;
        const $pos = state.doc.resolve(pos);
        
        // Get location context from surrounding nodes
        const prevNode = $pos.nodeBefore;
        const nextNode = $pos.nodeAfter;
        
        let fromLocation = '';
        let toLocation = '';
        
        if (prevNode?.type.name === 'destination') {
          fromLocation = prevNode.attrs.name || '';
        }
        
        if (nextNode?.type.name === 'destination') {
          toLocation = nextNode.attrs.name || '';
        }
        
        // Create transportation node
        const transportNode = schema.nodes.transportation?.create({
          mode: 'walking',
          fromLocation,
          toLocation,
        });
        
        if (!transportNode) return false;
        
        // Insert the node
        if (dispatch) {
          const tr = state.tr.insert(pos, transportNode);
          dispatch(tr);
        }
        
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-t': () => {
        // Insert transportation at current position
        const { state } = this.editor;
        const { selection } = state;
        const pos = selection.$anchor.pos;
        
        // Find the best position (between destinations)
        const $pos = state.doc.resolve(pos);
        
        // Check if we're between destinations
        if ($pos.parent.type.name === 'doc') {
          this.editor.commands.insertTransportationAtPosition(pos);
          return true;
        }
        
        return false;
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    
    return [
      new Plugin({
        key: new PluginKey('transportInsertion'),
        
        state: {
          init() {
            return { decorations: DecorationSet.empty };
          },
          
          apply(tr, value, oldState, newState) {
            // Update decorations after document changes
            if (tr.docChanged || tr.getMeta('forceUpdate')) {
              return { decorations: createInsertionDecorations(newState.doc, extension.editor) };
            }
            
            // Map existing decorations
            return {
              decorations: value.decorations.map(tr.mapping, tr.doc)
            };
          }
        },
        
        props: {
          decorations(state) {
            return this.getState(state)?.decorations || DecorationSet.empty;
          }
        },
        
        view(editorView) {
          // Initial decorations
          setTimeout(() => {
            const tr = editorView.state.tr.setMeta('forceUpdate', true);
            editorView.dispatch(tr);
          }, 100);
          
          return {
            update(view) {
              // Re-attach event listeners to insertion buttons
              setTimeout(() => {
                const buttons = view.dom.querySelectorAll('.transport-insertion-button');
                buttons.forEach(button => {
                  const pos = Number.parseInt((button as HTMLElement).dataset.pos || '0');
                  (button as HTMLElement).onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    extension.editor.commands.insertTransportationAtPosition(pos);
                  };
                });
              }, 0);
            }
          };
        }
      })
    ];
  },
});

function createInsertionDecorations(doc: any, editor: any): DecorationSet {
  const decorations: Decoration[] = [];
  
  // Find positions between destinations
  let lastWasDestination = false;
  let lastDestinationPos = 0;
  
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'destination') {
      if (lastWasDestination) {
        // Check if there's no transportation between them
        const between = doc.nodesBetween(lastDestinationPos + 1, pos - 1, (n: any) => {
          if (n.type.name === 'transportation') {
            return false; // Stop and indicate transportation exists
          }
        });
        
        // Add insertion point between destinations
        const insertPos = lastDestinationPos + doc.nodeAt(lastDestinationPos)?.nodeSize;
        const widget = Decoration.widget(insertPos, () => {
          const container = document.createElement('div');
          container.className = 'transport-insertion-widget';
          container.innerHTML = `
            <div class="transport-insertion-line"></div>
            <button class="transport-insertion-button" data-pos="${insertPos}" title="Add transportation (⌘T / Ctrl+T)">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
              <span class="insertion-label">Add route</span>
            </button>
            <div class="transport-insertion-line"></div>
          `;
          return container;
        }, { side: 0 });
        
        decorations.push(widget);
      }
      
      lastWasDestination = true;
      lastDestinationPos = pos;
    } else if (node.type.name !== 'text' && node.type.name !== 'paragraph') {
      // Reset if we encounter other block nodes
      if (node.type.name !== 'transportation') {
        lastWasDestination = false;
      }
    }
  });
  
  return DecorationSet.create(doc, decorations);
}