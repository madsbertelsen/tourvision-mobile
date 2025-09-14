import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

export const transportInsertionPluginKey = new PluginKey('transportInsertion');

// Helper to check if a node is a destination
function isDestinationNode(node: PMNode): boolean {
  return node.type.name === 'destination';
}

// Helper to check if we should show insertion point between two nodes
function shouldShowInsertionPoint(prevNode: PMNode | null, nextNode: PMNode | null): boolean {
  // Show between two destinations
  if (prevNode && nextNode && isDestinationNode(prevNode) && isDestinationNode(nextNode)) {
    return true;
  }
  // Show after a destination if it's not followed by transportation
  if (prevNode && isDestinationNode(prevNode) && (!nextNode || nextNode.type.name !== 'transportation')) {
    return true;
  }
  return false;
}

export function createTransportInsertionPlugin() {
  return new Plugin({
    key: transportInsertionPluginKey,
    
    state: {
      init() {
        return { decorations: DecorationSet.empty, hoveredPos: null };
      },
      
      apply(tr, value, oldState, newState) {
        const meta = tr.getMeta(transportInsertionPluginKey);
        
        if (meta?.hoveredPos !== undefined) {
          // Update hover position
          const decorations = createDecorations(newState.doc, meta.hoveredPos);
          return { decorations, hoveredPos: meta.hoveredPos };
        }
        
        // If document changed, update decorations
        if (tr.docChanged) {
          const decorations = value.hoveredPos !== null 
            ? createDecorations(newState.doc, value.hoveredPos)
            : DecorationSet.empty;
          return { decorations, hoveredPos: value.hoveredPos };
        }
        
        // Map decorations through the transaction
        return {
          decorations: value.decorations.map(tr.mapping, tr.doc),
          hoveredPos: value.hoveredPos
        };
      }
    },
    
    props: {
      decorations(state) {
        return transportInsertionPluginKey.getState(state)?.decorations || DecorationSet.empty;
      },
      
      handleDOMEvents: {
        mouseover(view: EditorView, event: MouseEvent) {
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!pos) return false;
          
          // Check if we're between destinations
          const $pos = view.state.doc.resolve(pos.pos);
          const prevNode = $pos.nodeBefore;
          const nextNode = $pos.nodeAfter;
          
          if (shouldShowInsertionPoint(prevNode, nextNode)) {
            const tr = view.state.tr.setMeta(transportInsertionPluginKey, { hoveredPos: pos.pos });
            view.dispatch(tr);
          }
          
          return false;
        },
        
        mouseleave(view: EditorView) {
          const tr = view.state.tr.setMeta(transportInsertionPluginKey, { hoveredPos: null });
          view.dispatch(tr);
          return false;
        }
      }
    },
    
    view() {
      return {
        update(view: EditorView) {
          // Create insertion point elements
          const insertionPoints = view.dom.querySelectorAll('.transport-insertion-point');
          insertionPoints.forEach(point => {
            point.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              const pos = Number.parseInt((point as HTMLElement).dataset.pos || '0');
              insertTransportationNode(view, pos);
            });
          });
        }
      };
    }
  });
}

function createDecorations(doc: PMNode, hoveredPos: number | null): DecorationSet {
  const decorations: Decoration[] = [];
  
  doc.descendants((node, pos) => {
    // Check between this node and the next
    const nextPos = pos + node.nodeSize;
    const $pos = doc.resolve(nextPos);
    const prevNode = node;
    const nextNode = $pos.nodeAfter;
    
    if (shouldShowInsertionPoint(prevNode, nextNode)) {
      const isHovered = hoveredPos !== null && Math.abs(hoveredPos - nextPos) < 10;
      
      // Create widget decoration for insertion point
      const widget = Decoration.widget(nextPos, () => {
        const span = document.createElement('div');
        span.className = `transport-insertion-point ${isHovered ? 'hovered' : ''}`;
        span.dataset.pos = String(nextPos);
        span.innerHTML = `
          <div class="insertion-line"></div>
          <button class="insertion-button" title="Add transportation (Ctrl+T)">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 1V11M1 6H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <div class="insertion-line"></div>
        `;
        return span;
      }, { 
        side: 0,
        key: `insertion-${nextPos}` 
      });
      
      decorations.push(widget);
    }
  });
  
  return DecorationSet.create(doc, decorations);
}

function insertTransportationNode(view: EditorView, pos: number) {
  const { state, dispatch } = view;
  const { schema } = state;
  
  // Get the previous destination to extract location info
  const $pos = state.doc.resolve(pos);
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
  const transportNode = schema.nodes.transportation.create({
    mode: 'walking',
    fromLocation,
    toLocation,
  });
  
  // Insert the node
  const tr = state.tr.insert(pos, transportNode);
  dispatch(tr);
  
  // Focus on the new node
  view.focus();
}

// Export styles for the insertion points
export const transportInsertionStyles = `
  .transport-insertion-point {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 8px 0;
    opacity: 0;
    transition: opacity 0.2s ease;
    position: relative;
    height: 24px;
  }
  
  .transport-insertion-point:hover,
  .transport-insertion-point.hovered {
    opacity: 1;
  }
  
  .insertion-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, #e2e8f0 20%, #e2e8f0 80%, transparent);
  }
  
  .dark .insertion-line {
    background: linear-gradient(90deg, transparent, #475569 20%, #475569 80%, transparent);
  }
  
  .insertion-button {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid #e2e8f0;
    background: white;
    color: #64748b;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    margin: 0 8px;
  }
  
  .dark .insertion-button {
    border-color: #475569;
    background: #1e293b;
    color: #94a3b8;
  }
  
  .insertion-button:hover {
    transform: scale(1.1);
    border-color: #3b82f6;
    color: #3b82f6;
    background: #eff6ff;
  }
  
  .dark .insertion-button:hover {
    background: #1e3a8a;
    border-color: #60a5fa;
    color: #60a5fa;
  }
  
  /* Show insertion points when focused on editor even without hover */
  .ProseMirror:focus-within .transport-insertion-point {
    opacity: 0.5;
  }
  
  .ProseMirror:focus-within .transport-insertion-point:hover {
    opacity: 1;
  }
`;