import { Node, mergeAttributes } from '@tiptap/core';
import { getMarkerColor } from '@/artifacts/itinerary/marker-colors';
import { insertDestination } from './insert-destination-command';
import { countDestinations } from './count-destinations';

export interface DestinationAttributes {
  name: string;
  context?: string;
  geometry?: {
    type: string;
    coordinates?: string;
  };
  colorIndex?: number;
  color?: string;
}

/**
 * Destination node for representing locations in the itinerary
 * This is actually just a styled details element
 */
export const Destination = Node.create({
  name: 'destination',
  
  group: 'block',
  
  content: 'block+',
  
  defining: true,
  
  draggable: true,
  
  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: element => {
          const data = element.getAttribute('data-destination');
          if (data) {
            try {
              const parsed = JSON.parse(data);
              return parsed.name || '';
            } catch {
              return '';
            }
          }
          return element.querySelector('summary')?.textContent?.trim() || '';
        },
        renderHTML: attributes => {
          // Don't render name directly - it's in the content
          return {};
        },
      },
      context: {
        default: null,
        parseHTML: element => {
          const data = element.getAttribute('data-destination');
          if (data) {
            try {
              const parsed = JSON.parse(data);
              return parsed.context;
            } catch {
              return null;
            }
          }
          return null;
        },
        renderHTML: attributes => {
          // Context is stored in data attribute
          return {};
        },
      },
      geometry: {
        default: { type: 'point' },
        parseHTML: element => {
          const data = element.getAttribute('data-destination');
          if (data) {
            try {
              const parsed = JSON.parse(data);
              return parsed.geometry || { type: 'point' };
            } catch {
              return { type: 'point' };
            }
          }
          return { type: 'point' };
        },
        renderHTML: attributes => {
          // Geometry is stored in data attribute
          return {};
        },
      },
      colorIndex: {
        default: null,
        parseHTML: element => {
          const index = element.getAttribute('data-color-index');
          return index ? Number.parseInt(index) : null;
        },
        renderHTML: attributes => {
          if (attributes.colorIndex === null || attributes.colorIndex === undefined) {
            return {};
          }
          return {
            'data-color-index': attributes.colorIndex,
          };
        },
      },
      color: {
        default: null,
        parseHTML: element => element.getAttribute('data-color'),
        renderHTML: attributes => {
          if (!attributes.color) {
            return {};
          }
          return {
            'data-color': attributes.color,
          };
        },
      },
      open: {
        default: false,
        parseHTML: element => element.hasAttribute('open'),
        renderHTML: attributes => {
          if (!attributes.open) {
            return {};
          }
          return {
            open: 'open',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details.destination-node',
      },
      {
        tag: 'details[data-destination]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { name, context, geometry, colorIndex, color, ...otherAttrs } = HTMLAttributes;
    
    // Build data attribute
    const destinationData = {
      name,
      context,
      geometry,
      type: 'destination'
    };
    
    // Apply color styling - use provided color or get from colorIndex
    let style = '';
    let finalColor = color;
    
    // If no color but we have colorIndex, get the color
    if (!finalColor && colorIndex !== null && colorIndex !== undefined) {
      finalColor = getMarkerColor(colorIndex);
    }
    
    if (finalColor) {
      // Use the color for border and subtle background
      const bgOpacity = '08'; // Very subtle background (8% opacity)
      const borderOpacity = 'FF'; // Full opacity for border
      style = `border-left: 4px solid ${finalColor}${borderOpacity}; background-color: ${finalColor}${bgOpacity}; --destination-color: ${finalColor};`;
    }
    
    return [
      'details', 
      mergeAttributes(otherAttrs, {
        class: 'destination-node',
        'data-destination': JSON.stringify(destinationData),
        'data-color-index': colorIndex,
        'data-color': finalColor || color,
        style,
      }), 
      0
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Mod-Shift-D to insert a new destination
      'Mod-Shift-d': () => {
        // Count existing destinations to get the next color index
        const doc = this.editor.getJSON();
        const colorIndex = countDestinations(doc);

        insertDestination(this.editor, {
          name: 'New Destination',
          context: '',
          description: '',
          colorIndex,
          open: true,
        });
        
        return true;
      },
    };
  },

  addCommands() {
    return {
      insertDestination: (attributes: Partial<DestinationAttributes>) => ({ commands }) => {
        // Get color info
        const finalColor = attributes.color || (attributes.colorIndex !== undefined ? getMarkerColor(attributes.colorIndex) : getMarkerColor(0));
        const colorIndex = attributes.colorIndex || 0;
        
        // Insert as a details element with proper structure
        return commands.insertContent({
          type: 'details',
          attrs: {
            open: attributes.open !== false,
          },
          content: [
            {
              type: 'detailsSummary',
              content: [
                {
                  type: 'text',
                  text: attributes.name || 'New Destination',
                },
              ],
            },
            {
              type: 'detailsContent',
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
            },
          ],
        });
      },
      
      updateDestination: (attributes: Partial<DestinationAttributes>) => ({ commands, state }) => {
        const { selection } = state;
        const node = state.doc.nodeAt(selection.from);
        
        if (node?.type.name !== this.name) {
          return false;
        }
        
        return commands.updateAttributes(this.name, attributes);
      },
    };
  },
});