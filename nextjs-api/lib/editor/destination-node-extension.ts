import { Node, mergeAttributes } from '@tiptap/core';
import { getMarkerColor } from '@/artifacts/itinerary/marker-colors';

/**
 * Custom Destination node that properly renders with color styling
 * This replaces the generic details node for destinations
 */
export const DestinationNode = Node.create({
  name: 'destination',
  
  group: 'block',
  
  content: 'block+',
  
  defining: true,
  
  isolating: true,
  
  draggable: false,
  
  addAttributes() {
    return {
      name: {
        default: '',
      },
      context: {
        default: '',
      },
      geometry: {
        default: { type: 'point' },
      },
      colorIndex: {
        default: 0,
      },
      color: {
        default: null,
      },
      coordinates: {
        default: null,
      },
      placeId: {
        default: null,
      },
      open: {
        default: true,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details.destination-node',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          
          const destinationData = element.getAttribute('data-destination');
          const colorIndex = element.getAttribute('data-color-index');
          const color = element.getAttribute('data-color');
          
          let parsedData = {};
          if (destinationData) {
            try {
              parsedData = JSON.parse(destinationData);
            } catch {
              // Ignore parse errors
            }
          }
          
          return {
            name: parsedData.name || '',
            context: parsedData.context || '',
            geometry: parsedData.geometry || { type: 'point' },
            coordinates: parsedData.coordinates || null,
            placeId: parsedData.placeId || null,
            colorIndex: colorIndex ? Number.parseInt(colorIndex) : 0,
            color: color || null,
            open: element.hasAttribute('open'),
          };
        },
      },
    ];
  },

  addNodeView() {
    return ({ node, HTMLAttributes, getPos, editor }) => {
      const { name, context, geometry, colorIndex, color, coordinates, placeId, open } = node.attrs;
      let finalColor = color || getMarkerColor(colorIndex || 0);
      
      // Create DOM structure
      const dom = document.createElement('details');
      const contentDOM = document.createElement('div');
      const summary = document.createElement('summary');
      
      dom.className = 'destination-node';
      contentDOM.className = 'destination-details-content';
      summary.className = 'destination-summary';
      
      // Set attributes
      const destinationData = {
        name,
        context,
        geometry,
        coordinates,
        placeId,
        type: 'destination',
      };
      
      dom.setAttribute('data-destination', JSON.stringify(destinationData));
      dom.setAttribute('data-color-index', String(colorIndex || 0));
      dom.setAttribute('data-color', finalColor);
      dom.style.cssText = `--destination-color: ${finalColor};`;
      
      // Set initial open state
      dom.open = open === true;
      
      // Create context menu button (three dots)
      const contextMenuBtn = document.createElement('button');
      contextMenuBtn.className = 'destination-context-menu-btn';
      contextMenuBtn.setAttribute('contenteditable', 'false');
      contextMenuBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="3" r="1.5" fill="currentColor"/>
          <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
          <circle cx="8" cy="13" r="1.5" fill="currentColor"/>
        </svg>
      `;
      contextMenuBtn.style.cssText = `
        position: absolute;
        right: 8px;
        top: 8px;
        cursor: pointer;
        color: #9ca3af;
        display: none;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        transition: background-color 0.2s, color 0.2s;
        background: transparent;
        border: none;
        padding: 0;
        user-select: none;
        -webkit-user-select: none;
      `;
      
      // Create dropdown menu
      const contextMenu = document.createElement('div');
      contextMenu.className = 'destination-context-menu';
      // Check if dark mode
      const isDarkMode = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      
      contextMenu.style.cssText = `
        position: absolute;
        right: 8px;
        top: 32px;
        background: ${isDarkMode ? '#1f2937' : 'white'};
        border: 1px solid ${isDarkMode ? '#374151' : '#e5e7eb'};
        border-radius: 6px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        z-index: 50;
        display: none;
        min-width: 120px;
        padding: 4px 0;
      `;
      
      // Add delete option
      const deleteOption = document.createElement('button');
      deleteOption.className = 'destination-menu-option';
      deleteOption.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 8px;">
          <path d="M4.5 5.5L4.5 10.5M7 5.5V10.5M9.5 5.5V10.5M3 3.5H11M10 3.5V11.5C10 12.0523 9.55228 12.5 9 12.5H5C4.44772 12.5 4 12.0523 4 11.5V3.5M5.5 3.5V2.5C5.5 1.94772 5.94772 1.5 6.5 1.5H7.5C8.05228 1.5 8.5 1.94772 8.5 2.5V3.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Delete
      `;
      deleteOption.style.cssText = `
        display: flex;
        align-items: center;
        width: 100%;
        padding: 6px 12px;
        background: transparent;
        border: none;
        cursor: pointer;
        color: #ef4444;
        font-size: 14px;
        text-align: left;
        transition: background-color 0.15s;
      `;
      
      deleteOption.addEventListener('mouseenter', () => {
        deleteOption.style.backgroundColor = isDarkMode ? 'rgba(239, 68, 68, 0.1)' : '#fee2e2';
      });
      
      deleteOption.addEventListener('mouseleave', () => {
        deleteOption.style.backgroundColor = 'transparent';
      });
      
      deleteOption.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
        }
      });
      
      contextMenu.appendChild(deleteOption);
      
      // Create a cleanup function for the document click listener
      const handleDocumentClick = (e: MouseEvent) => {
        if (!contextMenu.contains(e.target as Node) && e.target !== contextMenuBtn && !contextMenuBtn.contains(e.target as Node)) {
          contextMenu.style.display = 'none';
          document.removeEventListener('click', handleDocumentClick);
        }
      };
      
      // Show/hide context menu
      contextMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isVisible = contextMenu.style.display === 'block';
        contextMenu.style.display = isVisible ? 'none' : 'block';
        
        // Add or remove document listener based on visibility
        if (!isVisible) {
          // Use setTimeout to avoid immediate triggering
          setTimeout(() => {
            document.addEventListener('click', handleDocumentClick);
          }, 0);
        } else {
          document.removeEventListener('click', handleDocumentClick);
        }
      });
      
      // Show context menu button only when expanded
      const updateContextMenuVisibility = () => {
        contextMenuBtn.style.display = dom.open ? 'flex' : 'none';
        contextMenu.style.display = 'none'; // Hide menu when toggling
      };
      
      
      // Add hover effects for context menu button
      contextMenuBtn.addEventListener('mouseenter', () => {
        contextMenuBtn.style.backgroundColor = 'rgba(156, 163, 175, 0.1)';
        contextMenuBtn.style.color = '#6b7280';
      });
      
      contextMenuBtn.addEventListener('mouseleave', () => {
        contextMenuBtn.style.backgroundColor = 'transparent';
        contextMenuBtn.style.color = '#9ca3af';
      });
      
      // Summary content with space for menu button
      summary.style.cssText = `
        color: ${finalColor}; 
        font-weight: 600; 
        position: relative;
        padding-right: 40px;
      `;
      summary.textContent = name || 'Destination';
      
      // Build structure
      dom.style.position = 'relative';
      dom.appendChild(contextMenuBtn);
      dom.appendChild(contextMenu);
      dom.appendChild(summary);
      dom.appendChild(contentDOM);
      
      // Initialize visibility
      updateContextMenuVisibility();
      
      // Handle toggle events
      dom.addEventListener('toggle', (event) => {
        // Update context menu visibility
        updateContextMenuVisibility();
        
        // Find the position of this node in the document
        const { state } = editor;
        let nodePos = null;
        
        // Use node's attributes to find it since node references change
        state.doc.descendants((descendantNode, pos) => {
          if (descendantNode.type.name === 'destination' && 
              descendantNode.attrs.name === node.attrs.name &&
              descendantNode.attrs.colorIndex === node.attrs.colorIndex) {
            nodePos = pos;
            return false; // Stop searching
          }
        });
        
        if (nodePos !== null) {
          editor.chain().command(({ tr }) => {
            // Don't save to database - just update UI state
            tr.setMeta('no-save', true);
            tr.setNodeMarkup(nodePos, undefined, {
              ...node.attrs,
              open: dom.open,
            });
            return true;
          }).run();
        }
      });
      
      return {
        dom,
        contentDOM,
        destroy() {
          // Clean up event listener
          document.removeEventListener('click', handleDocumentClick);
        },
        update(updatedNode) {
          if (updatedNode.type.name !== 'destination') return false;
          
          // Update the stored node reference
          node = updatedNode;
          
          // Update open state if changed
          const newOpen = updatedNode.attrs.open === true;
          if (dom.open !== newOpen) {
            dom.open = newOpen;
            updateContextMenuVisibility();
          }
          
          // Update summary if name changed  
          const summaryElement = dom.querySelector('summary');
          if (summaryElement && updatedNode.attrs.name !== summaryElement.textContent) {
            summaryElement.textContent = updatedNode.attrs.name || 'Destination';
          }
          
          // Update color if changed
          const newColor = updatedNode.attrs.color || getMarkerColor(updatedNode.attrs.colorIndex || 0);
          if (newColor !== finalColor) {
            finalColor = newColor;
            if (summaryElement) {
              (summaryElement as HTMLElement).style.cssText = `
                color: ${newColor}; 
                font-weight: 600;
                position: relative;
                padding-right: 40px;
              `;
            }
            dom.style.cssText = `position: relative; --destination-color: ${newColor};`;
          }
          
          return true;
        },
      };
    };
  },

  renderHTML({ HTMLAttributes, node }) {
    const { name, context, geometry, colorIndex, color, coordinates, placeId, open, ...otherAttrs } = HTMLAttributes;
    
    // Get the actual color
    const finalColor = color || getMarkerColor(colorIndex || 0);
    
    // Build destination data
    const destinationData = {
      name,
      context,
      geometry,
      coordinates,
      placeId,
      type: 'destination',
    };
    
    // Build style with color variable only (no border or background)
    const style = `--destination-color: ${finalColor};`;
    
    // The summary text comes from the name attribute
    const summaryText = name || 'Destination';
    
    // Build attributes, only including 'open' if it's true
    const baseAttrs = {
      class: 'destination-node draggable-node',
      'data-destination': JSON.stringify(destinationData),
      'data-color-index': colorIndex,
      'data-color': finalColor,
      style,
    };
    
    // Only add the open attribute if it's explicitly true
    if (open === true) {
      baseAttrs.open = '';
    }
    
    const attrs = mergeAttributes(otherAttrs, baseAttrs);
    
    // Return the HTML structure with content slot
    // The node's content will be rendered inside automatically
    return [
      'details',
      attrs,
      [
        'summary',
        { style: `color: ${finalColor}; font-weight: 600;` },
        summaryText,
      ],
      [
        'div',
        { class: 'destination-details-content' },
        0, // This indicates that the node's content should be rendered here
      ],
    ];
  },


  addKeyboardShortcuts() {
    return {
      'Mod-Shift-d': () => {
        this.editor.commands.insertContent({
          type: this.name,
          attrs: {
            name: 'New Destination',
            context: 'City, Country',
            colorIndex: 0,
            open: false,
          },
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Add details about this destination...',
                },
              ],
            },
          ],
        });
        return true;
      },
    };
  },

  addCommands() {
    return {
      insertDestination: (attributes) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            ...attributes,
            open: attributes.open !== undefined ? attributes.open : false, // Default to closed
          },
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: attributes.description || 'Add details about this destination...',
                },
              ],
            },
          ],
        });
      },
      toggleDestination: () => ({ state, dispatch }) => {
        const { selection } = state;
        const node = state.doc.nodeAt(selection.from);
        
        if (node && node.type.name === this.name) {
          if (dispatch) {
            const tr = state.tr
              .setMeta('no-save', true)  // Don't save to database
              .setNodeMarkup(selection.from, undefined, {
                ...node.attrs,
                open: !node.attrs.open,
              });
            dispatch(tr);
          }
          return true;
        }
        return false;
      },
    };
  },
});