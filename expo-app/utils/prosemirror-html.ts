import { JSONContent } from '@tiptap/react';

/**
 * Convert a ProseMirror document (JSONContent) to HTML string with element IDs
 * This is a simplified version that works without ProseMirror dependencies
 */
export function prosemirrorToHTML(content: JSONContent): string {
  let nodeId = 0;

  const nodeToHTML = (node: any): string => {
    if (!node) return '';

    // Handle text nodes
    if (node.type === 'text') {
      return escapeHTML(node.text || '');
    }

    // Handle element nodes
    const id = `node-${nodeId++}`;

    switch (node.type) {
      case 'doc':
        return node.content?.map(nodeToHTML).join('') || '';

      case 'paragraph':
        return `<p id="${id}">${node.content?.map(nodeToHTML).join('') || ''}</p>`;

      case 'heading':
        const level = node.attrs?.level || 1;
        return `<h${level} id="${id}">${node.content?.map(nodeToHTML).join('') || ''}</h${level}>`;

      case 'blockquote':
        return `<blockquote id="${id}">${node.content?.map(nodeToHTML).join('') || ''}</blockquote>`;

      case 'bulletList':
        return `<ul id="${id}">${node.content?.map(nodeToHTML).join('') || ''}</ul>`;

      case 'orderedList':
        return `<ol id="${id}">${node.content?.map(nodeToHTML).join('') || ''}</ol>`;

      case 'listItem':
        return `<li id="${id}">${node.content?.map(nodeToHTML).join('') || ''}</li>`;

      case 'codeBlock':
        return `<pre id="${id}"><code>${node.content?.map(nodeToHTML).join('') || ''}</code></pre>`;

      case 'hardBreak':
        return '<br>';

      default:
        // For unknown nodes, wrap in a div
        return `<div id="${id}" data-node-type="${node.type}">${node.content?.map(nodeToHTML).join('') || ''}</div>`;
    }
  };

  const escapeHTML = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  return nodeToHTML(content);
}

/**
 * Convert HTML string back to ProseMirror document (JSONContent)
 * This is a simplified parser that handles basic HTML without DOM dependencies
 */
export function htmlToProsemirror(html: string): JSONContent {
  // For now, return a basic document structure
  // In production, you'd want a proper HTML parser
  const content: any[] = [];

  // Simple regex-based parsing for basic elements
  const paragraphs = html.match(/<p[^>]*>(.*?)<\/p>/gi) || [];
  const headings = html.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi) || [];

  // Combine and sort by position in HTML
  const elements: { pos: number; node: any }[] = [];

  paragraphs.forEach(p => {
    const pos = html.indexOf(p);
    const textMatch = p.match(/<p[^>]*>(.*?)<\/p>/i);
    if (textMatch) {
      elements.push({
        pos,
        node: {
          type: 'paragraph',
          content: [{ type: 'text', text: stripHTML(textMatch[1]) }]
        }
      });
    }
  });

  headings.forEach(h => {
    const pos = html.indexOf(h);
    const match = h.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/i);
    if (match) {
      elements.push({
        pos,
        node: {
          type: 'heading',
          attrs: { level: parseInt(match[1]) },
          content: [{ type: 'text', text: stripHTML(match[2]) }]
        }
      });
    }
  });

  // Sort by position and extract nodes
  elements.sort((a, b) => a.pos - b.pos);
  content.push(...elements.map(e => e.node));

  // If no content found, create a default paragraph
  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: stripHTML(html) }]
    });
  }

  return {
    type: 'doc',
    content
  };
}

function stripHTML(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Extract text content from a ProseMirror document for context
 */
export function extractTextFromDocument(content: JSONContent): string {
  const extractText = (node: any): string => {
    if (!node) return '';

    if (node.type === 'text') {
      return node.text || '';
    }

    if (node.content && Array.isArray(node.content)) {
      return node.content.map(extractText).join(' ');
    }

    return '';
  };

  return extractText(content).trim();
}

/**
 * Find elements with specific data attributes in HTML
 */
export function findElementsWithAttribute(html: string, attribute: string, value?: string): Array<{
  id: string;
  tagName: string;
  content: string;
}> {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  const selector = value
    ? `[${attribute}="${value}"]`
    : `[${attribute}]`;

  const elements = wrapper.querySelectorAll(selector);
  const results: Array<{ id: string; tagName: string; content: string }> = [];

  elements.forEach(el => {
    results.push({
      id: el.getAttribute('id') || '',
      tagName: el.tagName.toLowerCase(),
      content: el.textContent || ''
    });
  });

  return results;
}