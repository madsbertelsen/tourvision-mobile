import { Node, mergeAttributes } from '@tiptap/core';

export interface DestinationAttributes {
  id: string;
  name: string;
  location?: {
    lat: number;
    lng: number;
  };
  arrivalTime?: string;
  departureTime?: string;
  duration?: string;
  description?: string;
  googlePlaceId?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    destination: {
      setDestination: (attributes: DestinationAttributes) => ReturnType;
    };
  }
}

export const DestinationNode = Node.create({
  name: 'destination',
  
  group: 'block',
  
  content: 'block*',
  
  addAttributes() {
    return {
      id: {
        default: null,
      },
      name: {
        default: '',
      },
      location: {
        default: null,
      },
      arrivalTime: {
        default: null,
      },
      departureTime: {
        default: null,
      },
      duration: {
        default: null,
      },
      description: {
        default: null,
      },
      googlePlaceId: {
        default: null,
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="destination"]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'destination' }), 0];
  },
  
  addCommands() {
    return {
      setDestination: (attributes) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: attributes,
          content: [
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [
                {
                  type: 'text',
                  text: attributes.name,
                },
              ],
            },
            ...(attributes.duration ? [{
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Duration: ${attributes.duration}`,
                },
              ],
            }] : []),
            ...(attributes.description ? [{
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: attributes.description,
                },
              ],
            }] : []),
          ],
        });
      },
    };
  },
});