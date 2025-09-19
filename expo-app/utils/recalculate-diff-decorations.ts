import { JSONContent } from '@tiptap/react';

export interface DiffDecoration {
  from: number;
  to: number;
  type: 'addition' | 'deletion' | 'modification';
  content?: string;
}

/**
 * Recalculates diff decorations based on the current document size.
 * This ensures decorations are always within valid document bounds.
 */
export function recalculateDiffDecorations(
  currentDocument: JSONContent,
  proposal: any
): DiffDecoration[] {
  console.log('recalculateDiffDecorations - Starting recalculation');

  // Calculate the actual size of the current document
  const docSize = calculateDocumentSize(currentDocument);
  console.log('recalculateDiffDecorations - Current document size:', docSize);

  // If we have the original proposed content, we can be more precise
  if (proposal.proposed_content && proposal.current_content) {
    // This proposal has both old and new content, so we can compute a real diff
    return computeContentDiff(currentDocument, proposal.proposed_content, proposal);
  }

  // Fallback: For simple additions, place at the end of the document
  if (proposal.proposal_type === 'add' || proposal.request_type === 'add') {
    // For additions, we want to show where content will be added
    // Place it at the end of the current document
    const position = Math.max(1, docSize - 1);

    return [{
      from: position,
      to: position,
      type: 'addition',
      content: proposal.title + ': ' + proposal.description
    }];
  }

  // For modifications or other types, try to find relevant content
  if (proposal.proposal_type === 'modify' || proposal.request_type === 'modify') {
    // For now, highlight the entire document as potentially modified
    return [{
      from: 1,
      to: Math.max(1, docSize - 1),
      type: 'modification',
      content: proposal.title + ': ' + proposal.description
    }];
  }

  // Default: show as addition at the end
  const position = Math.max(1, docSize - 1);
  return [{
    from: position,
    to: position,
    type: 'addition',
    content: proposal.title + ': ' + proposal.description
  }];
}

/**
 * Computes diff between current document and proposed changes
 */
function computeContentDiff(
  currentDoc: JSONContent,
  proposedDoc: JSONContent,
  proposal: any
): DiffDecoration[] {
  const decorations: DiffDecoration[] = [];

  // Get the document size
  const docSize = calculateDocumentSize(currentDoc);

  // For now, create a simple decoration showing where changes will occur
  // In a real implementation, this would do a proper diff

  // Check if content is being added (proposed doc is longer)
  const proposedSize = calculateDocumentSize(proposedDoc);
  const currentContent = currentDoc.content || [];
  const proposedContent = proposedDoc.content || [];

  if (proposedContent.length > currentContent.length) {
    // Content is being added - show at the end of current document
    const position = Math.max(1, docSize - 1);
    decorations.push({
      from: position,
      to: position,
      type: 'addition',
      content: proposal.title + ': ' + proposal.description
    });
  } else if (proposedContent.length < currentContent.length) {
    // Content is being removed
    decorations.push({
      from: 1,
      to: Math.max(1, docSize - 1),
      type: 'deletion',
      content: 'Removing: ' + proposal.description
    });
  } else {
    // Content is being modified
    decorations.push({
      from: 1,
      to: Math.max(1, docSize - 1),
      type: 'modification',
      content: proposal.title + ': ' + proposal.description
    });
  }

  return decorations;
}

/**
 * Calculate the size of a ProseMirror document
 */
function calculateDocumentSize(doc: JSONContent): number {
  if (!doc) return 2; // Empty doc has size 2

  let size = 0;

  // Node opening and closing marks
  size += 2;

  // Process content
  if (doc.content && Array.isArray(doc.content)) {
    for (const node of doc.content) {
      size += calculateNodeSize(node);
    }
  }

  return size;
}

/**
 * Calculate the size of a single node
 */
function calculateNodeSize(node: any): number {
  if (!node) return 0;

  let size = 0;

  // Node markers (opening and closing)
  size += 2;

  if (node.type === 'text') {
    // Text nodes have the length of their text
    size = node.text ? node.text.length : 0;
    // No additional markers for text nodes
    return size;
  }

  // Process child content
  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      size += calculateNodeSize(child);
    }
  }

  return size;
}