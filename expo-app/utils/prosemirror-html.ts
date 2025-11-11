import { JSONContent } from '@tiptap/react';
import { DOMParser } from 'prosemirror-model';
import { schema } from './prosemirror-schema';

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
      let text = escapeHTML(node.text || '');

      // Apply marks (including geo-marks)
      if (node.marks && Array.isArray(node.marks)) {
        for (const mark of node.marks) {
          if (mark.type === 'geoMark') {
            const attrs: string[] = ['class="geo-mark"', 'data-geo="true"'];
            if (mark.attrs?.lat) attrs.push(`data-lat="${mark.attrs.lat}"`);
            if (mark.attrs?.lng) attrs.push(`data-lng="${mark.attrs.lng}"`);
            if (mark.attrs?.placeName) attrs.push(`data-place-name="${escapeHTML(mark.attrs.placeName)}"`);
            if (mark.attrs?.geoId) attrs.push(`data-geo-id="${mark.attrs.geoId}"`);
            if (mark.attrs?.transportFrom) attrs.push(`data-transport-from="${mark.attrs.transportFrom}"`);
            if (mark.attrs?.transportProfile) attrs.push(`data-transport-profile="${mark.attrs.transportProfile}"`);
            if (mark.attrs?.coordSource) attrs.push(`data-coord-source="${mark.attrs.coordSource}"`);
            if (mark.attrs?.description) attrs.push(`data-description="${escapeHTML(mark.attrs.description)}"`);
            if (mark.attrs?.photoName) attrs.push(`data-photo-name="${mark.attrs.photoName}"`);
            if (mark.attrs?.colorIndex !== undefined) attrs.push(`data-color-index="${mark.attrs.colorIndex}"`);

            text = `<span ${attrs.join(' ')}>${text}</span>`;
          }
        }
      }

      return text;
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
 * Uses ProseMirror's native DOMParser for reliable HTML parsing
 */
export function htmlToProsemirror(html: string): JSONContent {
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

  // Get or create DOM environment (only works in browser/web)
  if (typeof window === 'undefined' || typeof window.document === 'undefined') {
    throw new Error('htmlToProsemirror only works in browser/web environment. Use on server or native platforms is not supported.');
  }

  const dom = window.document;

  // Create a temporary DOM element to parse the HTML
  const tempDiv = dom.createElement('div');
  tempDiv.innerHTML = cleanHtml;

  // Use ProseMirror's DOMParser to parse the HTML
  const parser = DOMParser.fromSchema(schema);
  const doc = parser.parse(tempDiv);

  // Convert to JSON
  return doc.toJSON();
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