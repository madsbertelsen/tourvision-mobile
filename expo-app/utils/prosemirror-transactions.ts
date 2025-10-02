import { EditorState, Transaction } from 'prosemirror-state';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { schema } from './prosemirror-schema';

/**
 * Delete a node at a specific position
 */
export function deleteNode(state: EditorState, pos: number, nodeSize: number): EditorState {
  const tr = state.tr;

  // Delete the node
  tr.delete(pos, pos + nodeSize);

  // Apply transaction
  return state.apply(tr);
}

/**
 * Update text content of a node
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