import { EditorState, Transaction, NodeSelection } from 'prosemirror-state';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { schema, findNodeById } from './prosemirror-schema';

/**
 * Generate a unique node ID
 */
function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Find a block node by its index (0-based)
 * This counts only direct children of the document
 * Returns the node and its position (the position before the node)
 */
export function findNodeByIndex(doc: ProseMirrorNode, targetIndex: number): { node: ProseMirrorNode; pos: number; from: number; to: number } | null {
  // Check if target index is valid
  if (targetIndex < 0 || targetIndex >= doc.content.childCount) {
    console.error('[findNodeByIndex] Index out of bounds:', targetIndex, 'doc has', doc.content.childCount, 'children');
    return null;
  }

  // Calculate the position by iterating through children
  let pos = 1; // Start at 1 (after the doc node opening)

  for (let i = 0; i < targetIndex; i++) {
    const child = doc.content.child(i);
    pos += child.nodeSize;
  }

  // Get the target node
  const node = doc.content.child(targetIndex);

  // The 'from' position is where the node starts
  const from = pos;
  // The 'to' position is where the node ends
  const to = pos + node.nodeSize;

  console.log('[findNodeByIndex] Found node at index', targetIndex);
  console.log('[findNodeByIndex]   -> pos:', pos, 'from:', from, 'to:', to);
  console.log('[findNodeByIndex]   -> type:', node.type.name, 'size:', node.nodeSize);
  console.log('[findNodeByIndex]   -> content:', node.textContent.substring(0, 50));

  return { node, pos, from, to };
}

/**
 * Delete a node by its unique ID attribute
 */
export function deleteNodeById(state: EditorState, nodeId: string): EditorState | null {
  const result = findNodeById(state.doc, nodeId);

  if (!result) {
    console.error('[deleteNodeById] Node not found with ID:', nodeId);
    return null;
  }

  const { node, pos } = result;

  console.log('[deleteNodeById] Deleting node with ID:', nodeId);
  console.log('[deleteNodeById]   -> pos:', pos, 'size:', node.nodeSize);
  console.log('[deleteNodeById]   -> type:', node.type.name);
  console.log('[deleteNodeById]   -> content:', node.textContent.substring(0, 50));
  console.log('[deleteNodeById] Document before:', state.doc.content.childCount, 'children');

  const tr = state.tr;

  // Delete using the correct from and to positions
  const from = pos;
  const to = pos + node.nodeSize;
  tr.delete(from, to);

  // Apply the transaction
  const newState = state.apply(tr);

  console.log('[deleteNodeById] Document after:', newState.doc.content.childCount, 'children');

  if (newState.doc.content.childCount > 0) {
    const firstNode = newState.doc.content.child(0);
    console.log('[deleteNodeById] First node after deletion:', firstNode.type.name, firstNode.textContent.substring(0, 50));
  } else {
    console.log('[deleteNodeById] Document is now empty');
  }

  return newState;
}

/**
 * Update text content of a node by its unique ID
 */
export function updateNodeTextById(
  state: EditorState,
  nodeId: string,
  newText: string
): EditorState | null {
  const result = findNodeById(state.doc, nodeId);

  if (!result) {
    console.error('[updateNodeTextById] Node not found with ID:', nodeId);
    return null;
  }

  const { node, pos } = result;

  console.log('[updateNodeTextById] Updating node with ID:', nodeId);
  console.log('[updateNodeTextById]   -> pos:', pos, 'size:', node.nodeSize);
  console.log('[updateNodeTextById]   -> old text:', node.textContent.substring(0, 50));
  console.log('[updateNodeTextById]   -> new text:', newText.substring(0, 50));

  const tr = state.tr;

  try {
    // Create new node with updated text, preserving type and ID
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

    // Create the new node with the same type, preserving the ID attribute
    const newAttrs = { ...node.attrs };
    if (!newAttrs.id) {
      // If the node doesn't have an ID yet, generate one
      newAttrs.id = generateNodeId();
    }
    const newNode = node.type.create(newAttrs, newContent, node.marks);

    // Use replaceWith to replace the node at the correct positions
    const from = pos;
    const to = pos + node.nodeSize;
    tr.replaceWith(from, to, newNode);

    // Apply transaction
    const newState = state.apply(tr);

    console.log('[updateNodeTextById] Update successful');

    return newState;
  } catch (error) {
    console.error('[updateNodeTextById] Error updating node:', error);
    return null;
  }
}

