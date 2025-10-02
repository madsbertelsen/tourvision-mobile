import { EditorState } from 'prosemirror-state';
import { DOMParser, Node as ProseMirrorNode } from 'prosemirror-model';
import { schema } from './prosemirror-schema';
import type { FlatElement } from '@/components/MessageElementWithFocus';

/**
 * Generate a unique node ID
 */
function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

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

  // Pre-process to add unique IDs to block elements
  const blockElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, blockquote, li');
  blockElements.forEach(element => {
    if (!element.getAttribute('id')) {
      element.setAttribute('id', generateNodeId());
    }
  });

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
 * This processes only direct children of the document
 */
export function proseMirrorToElements(doc: ProseMirrorNode, messageId?: string): FlatElement[] {
  const elements: FlatElement[] = [];

  // Track message context for grouping
  let currentMessageId = messageId || 'msg-1';
  let currentMessageColor = '#3B82F6';

  // Process only direct children of the document
  doc.content.forEach((node, offset, index) => {
    // Generate a unique ID if the node doesn't have one
    const nodeId = node.attrs?.id || `pm-element-${index}`;

    // Handle different node types
    if (node.type === schema.nodes.paragraph) {
      const parsedContent = parseNodeContent(node);

      elements.push({
        id: `pm-element-${index}`,
        type: 'content',
        messageId: currentMessageId,
        messageColor: currentMessageColor,
        text: node.textContent,
        parsedContent,
        height: 50, // Default height, will be measured
        // Store the actual child index, which matches what deleteNodeByIndex expects
        documentPos: index,
        nodeSize: node.nodeSize,
        nodeId: nodeId, // Store the ProseMirror node ID
        isDeleted: false,
        isEdited: false
      });
    } else if (node.type === schema.nodes.heading) {
      elements.push({
        id: `pm-element-${index}`,
        type: 'content',
        messageId: currentMessageId,
        messageColor: currentMessageColor,
        text: node.textContent,
        height: 60, // Slightly taller for headings
        isHeading: true,
        headingLevel: node.attrs.level as 1 | 2 | 3,
        documentPos: index,
        nodeSize: node.nodeSize,
        nodeId: nodeId, // Store the ProseMirror node ID
        isDeleted: false,
        isEdited: false
      });
    } else if (node.type === schema.nodes.bulletList || node.type === schema.nodes.orderedList) {
      // Process list items
      const listItems: string[] = [];
      node.forEach(listItem => {
        if (listItem.type === schema.nodes.listItem) {
          listItem.forEach(para => {
            if (para.type === schema.nodes.paragraph) {
              listItems.push(para.textContent);
            }
          });
        }
      });

      elements.push({
        id: `pm-element-${index}`,
        type: 'content',
        messageId: currentMessageId,
        messageColor: currentMessageColor,
        text: listItems.join('\n• '),
        height: 40 * node.childCount,
        documentPos: index,
        nodeSize: node.nodeSize,
        nodeId: nodeId, // Store the ProseMirror node ID
        isDeleted: false,
        isEdited: false
      });
    } else {
      // Handle any other block nodes
      elements.push({
        id: `pm-element-${index}`,
        type: 'content',
        messageId: currentMessageId,
        messageColor: currentMessageColor,
        text: node.textContent,
        height: 50,
        documentPos: index,
        nodeSize: node.nodeSize,
        nodeId: nodeId, // Store the ProseMirror node ID
        isDeleted: false,
        isEdited: false
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