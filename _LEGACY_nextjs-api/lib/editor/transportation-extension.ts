import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TransportationNode } from '@/components/editor/transportation-node';
import type { 
  TransportMode,
} from '@/lib/editor/transportation-helpers';

export type { TransportMode } from '@/lib/editor/transportation-helpers';

export interface TransportationAttributes {
  mode: TransportMode;
  duration?: number; // in minutes
  distance?: number; // in meters
  fromLocation?: string;
  toLocation?: string;
  waypoints?: Array<[number, number]>; // Intermediate waypoints
  notes?: string;
}

/**
 * Transportation node for representing travel between locations
 */
export const Transportation = Node.create({
  name: 'transportation',
  
  group: 'block',
  
  content: 'inline*',
  
  draggable: false, // Transportation is not draggable - it's tied to its locations
  
  addAttributes() {
    return {
      mode: {
        default: 'walking',
        parseHTML: element => element.getAttribute('data-mode') || 'walking',
        renderHTML: attributes => ({
          'data-mode': attributes.mode,
        }),
      },
      duration: {
        default: null,
        parseHTML: element => {
          const duration = element.getAttribute('data-duration');
          return duration ? Number.parseInt(duration) : null;
        },
        renderHTML: attributes => {
          if (!attributes.duration) return {};
          return {
            'data-duration': attributes.duration,
          };
        },
      },
      distance: {
        default: null,
        parseHTML: element => {
          const distance = element.getAttribute('data-distance');
          return distance ? Number.parseInt(distance) : null;
        },
        renderHTML: attributes => {
          if (!attributes.distance) return {};
          return {
            'data-distance': attributes.distance,
          };
        },
      },
      fromLocation: {
        default: null,
        parseHTML: element => element.getAttribute('data-from'),
        renderHTML: attributes => {
          if (!attributes.fromLocation) return {};
          return {
            'data-from': attributes.fromLocation,
          };
        },
      },
      toLocation: {
        default: null,
        parseHTML: element => element.getAttribute('data-to'),
        renderHTML: attributes => {
          if (!attributes.toLocation) return {};
          return {
            'data-to': attributes.toLocation,
          };
        },
      },
      waypoints: {
        default: null,
        parseHTML: element => {
          const waypoints = element.getAttribute('data-waypoints');
          return waypoints ? JSON.parse(waypoints) : null;
        },
        renderHTML: attributes => {
          if (!attributes.waypoints || attributes.waypoints.length === 0) return {};
          return {
            'data-waypoints': JSON.stringify(attributes.waypoints),
          };
        },
      },
      notes: {
        default: null,
        parseHTML: element => element.getAttribute('data-notes'),
        renderHTML: attributes => {
          if (!attributes.notes) return {};
          return {
            'data-notes': attributes.notes,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="transportation"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'transportation' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TransportationNode);
  },

  addCommands() {
    return {
      insertTransportation: (attributes: Partial<TransportationAttributes>) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: attributes,
        });
      },
      
      updateTransportation: (attributes: Partial<TransportationAttributes>) => ({ commands, state }) => {
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

// Re-export helper functions from transportation-helpers
export {
  getModeIcon,
  getModeColor,
  formatDuration,
  formatDistance,
  detectTransportMode,
  calculateDistance,
  estimateDuration
} from '@/lib/editor/transportation-helpers';