/**
 * Delete a node by its index using proper ProseMirror positions
 */
export function deleteNodeByIndex(state: EditorState, nodeIndex: number): EditorState | null {
  const nodeInfo = findNodeByIndex(state.doc, nodeIndex);

  if (!nodeInfo) {
    console.error('Node not found at index:', nodeIndex);
    return null;
  }

  console.log('[deleteNodeByIndex] Deleting node at index:', nodeIndex);
  console.log('[deleteNodeByIndex]   -> from:', nodeInfo.from, 'to:', nodeInfo.to);
  console.log('[deleteNodeByIndex]   -> type:', nodeInfo.node.type.name);
  console.log('[deleteNodeByIndex]   -> content:', nodeInfo.node.textContent.substring(0, 50));
  console.log('[deleteNodeByIndex] Document before:', state.doc.content.childCount, 'children');

  const tr = state.tr;

  // Delete using the correct from and to positions
  tr.delete(nodeInfo.from, nodeInfo.to);

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
 * Update text content of a node by its index using proper ProseMirror positions
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

  console.log('[updateNodeTextByIndex] Updating node at index:', nodeIndex);
  console.log('[updateNodeTextByIndex]   -> from:', nodeInfo.from, 'to:', nodeInfo.to);
  console.log('[updateNodeTextByIndex]   -> old text:', nodeInfo.node.textContent.substring(0, 50));
  console.log('[updateNodeTextByIndex]   -> new text:', newText.substring(0, 50));

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

    // Use replaceWith to replace the node at the correct positions
    tr.replaceWith(nodeInfo.from, nodeInfo.to, newNode);

    // Apply transaction
    const newState = state.apply(tr);

    console.log('[updateNodeTextByIndex] Update successful');

    return newState;
  } catch (error) {
    console.error('[updateNodeTextByIndex] Error updating node:', error);

    // Fallback: Try to replace just the content inside the node
    try {
      const contentFrom = nodeInfo.from + 1; // Skip the node opening
      const contentTo = nodeInfo.to - 1; // Skip the node closing

      // Replace the content inside the node
      tr.replaceWith(contentFrom, contentTo, newText ? [schema.text(newText)] : []);

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

  // Ensure the new node has an ID
  const nodeAttrs = {
    ...attrs,
    id: attrs.id || generateNodeId()
  };

  let newNode: ProseMirrorNode;

  if (nodeType === 'paragraph') {
    newNode = schema.node('paragraph', nodeAttrs, [schema.text(content)]);
  } else if (nodeType === 'heading') {
    newNode = schema.node('heading', { level: 2, ...nodeAttrs }, [schema.text(content)]);
  } else {
    // Default to paragraph
    newNode = schema.node('paragraph', nodeAttrs, [schema.text(content)]);
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
    // Ensure all block nodes have IDs before creating the document
    const ensureNodeIds = (nodeJson: any): any => {
      if (!nodeJson) return nodeJson;

      // If this is a block node without an ID, generate one
      if (nodeJson.type &&
          (nodeJson.type === 'paragraph' ||
           nodeJson.type === 'heading' ||
           nodeJson.type === 'blockquote' ||
           nodeJson.type === 'bulletList' ||
           nodeJson.type === 'orderedList')) {
        if (!nodeJson.attrs) {
          nodeJson.attrs = {};
        }
        if (!nodeJson.attrs.id) {
          nodeJson.attrs.id = generateNodeId();
          console.log('[stateFromJSON] Added ID to', nodeJson.type, 'node:', nodeJson.attrs.id);
        }
      }

      // Recursively process content
      if (nodeJson.content && Array.isArray(nodeJson.content)) {
        nodeJson.content = nodeJson.content.map(ensureNodeIds);
      }

      return nodeJson;
    };

    const processedJson = ensureNodeIds(json);
    const doc = schema.nodeFromJSON(processedJson);

    return EditorState.create({
      doc,
      schema
    });
  } catch (error) {
    console.error('Error creating state from JSON:', error);
    // Return empty state as fallback with ID
    return EditorState.create({
      schema,
      doc: schema.node('doc', null, [
        schema.node('paragraph', { id: generateNodeId() }, [])
      ])
    });
  }
}