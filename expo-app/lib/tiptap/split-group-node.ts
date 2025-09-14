import { Node, mergeAttributes } from '@tiptap/core';

export interface SplitGroupAttributes {
  id: string;
  name: string;
  members: string[];
  startTime?: string;
  endTime?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    splitGroup: {
      setSplitGroup: (attributes: SplitGroupAttributes) => ReturnType;
    };
  }
}

export const SplitGroupNode = Node.create({
  name: 'splitGroup',
  
  group: 'block',
  
  content: 'block+',
  
  addAttributes() {
    return {
      id: {
        default: null,
      },
      name: {
        default: '',
      },
      members: {
        default: [],
      },
      startTime: {
        default: null,
      },
      endTime: {
        default: null,
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="split-group"]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 
      'data-type': 'split-group',
      style: 'border-left: 3px solid #007AFF; padding-left: 16px; margin: 16px 0;'
    }), 0];
  },
  
  addCommands() {
    return {
      setSplitGroup: (attributes) => ({ commands }) => {
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
                  text: `Split: ${attributes.name}`,
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Groups: ${attributes.members.join(', ')}`,
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Add activities for each group below...',
                },
              ],
            },
          ],
        });
      },
    };
  },
});