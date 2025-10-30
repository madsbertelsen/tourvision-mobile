import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Details node for TipTap - based on official TipTap details extension
 * Creates collapsible sections that work within the editor
 */
export const Details = Node.create({
  name: 'details',

  content: 'detailsSummary detailsContent',

  group: 'block',

  defining: true,

  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: (element) => element.hasAttribute('open'),
        renderHTML: (attributes) => {
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
        tag: 'details',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setDetails: () => ({ commands }) => {
        return commands.wrapIn(this.name);
      },
      toggleDetails: () => ({ commands }) => {
        return commands.toggleWrap(this.name);
      },
      unsetDetails: () => ({ commands }) => {
        return commands.lift(this.name);
      },
    };
  },
});

export const DetailsSummary = Node.create({
  name: 'detailsSummary',

  content: 'inline*',

  defining: true,

  parseHTML() {
    return [
      {
        tag: 'summary',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes), 0];
  },
});

export const DetailsContent = Node.create({
  name: 'detailsContent',

  content: 'block+',

  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="details-content"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-type': 'details-content' }, HTMLAttributes), 0];
  },
});