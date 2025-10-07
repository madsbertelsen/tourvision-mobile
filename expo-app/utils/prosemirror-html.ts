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
  const content: any[] = [];

  // Strip <itinerary> wrapper if present
  let cleanHtml = html;
  const itineraryMatch = html.match(/<itinerary[^>]*>(.*)<\/itinerary>/is);
  if (itineraryMatch) {
    cleanHtml = itineraryMatch[1];
  } else {
    // Handle incomplete itinerary tag
    const incompleteMatch = html.match(/<itinerary[^>]*>(.*)/is);
    if (incompleteMatch) {
      cleanHtml = incompleteMatch[1];
    }
  }

  // Simple regex-based parsing for complete elements only
  const paragraphs = cleanHtml.match(/<p[^>]*>(.*?)<\/p>/gis) || [];
  const headings = cleanHtml.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/gis) || [];
  const listItems = cleanHtml.match(/<li[^>]*>(.*?)<\/li>/gis) || [];

  // Combine and sort by position in cleanHtml
  const elements: { pos: number; node: any; length: number }[] = [];

  paragraphs.forEach(p => {
    const pos = cleanHtml.indexOf(p);
    const textMatch = p.match(/<p[^>]*>(.*?)<\/p>/is);
    if (textMatch) {
      elements.push({
        pos,
        length: p.length,
        node: {
          type: 'paragraph',
          content: [{ type: 'text', text: stripHTML(textMatch[1]) }]
        }
      });
    }
  });

  headings.forEach(h => {
    const pos = cleanHtml.indexOf(h);
    const match = h.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/is);
    if (match) {
      elements.push({
        pos,
        length: h.length,
        node: {
          type: 'heading',
          attrs: { level: parseInt(match[1]) },
          content: [{ type: 'text', text: stripHTML(match[2]) }]
        }
      });
    }
  });

  // Sort by position
  elements.sort((a, b) => a.pos - b.pos);

  // Build content array and track what we've processed
  let lastProcessedPos = 0;
  elements.forEach(el => {
    // Add any text between elements
    if (el.pos > lastProcessedPos) {
      const betweenText = cleanHtml.substring(lastProcessedPos, el.pos);
      const stripped = stripHTML(betweenText).trim();
      if (stripped) {
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: stripped }]
        });
      }
    }

    // Add the element
    content.push(el.node);
    lastProcessedPos = el.pos + el.length;
  });

  // Add any remaining text after the last element
  if (lastProcessedPos < cleanHtml.length) {
    const remainingText = cleanHtml.substring(lastProcessedPos);
    const stripped = stripHTML(remainingText).trim();
    if (stripped) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: stripped }]
      });
    }
  }

  // If no content found, create a default paragraph with all text
  if (content.length === 0) {
    const stripped = stripHTML(cleanHtml).trim();
    if (stripped) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: stripped }]
      });
    } else {
      // Return empty document
      content.push({
        type: 'paragraph',
        content: []
      });
    }
  }

  return {
    type: 'doc',
    content
  };
}

function stripHTML(html: string): string {
  return html
    // Remove complete tags
    .replace(/<[^>]*>/g, '')
    // Remove incomplete opening tags (e.g., "<h1" or "<span class=")
    .replace(/<[^<]*/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
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