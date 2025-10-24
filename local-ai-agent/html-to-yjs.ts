import * as htmlparser2 from 'htmlparser2';
import * as Y from 'yjs';

interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, any>;
  content?: ProseMirrorNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
}

interface ProseMirrorDoc {
  type: 'doc';
  content: ProseMirrorNode[];
}

/**
 * Convert HTML to ProseMirror JSON structure
 */
export function htmlToProseMirrorJSON(html: string): ProseMirrorDoc {
  const content: ProseMirrorNode[] = [];
  let currentParagraph: ProseMirrorNode | null = null;
  let currentMarks: Array<{ type: string }> = [];
  let listStack: Array<{ type: 'bullet_list' | 'ordered_list'; items: ProseMirrorNode[] }> = [];

  const parser = new htmlparser2.Parser(
    {
      onopentag(name, attribs) {
        if (name === 'h1') {
          if (currentParagraph) {
            content.push(currentParagraph);
            currentParagraph = null;
          }
          currentParagraph = { type: 'heading', attrs: { level: 1 }, content: [] };
        } else if (name === 'h2') {
          if (currentParagraph) {
            content.push(currentParagraph);
            currentParagraph = null;
          }
          currentParagraph = { type: 'heading', attrs: { level: 2 }, content: [] };
        } else if (name === 'h3') {
          if (currentParagraph) {
            content.push(currentParagraph);
            currentParagraph = null;
          }
          currentParagraph = { type: 'heading', attrs: { level: 3 }, content: [] };
        } else if (name === 'p') {
          if (currentParagraph) {
            content.push(currentParagraph);
          }
          currentParagraph = { type: 'paragraph', content: [] };
        } else if (name === 'ul') {
          if (currentParagraph) {
            content.push(currentParagraph);
            currentParagraph = null;
          }
          listStack.push({ type: 'bullet_list', items: [] });
        } else if (name === 'ol') {
          if (currentParagraph) {
            content.push(currentParagraph);
            currentParagraph = null;
          }
          listStack.push({ type: 'ordered_list', items: [] });
        } else if (name === 'li') {
          currentParagraph = { type: 'paragraph', content: [] };
        } else if (name === 'strong' || name === 'b') {
          currentMarks.push({ type: 'strong' });
        } else if (name === 'em' || name === 'i') {
          currentMarks.push({ type: 'em' });
        }
      },

      ontext(text) {
        const trimmedText = text.trim();
        if (trimmedText && currentParagraph) {
          const textNode: ProseMirrorNode = {
            type: 'text',
            text: trimmedText,
          };

          if (currentMarks.length > 0) {
            textNode.marks = [...currentMarks];
          }

          currentParagraph.content!.push(textNode);
        }
      },

      onclosetag(name) {
        if (name === 'h1' || name === 'h2' || name === 'h3' || name === 'p') {
          if (currentParagraph && listStack.length === 0) {
            content.push(currentParagraph);
            currentParagraph = null;
          }
        } else if (name === 'li') {
          if (currentParagraph && listStack.length > 0) {
            const listItem = {
              type: 'list_item',
              content: [currentParagraph],
            };
            listStack[listStack.length - 1].items.push(listItem);
            currentParagraph = null;
          }
        } else if (name === 'ul' || name === 'ol') {
          const list = listStack.pop();
          if (list) {
            content.push({
              type: list.type,
              content: list.items,
            });
          }
        } else if (name === 'strong' || name === 'b') {
          currentMarks = currentMarks.filter(m => m.type !== 'strong');
        } else if (name === 'em' || name === 'i') {
          currentMarks = currentMarks.filter(m => m.type !== 'em');
        }
      },
    },
    { decodeEntities: true }
  );

  parser.write(html);
  parser.end();

  // Add any remaining paragraph
  if (currentParagraph) {
    content.push(currentParagraph);
  }

  return {
    type: 'doc',
    content,
  };
}

/**
 * Append ProseMirror nodes to a Y.js XmlFragment
 */
export function appendProseMirrorNodesToYjs(
  xmlFragment: Y.XmlFragment,
  nodes: ProseMirrorNode[]
): void {
  for (const node of nodes) {
    const yNode = proseMirrorNodeToYjs(node);
    if (yNode) {
      xmlFragment.push([yNode]);
    }
  }
}

/**
 * Convert a single ProseMirror node to Y.js XML element
 */
function proseMirrorNodeToYjs(node: ProseMirrorNode): Y.XmlElement | Y.XmlText | null {
  if (node.type === 'text') {
    const yText = new Y.XmlText(node.text);

    if (node.marks) {
      for (const mark of node.marks) {
        yText.format(0, yText.length, { [mark.type]: true });
      }
    }

    return yText;
  }

  // Create XML element for block nodes
  const yElement = new Y.XmlElement(node.type);

  // Set attributes
  if (node.attrs) {
    for (const [key, value] of Object.entries(node.attrs)) {
      yElement.setAttribute(key, String(value));
    }
  }

  // Add content
  if (node.content) {
    for (const childNode of node.content) {
      const yChild = proseMirrorNodeToYjs(childNode);
      if (yChild) {
        yElement.push([yChild]);
      }
    }
  }

  return yElement;
}
