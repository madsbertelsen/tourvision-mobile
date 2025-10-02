import { EditorState, Transaction, NodeSelection } from 'prosemirror-state';
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
 * Delete a node by its index using proper ProseMirror NodeSelection
 */
export function deleteNodeByIndex(state: EditorState, nodeIndex: number): EditorState | null {
  const nodeInfo = findNodeByIndex(state.doc, nodeIndex);

  if (!nodeInfo) {
    console.error('Node not found at index:', nodeIndex);
    return null;
  }

  console.log('[deleteNodeByIndex] Deleting node at pos:', nodeInfo.pos, 'size:', nodeInfo.node.nodeSize);
  console.log('[deleteNodeByIndex] Node type:', nodeInfo.node.type.name, 'content:', nodeInfo.node.textContent.substring(0, 50));
  console.log('[deleteNodeByIndex] Document before:', state.doc.content.childCount, 'children');

  try {
    // Create a NodeSelection for the target node
    const selection = NodeSelection.create(state.doc, nodeInfo.pos);

    // Create a transaction with the node selection
    const tr = state.tr.setSelection(selection);

    // Delete the selected node using deleteSelection
    tr.deleteSelection();

    // Apply the transaction
    const newState = state.apply(tr);

    console.log('[deleteNodeByIndex] Document after:', newState.doc.content.childCount, 'children');

    if (newState.doc.content.childCount > 0) {
      const firstNode = newState.doc.content.child(0);
      console.log('[deleteNodeByIndex] First node after deletion:', firstNode.type.name, firstNode.textContent.substring(0, 50));
    } else {
      console.log('[deleteNodeByIndex] Document is now empty');
    }

    return newState;
  } catch (error) {
    console.error('[deleteNodeByIndex] Error creating NodeSelection:', error);

    // Fallback to range deletion if NodeSelection fails
    console.log('[deleteNodeByIndex] Falling back to range deletion');
    const tr = state.tr;

    // Use ReplaceStep with empty content instead of delete
    const from = nodeInfo.pos;
    const to = nodeInfo.pos + nodeInfo.node.nodeSize;

    // Replace the range with nothing (effectively deleting it)
    tr.replace(from, to);

    // Apply transaction
    const newState = state.apply(tr);

    console.log('[deleteNodeByIndex] Document after fallback:', newState.doc.content.childCount, 'children');

    return newState;
  }
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
 * Update text content of a node by its index using proper ProseMirror patterns
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

  console.log('[updateNodeTextByIndex] Updating node at index:', nodeIndex, 'pos:', nodeInfo.pos);
  console.log('[updateNodeTextByIndex] Old text:', nodeInfo.node.textContent.substring(0, 50));
  console.log('[updateNodeTextByIndex] New text:', newText.substring(0, 50));

  const tr = state.tr;
  const node = nodeInfo.node;

  try {
    // Create new node with updated text, preserving type and attributes
    let newContent;

    // Handle different node types appropriately
    if (node.isText) {
      newContent = [schema.text(newText)];
    } else if (node.type === schema.nodes.paragraph ||
               node.type === schema.nodes.heading ||
               (node.isBlock && node.type.spec.content === 'inline*')) {
      // For block nodes that can contain text
      newContent = newText ? [schema.text(newText)] : [];
    } else {
      // For complex nodes, try to preserve structure
      newContent = node.content.size > 0 ? [schema.text(newText)] : [];
    }

    // Create the new node with the same type and attributes
    const newNode = node.type.create(node.attrs, newContent, node.marks);

    // Use replaceWith to replace the node at the correct position
    tr.replaceWith(nodeInfo.pos, nodeInfo.pos + node.nodeSize, newNode);

    // Apply transaction
    const newState = state.apply(tr);

    console.log('[updateNodeTextByIndex] Update successful');

    return newState;
  } catch (error) {
    console.error('[updateNodeTextByIndex] Error updating node:', error);

    // Fallback: Try to replace just the content inside the node
    try {
      const from = nodeInfo.pos + 1; // Skip the node opening
      const to = nodeInfo.pos + node.nodeSize - 1; // Skip the node closing

      // Replace the content inside the node
      tr.replaceWith(from, to, newText ? [schema.text(newText)] : []);

      const newState = state.apply(tr);
      console.log('[updateNodeTextByIndex] Fallback update successful');

      return newState;
    } catch (fallbackError) {
      console.error('[updateNodeTextByIndex] Fallback also failed:', fallbackError);
      return null;
    }
  }
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