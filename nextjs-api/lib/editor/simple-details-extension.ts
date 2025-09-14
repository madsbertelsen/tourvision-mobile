import { Node } from '@tiptap/core';

/**
 * Simple Details extension that just preserves HTML details/summary elements
 * Lets the browser handle the expand/collapse functionality natively
 */
export const SimpleDetails = Node.create({
  name: 'details',
  
  group: 'block',
  
  content: 'block+',
  
  atom: true,
  
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
        getAttrs: (element) => {
          return {
            open: element.hasAttribute('open'),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    // Create the details element with proper structure
    const attrs = { ...HTMLAttributes };
    if (node.attrs.open) {
      attrs.open = '';
    }
    
    return ['details', attrs, 0];
  },

  addNodeView() {
    return ({ node }) => {
      // Create a details element that preserves all content
      const dom = document.createElement('details');
      
      // Set initial open state
      if (node.attrs.open) {
        dom.setAttribute('open', '');
      }
      
      // Let TipTap handle the content
      const contentDOM = dom;
      
      return {
        dom,
        contentDOM,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) {
            return false;
          }
          
          // Update open attribute
          if (updatedNode.attrs.open) {
            dom.setAttribute('open', '');
          } else {
            dom.removeAttribute('open');
          }
          
          return true;
        },
      };
    };
  },
});