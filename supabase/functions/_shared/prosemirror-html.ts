// ProseMirror HTML serialization with position mapping for Deno/Edge Functions
// This module provides functions to convert between ProseMirror JSON and HTML
// with proper position tracking for transaction generation
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";

/**
 * Position map to track HTML IDs to ProseMirror positions
 */
export interface PositionMap {
  idToPos: Map<string, number>;
  posToId: Map<number, string>;
}

/**
 * Convert ProseMirror document to HTML with position mapping
 * Returns both HTML string and a bidirectional position map
 */
export function documentToHTMLWithMap(doc: any): { html: string; positionMap: PositionMap } {
  if (!doc || !doc.content) {
    return {
      html: '',
      positionMap: {
        idToPos: new Map(),
        posToId: new Map()
      }
    };
  }

  const positionMap: PositionMap = {
    idToPos: new Map(),
    posToId: new Map()
  };

  // Traverse the document and build HTML with position tracking
  const context = {
    nodeIndex: 0,
    pos: 0  // Start at position 0 in ProseMirror document
  };

  const html = doc.content.map((node: any) => {
    return traverseNode(node, context, positionMap);
  }).join('');

  return { html, positionMap };
}

/**
 * Simplified version that just returns HTML (backwards compatibility)
 */
export function documentToHTML(doc: any): string {
  const result = documentToHTMLWithMap(doc);
  return result.html;
}

/**
 * Traverse a node and generate HTML while tracking positions
 */
function traverseNode(node: any, context: { nodeIndex: number; pos: number }, positionMap: PositionMap): string {
  const nodeId = `node-${context.nodeIndex}`;

  // Record the position mapping
  positionMap.idToPos.set(nodeId, context.pos);
  positionMap.posToId.set(context.pos, nodeId);

  // Increment node index for next node
  context.nodeIndex++;

  // Generate HTML based on node type
  const html = nodeToHTML(node, nodeId);

  // Update position: each node takes up space based on its size
  // In ProseMirror, positions are between nodes, so we increment by node size
  context.pos += getNodeSize(node);

  return html;
}

/**
 * Convert a ProseMirror node to HTML
 */
function nodeToHTML(node: any, nodeId: string): string {
  const idAttr = ` id="${nodeId}"`;

  switch (node.type) {
    case 'paragraph':
      return `<p${idAttr}>${contentToHTML(node.content)}</p>`;

    case 'heading':
      const level = node.attrs?.level || 1;
      return `<h${level}${idAttr}>${contentToHTML(node.content)}</h${level}>`;

    case 'bulletList':
      return `<ul${idAttr}>${listItemsToHTML(node.content)}</ul>`;

    case 'orderedList':
      return `<ol${idAttr}>${listItemsToHTML(node.content)}</ol>`;

    case 'listItem':
      // List items can contain paragraphs and other blocks
      const liContent = node.content?.map((child: any) => {
        // If it's a paragraph inside a list item, don't wrap in <p> tags
        if (child.type === 'paragraph') {
          return contentToHTML(child.content);
        }
        // For nested lists or other block content
        return nodeToHTML(child, `${nodeId}-child`);
      }).join('') || '';
      return `<li${idAttr}>${liContent}</li>`;

    case 'blockquote':
      return `<blockquote${idAttr}>${blockContentToHTML(node.content)}</blockquote>`;

    case 'codeBlock':
      const code = node.content?.map((n: any) => n.text || '').join('') || '';
      return `<pre${idAttr}><code>${escapeHtml(code)}</code></pre>`;

    case 'horizontalRule':
      return `<hr${idAttr} />`;

    case 'text':
      return applyMarks(node.text || '', node.marks);

    default:
      // Fallback for unknown node types
      console.warn(`Unknown node type: ${node.type}`);
      return `<div${idAttr}>${contentToHTML(node.content)}</div>`;
  }
}

/**
 * Convert content array to HTML (for inline content)
 */
function contentToHTML(content: any[]): string {
  if (!content || !Array.isArray(content)) {
    return '';
  }

  return content.map(node => {
    if (node.type === 'text') {
      return applyMarks(node.text || '', node.marks);
    }
    // For non-text inline nodes, generate without ID
    return nodeToHTML(node, '');
  }).join('');
}

/**
 * Convert list items to HTML
 */
function listItemsToHTML(content: any[]): string {
  if (!content || !Array.isArray(content)) {
    return '';
  }

  return content.map((item, index) => {
    return nodeToHTML(item, `li-${index}`);
  }).join('');
}

/**
 * Convert block content to HTML
 */
function blockContentToHTML(content: any[]): string {
  if (!content || !Array.isArray(content)) {
    return '';
  }

  return content.map((node, index) => {
    return nodeToHTML(node, `block-${index}`);
  }).join('');
}

/**
 * Apply marks (bold, italic, etc.) to text
 */
function applyMarks(text: string, marks?: any[]): string {
  if (!marks || marks.length === 0) {
    return escapeHtml(text);
  }

  let result = escapeHtml(text);

  // Apply marks in reverse order to maintain proper nesting
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    switch (mark.type) {
      case 'bold':
        result = `<strong>${result}</strong>`;
        break;
      case 'italic':
        result = `<em>${result}</em>`;
        break;
      case 'code':
        result = `<code>${result}</code>`;
        break;
      case 'underline':
        result = `<u>${result}</u>`;
        break;
      case 'strike':
        result = `<s>${result}</s>`;
        break;
      case 'link':
        const href = mark.attrs?.href || '#';
        result = `<a href="${escapeHtml(href)}">${result}</a>`;
        break;
      default:
        console.warn(`Unknown mark type: ${mark.type}`);
    }
  }

  return result;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return text.replace(/[&<>"']/g, char => escapeMap[char] || char);
}

/**
 * Calculate the size of a node in the ProseMirror document
 * This follows ProseMirror's position counting rules
 */
function getNodeSize(node: any): number {
  if (!node) return 0;

  // Text nodes have size equal to their character count
  if (node.type === 'text') {
    return node.text?.length || 0;
  }

  // Block nodes have size = 1 (open) + content size + 1 (close)
  let size = 1; // Opening position

  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      size += getNodeSize(child);
    }
  }

  size += 1; // Closing position

  return size;
}

