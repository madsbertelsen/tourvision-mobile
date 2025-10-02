import { EditorState, Transaction } from 'prosemirror-state';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { schema } from './prosemirror-schema';

/**
 * Find a block node by its index (0-based)
 * This counts only direct children of the document
 */
export function findNodeByIndex(doc: ProseMirrorNode, targetIndex: number): { node: ProseMirrorNode; pos: number } | null {
  // Check if target index is valid
  if (targetIndex < 0 || targetIndex >= doc.content.childCount) {
    console.error('[findNodeByIndex] Index out of bounds:', targetIndex, 'doc has', doc.content.childCount, 'children');
    return null;
  }

  // Get the child directly by index
  const node = doc.content.child(targetIndex);

  // Calculate the position
  let pos = 0;
  for (let i = 0; i < targetIndex; i++) {
    pos += doc.content.child(i).nodeSize;
  }
  // Add 1 for the doc node itself
  pos += 1;

  console.log('[findNodeByIndex] Found node at index', targetIndex, 'pos:', pos, 'type:', node.type.name);

  return { node, pos };
}

/**
 * Delete a node by its index
 */
export function deleteNodeByIndex(state: EditorState, nodeIndex: number): EditorState | null {
  const nodeInfo = findNodeByIndex(state.doc, nodeIndex);

  if (!nodeInfo) {
    console.error('Node not found at index:', nodeIndex);
    return null;
  }

  console.log('[deleteNodeByIndex] Deleting node at pos:', nodeInfo.pos, 'size:', nodeInfo.node.nodeSize);
  console.log('[deleteNodeByIndex] Node type:', nodeInfo.node.type.name, 'content:', nodeInfo.node.textContent.substring(0, 50));

  const tr = state.tr;

  // Delete the node
  tr.delete(nodeInfo.pos, nodeInfo.pos + nodeInfo.node.nodeSize);

  // Apply transaction
  const newState = state.apply(tr);

  console.log('[deleteNodeByIndex] Document before:', state.doc.content.childCount, 'children');
  console.log('[deleteNodeByIndex] Document after:', newState.doc.content.childCount, 'children');

  if (newState.doc.content.childCount > 0) {
    const firstNode = newState.doc.content.child(0);
    console.log('[deleteNodeByIndex] First node after deletion:', firstNode.type.name, firstNode.textContent.substring(0, 50));
  }

  return newState;
}

/**
 * Delete a node at a specific position (legacy, prefer deleteNodeByIndex)
 */
export function deleteNode(state: EditorState, pos: number, nodeSize: number): EditorState {
  const tr = state.tr;

  // Delete the node
  tr.delete(pos, pos + nodeSize);

  // Apply transaction
  return state.apply(tr);
}

/**
 * Update text content of a node by its index
 */
export function updateNodeTextByIndex(
  state: EditorState,
  nodeIndex: number,
  newText: string
): EditorState | null {
  const nodeInfo = findNodeByIndex(state.doc, nodeIndex);

  if (!nodeInfo) {
    console.error('Node not found at index:', nodeIndex);
    return null;
  }

  const tr = state.tr;
  const node = nodeInfo.node;

  // Create new node with updated text
  let newNode: ProseMirrorNode;

  if (node.type === schema.nodes.paragraph) {
    // For paragraphs, replace with new paragraph containing text
    newNode = schema.node('paragraph', node.attrs, [schema.text(newText)]);
  } else if (node.type === schema.nodes.heading) {
    // For headings, preserve level
    newNode = schema.node('heading', node.attrs, [schema.text(newText)]);
  } else {
    // For other nodes, try to preserve type
    try {
      newNode = schema.node(node.type, node.attrs, [schema.text(newText)]);
    } catch (error) {
      console.error('Error creating new node:', error);
      return null;
    }
  }

  // Replace the node
  tr.replaceWith(nodeInfo.pos, nodeInfo.pos + node.nodeSize, newNode);

  // Apply transaction
  return state.apply(tr);
}

/**
 * Update text content of a node (legacy, prefer updateNodeTextByIndex)
 */
