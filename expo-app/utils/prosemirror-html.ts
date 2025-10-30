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

    // Handle geo-mark nodes
    if (node.type === 'geoMark') {
      const attrs: string[] = ['class="geo-mark"', 'data-geo="true"'];
      if (node.attrs?.lat) attrs.push(`data-lat="${node.attrs.lat}"`);
      if (node.attrs?.lng) attrs.push(`data-lng="${node.attrs.lng}"`);
      if (node.attrs?.placeName) attrs.push(`data-place-name="${escapeHTML(node.attrs.placeName)}"`);
      if (node.attrs?.geoId) attrs.push(`data-geo-id="${node.attrs.geoId}"`);
      if (node.attrs?.transportFrom) attrs.push(`data-transport-from="${node.attrs.transportFrom}"`);
      if (node.attrs?.transportProfile) attrs.push(`data-transport-profile="${node.attrs.transportProfile}"`);
      if (node.attrs?.coordSource) attrs.push(`data-coord-source="${node.attrs.coordSource}"`);
      if (node.attrs?.description) attrs.push(`data-description="${escapeHTML(node.attrs.description)}"`);
      if (node.attrs?.photoName) attrs.push(`data-photo-name="${node.attrs.photoName}"`);
      if (node.attrs?.colorIndex !== undefined) attrs.push(`data-color-index="${node.attrs.colorIndex}"`);

      const content = node.content?.map(nodeToHTML).join('') || node.attrs?.placeName || '';
      return `<span ${attrs.join(' ')}>${content}</span>`;
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

  // Helper function to parse inline content (text and geo-marks)
  const parseInlineContent = (html: string): any[] => {
    const inlineNodes: any[] = [];
    const geoMarkRegex = /<span[^>]*class="geo-mark"[^>]*>(.*?)<\/span>/gi;

    let lastIndex = 0;
    let match;

    while ((match = geoMarkRegex.exec(html)) !== null) {
      // Add text before geo-mark
      if (match.index > lastIndex) {
        const textBefore = html.substring(lastIndex, match.index);
        const stripped = stripHTML(textBefore).trim();
        if (stripped) {
          inlineNodes.push({ type: 'text', text: stripped });
        }
      }

      // Extract attributes from the span tag
      const spanTag = html.substring(match.index, match.index + match[0].indexOf('>') + 1);
      const attrs: any = {};

      const attrMatch = (name: string) => {
        const regex = new RegExp(`data-${name}="([^"]*)"`, 'i');
        const m = spanTag.match(regex);
        return m ? m[1] : null;
      };

      attrs.lat = attrMatch('lat');
      attrs.lng = attrMatch('lng');
      attrs.placeName = attrMatch('place-name');
      attrs.geoId = attrMatch('geo-id');
      attrs.transportFrom = attrMatch('transport-from');
      attrs.transportProfile = attrMatch('transport-profile');
      attrs.coordSource = attrMatch('coord-source');
      attrs.description = attrMatch('description');
      attrs.photoName = attrMatch('photo-name');
      const colorIndex = attrMatch('color-index');
      if (colorIndex) attrs.colorIndex = parseInt(colorIndex);

      // Add geo-mark node with text content
      const textContent = stripHTML(match[1]);
      inlineNodes.push({
        type: 'geoMark',
        attrs,
        content: textContent ? [{ type: 'text', text: textContent }] : []
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last geo-mark
    if (lastIndex < html.length) {
      const textAfter = html.substring(lastIndex);
      const stripped = stripHTML(textAfter).trim();
      if (stripped) {
        inlineNodes.push({ type: 'text', text: stripped });
      }
    }

    // If no geo-marks found, return plain text
    if (inlineNodes.length === 0) {
      const stripped = stripHTML(html).trim();
      if (stripped) {
        return [{ type: 'text', text: stripped }];
      }
    }

    return inlineNodes;
  };

  // Helper function to parse list items
  const parseListItems = (listHtml: string): any[] => {
    const items: any[] = [];
    const itemRegex = /<li[^>]*>(.*?)<\/li>/gis;
    let match;

    while ((match = itemRegex.exec(listHtml)) !== null) {
      items.push({
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: parseInlineContent(match[1])
        }]
      });
    }

    return items;
  };

  // Simple regex-based parsing for complete elements only
  const paragraphs = cleanHtml.match(/<p[^>]*>(.*?)<\/p>/gis) || [];
  const headings = cleanHtml.match(/<h([1-6])[^>]*>(.*?)<\/h\1>/gis) || [];
  const bulletLists = cleanHtml.match(/<ul[^>]*>(.*?)<\/ul>/gis) || [];
  const orderedLists = cleanHtml.match(/<ol[^>]*>(.*?)<\/ol>/gis) || [];

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
          content: parseInlineContent(textMatch[1])
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
          content: parseInlineContent(match[2])
        }
      });
    }
  });

  bulletLists.forEach(ul => {
    const pos = cleanHtml.indexOf(ul);
    const match = ul.match(/<ul[^>]*>(.*?)<\/ul>/is);
    if (match) {
      elements.push({
        pos,
        length: ul.length,
        node: {
          type: 'bulletList',
          content: parseListItems(match[1])
        }
      });
    }
  });

  orderedLists.forEach(ol => {
    const pos = cleanHtml.indexOf(ol);
    const match = ol.match(/<ol[^>]*>(.*?)<\/ol>/is);
    if (match) {
      elements.push({
        pos,
        length: ol.length,
        node: {
          type: 'orderedList',
          content: parseListItems(match[1])
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