import { Node } from '@tiptap/core';

/**
 * Native Details extension that preserves HTML details/summary functionality
 * Allows the browser to handle expand/collapse natively without interference
 */
export const NativeDetails = Node.create({
  name: 'details',
  
  group: 'block',
  
  content: 'block+',
  
  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: element => element.hasAttribute('open'),
        renderHTML: attributes => {
          return attributes.open ? { open: '' } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'details',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', HTMLAttributes, 0];
  },

  // No custom nodeView - let browser handle it natively
});

/**
 * Native Summary node
 */
export const NativeSummary = Node.create({
  name: 'summary',
  
  content: 'inline*',
  
  parseHTML() {
    return [
      {
        tag: 'summary',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', HTMLAttributes, 0];
  },
});