export function updateNodeText(
  state: EditorState,
  pos: number,
  nodeSize: number,
  newText: string
): EditorState {
  const tr = state.tr;
  const node = state.doc.nodeAt(pos);

  if (!node) {
    console.error('Node not found at position:', pos);
    return state;
  }

  // Create new node with updated text
  let newNode: ProseMirrorNode;

  if (node.type === schema.nodes.paragraph) {
    // For paragraphs, replace with new paragraph containing text
    newNode = schema.node('paragraph', node.attrs, [schema.text(newText)]);
  } else if (node.type === schema.nodes.heading) {
    // For headings, preserve level
    newNode = schema.node('heading', node.attrs, [schema.text(newText)]);
  } else {
    // For other nodes, try to preserve type
    try {
      newNode = schema.node(node.type, node.attrs, [schema.text(newText)]);
    } catch (error) {
      console.error('Error creating new node:', error);
      return state;
    }
  }

  // Replace the node
  tr.replaceWith(pos, pos + nodeSize, newNode);

  // Apply transaction
  return state.apply(tr);
}

/**
 * Insert a new node at a specific position
 */
export function insertNode(
  state: EditorState,
  pos: number,
  nodeType: 'paragraph' | 'heading',
  content: string,
  attrs: any = {}
): EditorState {
  const tr = state.tr;

  let newNode: ProseMirrorNode;

  if (nodeType === 'paragraph') {
    newNode = schema.node('paragraph', attrs, [schema.text(content)]);
  } else if (nodeType === 'heading') {
    newNode = schema.node('heading', { level: 2, ...attrs }, [schema.text(content)]);
  } else {
    // Default to paragraph
    newNode = schema.node('paragraph', attrs, [schema.text(content)]);
  }

  // Insert the node
  tr.insert(pos, newNode);

  // Apply transaction
  return state.apply(tr);
}

/**
 * Update geo-mark attributes
 */
export function updateGeoMark(
  state: EditorState,
  pos: number,
  attrs: Partial<{
    lat: string;
    lng: string;
    placeName: string;
    description: string;
    photoName: string;
  }>
): EditorState {
  const tr = state.tr;
  const node = state.doc.nodeAt(pos);

  if (!node || node.type !== schema.nodes.geoMark) {
    console.error('No geo-mark found at position:', pos);
    return state;
  }

  // Update attributes
  const newAttrs = { ...node.attrs, ...attrs };
  tr.setNodeMarkup(pos, null, newAttrs);

  // Apply transaction
  return state.apply(tr);
}

/**
 * Find all nodes that match a predicate
 */
export function findNodes(
  doc: ProseMirrorNode,
  predicate: (node: ProseMirrorNode) => boolean
): Array<{ node: ProseMirrorNode; pos: number }> {
  const results: Array<{ node: ProseMirrorNode; pos: number }> = [];

  doc.descendants((node, pos) => {
    if (predicate(node)) {
      results.push({ node, pos });
    }
  });

  return results;
}

/**
 * Find node at specific position
 */
export function findNodeAtPos(
  doc: ProseMirrorNode,
  targetPos: number
): { node: ProseMirrorNode; pos: number } | null {
  let result: { node: ProseMirrorNode; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (pos === targetPos) {
      result = { node, pos };
      return false; // Stop searching
    }
  });

  return result;
}

/**
 * Apply multiple transactions in sequence
 */
export function applyTransactions(
  state: EditorState,
  transactions: ((state: EditorState) => Transaction)[]
): EditorState {
  let newState = state;

  for (const createTr of transactions) {
    const tr = createTr(newState);
    newState = newState.apply(tr);
  }

  return newState;
}

/**
 * Convert EditorState to JSON for storage
 */
export function stateToJSON(state: EditorState): any {
  return state.doc.toJSON();
}

/**
 * Create EditorState from JSON
 */
export function stateFromJSON(json: any): EditorState {
  try {
    const doc = schema.nodeFromJSON(json);
    return EditorState.create({
      doc,
      schema
    });
  } catch (error) {
    console.error('Error creating state from JSON:', error);
    // Return empty state as fallback
    return EditorState.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('paragraph', null, [])
      ])
    });
  }
}