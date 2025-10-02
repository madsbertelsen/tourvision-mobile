import { EditorState } from 'prosemirror-state';
import { DOMParser, Node as ProseMirrorNode } from 'prosemirror-model';
import { schema } from './prosemirror-schema';
import type { FlatElement } from '@/components/MessageElementWithFocus';

/**
 * Parse HTML string (from AI response) to ProseMirror document
 */
export function parseHTMLToProseMirror(html: string): {
  state: EditorState;
  doc: ProseMirrorNode;
} {
  // Create a temporary DOM element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Pre-process geo-marks to ensure they have the right class
  const geoMarks = tempDiv.querySelectorAll('span[data-geo="true"]');
  geoMarks.forEach(span => {
    span.classList.add('geo-mark');
  });

  // Use ProseMirror's DOMParser to create the document
  const parser = DOMParser.fromSchema(schema);
  const doc = parser.parse(tempDiv);

  // Create EditorState
  const state = EditorState.create({
    doc,
    schema
  });

  return { state, doc };
}

/**
 * Parse JSON document (from database) to ProseMirror document
 */
export function parseJSONToProseMirror(json: any): {
  state: EditorState;
  doc: ProseMirrorNode;
} {
  // If it's already a valid ProseMirror JSON, create node directly
  let doc: ProseMirrorNode;

  try {
    // Attempt to create node from JSON
    doc = schema.nodeFromJSON(json);
  } catch (error) {
    console.error('Error parsing JSON to ProseMirror:', error);
    // Fallback to empty document
    doc = schema.node('doc', null, [
      schema.node('paragraph', null, [])
    ]);
  }

  // Create EditorState
  const state = EditorState.create({
    doc,
    schema
  });

  return { state, doc };
}

/**
 * Convert ProseMirror document to renderable UI elements
 */
export function proseMirrorToElements(doc: ProseMirrorNode): FlatElement[] {
  const elements: FlatElement[] = [];
  let elementId = 0;

  // Track message context for grouping
  let currentMessageId = 'msg-1';
  let currentMessageColor = '#3B82F6';

  doc.descendants((node, pos) => {
    // Skip the doc node itself
    if (node.type === schema.nodes.doc) {
      return;
    }

    // Handle different node types
    if (node.type === schema.nodes.paragraph) {
      const parsedContent = parseNodeContent(node);

      elements.push({
        id: `element-${elementId++}`,
        type: 'content',
        messageId: currentMessageId,
        messageColor: currentMessageColor,
        text: node.textContent,
        parsedContent,
        height: 50, // Default height, will be measured
        documentPos: pos,
        nodeSize: node.nodeSize,
        isDeleted: false,
        isEdited: false
      });
    } else if (node.type === schema.nodes.heading) {
      elements.push({
        id: `element-${elementId++}`,
        type: 'content',
        messageId: currentMessageId,
        messageColor: currentMessageColor,
        text: node.textContent,
        height: 60, // Slightly taller for headings
        isHeading: true,
        headingLevel: node.attrs.level as 1 | 2 | 3,
        documentPos: pos,
        nodeSize: node.nodeSize,
        isDeleted: false,
        isEdited: false
      });
    } else if (node.type === schema.nodes.bulletList || node.type === schema.nodes.orderedList) {
      // Process list items
      node.forEach((listItem, offset) => {
        const itemPos = pos + offset + 1;
        elements.push({
          id: `element-${elementId++}`,
          type: 'content',
          messageId: currentMessageId,
          messageColor: currentMessageColor,
          text: listItem.textContent,
          height: 40,
          documentPos: itemPos,
          nodeSize: listItem.nodeSize,
          isDeleted: false,
          isEdited: false
        });
      });
    }
  });

  return elements;
}

/**
 * Parse node content to extract geo-marks and text
 */
function parseNodeContent(node: ProseMirrorNode): Array<{
  type: 'text' | 'geo-mark';
  text: string;
  lat?: string | null;
  lng?: string | null;
  placeName?: string | null;
  description?: string | null;
  photoName?: string | null;
  geoId?: string;
  transportFrom?: string;
  transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit';
  color?: string;
}> {
  const content: any[] = [];
  let textBuffer = '';

  node.forEach((child) => {
    if (child.type === schema.nodes.text) {
      textBuffer += child.text;
    } else if (child.type === schema.nodes.geoMark) {
      // Flush any buffered text
      if (textBuffer) {
        content.push({ type: 'text', text: textBuffer });
        textBuffer = '';
      }

      // Add geo-mark
      content.push({
        type: 'geo-mark',
        text: child.textContent,
        lat: child.attrs.lat,
        lng: child.attrs.lng,
        placeName: child.attrs.placeName || child.textContent,
        description: child.attrs.description,
        photoName: child.attrs.photoName,
        geoId: child.attrs.geoId,
        transportFrom: child.attrs.transportFrom,
        transportProfile: child.attrs.transportProfile,
        color: '#3B82F6' // Default color, can be customized
      });
    } else if (child.isInline) {
      // Handle other inline content
      textBuffer += child.textContent;
    }
  });

  // Flush remaining text
  if (textBuffer) {
    content.push({ type: 'text', text: textBuffer });
  }

  return content;
}

/**
 * Find element by its document position
 */
export function findElementByPos(elements: FlatElement[], pos: number): FlatElement | undefined {
  return elements.find(el => el.documentPos === pos);
}

/**
 * Update element after transaction
 */
export function updateElementFromNode(
  element: FlatElement,
  node: ProseMirrorNode,
  pos: number
): FlatElement {
  return {
    ...element,
    text: node.textContent,
    parsedContent: parseNodeContent(node),
    documentPos: pos,
    nodeSize: node.nodeSize,
    isEdited: true
  };
}