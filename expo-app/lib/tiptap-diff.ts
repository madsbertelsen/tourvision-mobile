import { JSONContent } from '@tiptap/react';

export interface DiffOperation {
  type: 'insert' | 'delete' | 'replace';
  path: number[];
  oldValue?: any;
  newValue?: any;
  from?: number;
  to?: number;
}

export interface DiffDecoration {
  from: number;
  to: number;
  type: 'addition' | 'deletion' | 'modification';
  content?: string;
}

/**
 * Generate diff operations between two TipTap documents
 */
export function generateDiffOperations(
  currentDoc: JSONContent,
  proposedDoc: JSONContent
): DiffOperation[] {
  const operations: DiffOperation[] = [];

  // Simple implementation - compare content arrays
  const currentContent = currentDoc.content || [];
  const proposedContent = proposedDoc.content || [];

  // Find additions
  proposedContent.forEach((node, index) => {
    if (!currentContent[index] || !deepEqual(currentContent[index], node)) {
      operations.push({
        type: currentContent[index] ? 'replace' : 'insert',
        path: [index],
        oldValue: currentContent[index],
        newValue: node,
      });
    }
  });

  // Find deletions
  currentContent.forEach((node, index) => {
    if (!proposedContent[index]) {
      operations.push({
        type: 'delete',
        path: [index],
        oldValue: node,
      });
    }
  });

  return operations;
}

/**
 * Convert diff operations to decorations for visualization
 */
export function operationsToDecorations(
  operations: DiffOperation[],
  doc: JSONContent
): DiffDecoration[] {
  const decorations: DiffDecoration[] = [];
  let position = 0;

  // Calculate positions for each operation
  operations.forEach((op) => {
    const nodeIndex = op.path[0];
    let nodePosition = calculateNodePosition(doc, nodeIndex);

    if (op.type === 'insert') {
      decorations.push({
        from: nodePosition,
        to: nodePosition + getNodeSize(op.newValue),
        type: 'addition',
        content: getNodeText(op.newValue),
      });
    } else if (op.type === 'delete') {
      decorations.push({
        from: nodePosition,
        to: nodePosition + getNodeSize(op.oldValue),
        type: 'deletion',
        content: getNodeText(op.oldValue),
      });
    } else if (op.type === 'replace') {
      decorations.push({
        from: nodePosition,
        to: nodePosition + getNodeSize(op.oldValue),
        type: 'modification',
        content: getNodeText(op.newValue),
      });
    }
  });

  return decorations;
}

/**
 * Apply diff operations to a document
 */
export function applyDiffOperations(
  doc: JSONContent,
  operations: DiffOperation[]
): JSONContent {
  const newDoc = JSON.parse(JSON.stringify(doc)); // Deep clone
  const content = newDoc.content || [];

  // Sort operations by path in reverse order to maintain indices
  const sortedOps = [...operations].sort((a, b) => b.path[0] - a.path[0]);

  sortedOps.forEach((op) => {
    const index = op.path[0];

    if (op.type === 'insert') {
      content.splice(index, 0, op.newValue);
    } else if (op.type === 'delete') {
      content.splice(index, 1);
    } else if (op.type === 'replace') {
      content[index] = op.newValue;
    }
  });

  newDoc.content = content;
  return newDoc;
}

/**
 * Create a visual diff representation as HTML
 */
export function createDiffHTML(
  currentDoc: JSONContent,
  operations: DiffOperation[]
): string {
  let html = '<div class="diff-container">';

  operations.forEach((op) => {
    if (op.type === 'insert') {
      html += `<span class="diff-addition">+ ${getNodeText(op.newValue)}</span>`;
    } else if (op.type === 'delete') {
      html += `<span class="diff-deletion">- ${getNodeText(op.oldValue)}</span>`;
    } else if (op.type === 'replace') {
      html += `<span class="diff-deletion">- ${getNodeText(op.oldValue)}</span>`;
      html += `<span class="diff-addition">+ ${getNodeText(op.newValue)}</span>`;
    }
  });

  html += '</div>';
  return html;
}

// Helper functions
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(key => deepEqual(a[key], b[key]));
  }

  return false;
}

function calculateNodePosition(doc: JSONContent, nodeIndex: number): number {
  let position = 1; // Start at 1 (document start)
  const content = doc.content || [];

  for (let i = 0; i < nodeIndex && i < content.length; i++) {
    position += getNodeSize(content[i]);
  }

  return position;
}

function getNodeSize(node: any): number {
  if (!node) return 0;

  // Simplified size calculation
  let size = 2; // Node open + close tags

  if (node.content && Array.isArray(node.content)) {
    node.content.forEach((child: any) => {
      size += getNodeSize(child);
    });
  } else if (node.text) {
    size += node.text.length;
  }

  return size;
}

function getNodeText(node: any): string {
  if (!node) return '';

  if (node.text) {
    return node.text;
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map((child: any) => getNodeText(child)).join(' ');
  }

  return '';
}

/**
 * Merge diff decorations with existing decorations
 */
export function mergeDiffDecorations(
  existingDecorations: DiffDecoration[],
  newDecorations: DiffDecoration[]
): DiffDecoration[] {
  // Remove overlapping decorations
  const merged = [...existingDecorations];

  newDecorations.forEach((newDeco) => {
    // Check for overlaps
    const overlapping = merged.findIndex(
      (existing) =>
        (newDeco.from >= existing.from && newDeco.from <= existing.to) ||
        (newDeco.to >= existing.from && newDeco.to <= existing.to)
    );

    if (overlapping >= 0) {
      // Replace overlapping decoration
      merged[overlapping] = newDeco;
    } else {
      merged.push(newDeco);
    }
  });

  return merged.sort((a, b) => a.from - b.from);
}