/**
 * Convert HTML back to ProseMirror document
 */
export function htmlToDocument(html: string): any {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!DOCTYPE html><body>${html}</body>`, 'text/html');

  if (!doc || !doc.body) {
    return { type: 'doc', content: [] };
  }

  const content: any[] = [];

  for (const child of doc.body.children) {
    const node = elementToNode(child as Element);
    if (node) {
      content.push(node);
    }
  }

  return { type: 'doc', content };
}

/**
 * Convert an HTML element to a ProseMirror node
 */
function elementToNode(element: Element): any {
  const tagName = element.tagName.toLowerCase();
  const id = element.getAttribute('id');

  // Build attrs object only if we have attributes
  const attrs: any = {};
  if (id) attrs.id = id;

  switch (tagName) {
    case 'p':
      return {
        type: 'paragraph',
        ...(Object.keys(attrs).length > 0 && { attrs }),
        content: parseInlineElements(element)
      };

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return {
        type: 'heading',
        attrs: { ...attrs, level: parseInt(tagName[1]) },
        content: parseInlineElements(element)
      };

    case 'ul':
      return {
        type: 'bulletList',
        ...(Object.keys(attrs).length > 0 && { attrs }),
        content: parseListItems(element)
      };

    case 'ol':
      return {
        type: 'orderedList',
        ...(Object.keys(attrs).length > 0 && { attrs }),
        content: parseListItems(element)
      };

    case 'blockquote':
      return {
        type: 'blockquote',
        ...(Object.keys(attrs).length > 0 && { attrs }),
        content: parseBlockElements(element)
      };

    case 'pre':
      const codeElement = element.querySelector('code');
      const codeText = codeElement?.textContent || element.textContent || '';
      return {
        type: 'codeBlock',
        ...(Object.keys(attrs).length > 0 && { attrs }),
        content: [{ type: 'text', text: codeText }]
      };

    case 'hr':
      return {
        type: 'horizontalRule',
        ...(Object.keys(attrs).length > 0 && { attrs })
      };

    default:
      // Try to parse as a paragraph for unknown elements
      return {
        type: 'paragraph',
        ...(Object.keys(attrs).length > 0 && { attrs }),
        content: parseInlineElements(element)
      };
  }
}

/**
 * Parse inline elements and text nodes
 */
function parseInlineElements(element: Element): any[] {
  const content: any[] = [];

  for (const node of element.childNodes) {
    if (node.nodeType === 3) { // Text node
      const text = node.textContent;
      if (text && text.trim()) {
        content.push({ type: 'text', text });
      }
    } else if (node.nodeType === 1) { // Element node
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();

      const marks: any[] = [];
      let innerContent = parseInlineElements(el);

      switch (tagName) {
        case 'strong':
        case 'b':
          marks.push({ type: 'bold' });
          break;
        case 'em':
        case 'i':
          marks.push({ type: 'italic' });
          break;
        case 'code':
          marks.push({ type: 'code' });
          break;
        case 'u':
          marks.push({ type: 'underline' });
          break;
        case 's':
        case 'strike':
          marks.push({ type: 'strike' });
          break;
        case 'a':
          const href = el.getAttribute('href');
          marks.push({ type: 'link', attrs: { href } });
          break;
      }

      // Apply marks to inner content
      if (marks.length > 0 && innerContent.length > 0) {
        innerContent = innerContent.map(node => ({
          ...node,
          marks: [...(node.marks || []), ...marks]
        }));
      }

      content.push(...innerContent);
    }
  }

  return content;
}

/**
 * Parse list items
 */
function parseListItems(list: Element): any[] {
  const items: any[] = [];

  for (const child of list.children) {
    if (child.tagName.toLowerCase() === 'li') {
      const content: any[] = [];

      // Check if the list item contains block-level content
      let hasBlockContent = false;
      for (const node of child.children) {
        const tagName = node.tagName.toLowerCase();
        if (['p', 'ul', 'ol', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          hasBlockContent = true;
          break;
        }
      }

      if (hasBlockContent) {
        // Parse as block content
        content.push(...parseBlockElements(child));
      } else {
        // Parse as inline content wrapped in a paragraph
        const inlineContent = parseInlineElements(child);
        if (inlineContent.length > 0) {
          content.push({
            type: 'paragraph',
            content: inlineContent
          });
        }
      }

      if (content.length > 0) {
        const id = child.getAttribute('id');
        items.push({
          type: 'listItem',
          ...(id && { attrs: { id } }),
          content
        });
      }
    }
  }

  return items;
}

/**
 * Parse block-level elements
 */
function parseBlockElements(container: Element): any[] {
  const blocks: any[] = [];

  for (const child of container.children) {
    const node = elementToNode(child as Element);
    if (node) {
      blocks.push(node);
    }
  }

  // If no block elements found, try to parse inline content as a paragraph
  if (blocks.length === 0) {
    const inlineContent = parseInlineElements(container);
    if (inlineContent.length > 0) {
      blocks.push({
        type: 'paragraph',
        content: inlineContent
      });
    }
  }

  return blocks;
}