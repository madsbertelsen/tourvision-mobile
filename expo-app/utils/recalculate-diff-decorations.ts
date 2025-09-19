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
  console.log('recalculateDiffDecorations - Proposal type:', proposal.proposal_type || proposal.request_type);
  console.log('recalculateDiffDecorations - Has proposed_content:', !!proposal.proposed_content);

  // Calculate the actual size of the current document
  const docSize = calculateDocumentSize(currentDocument);
  console.log('recalculateDiffDecorations - Current document size:', docSize);

  // If we have the original proposed content, we can be more precise
  if (proposal.proposed_content) {
    // This proposal has both old and new content, so we can compute a real diff
    return computeContentDiff(currentDocument, proposal.proposed_content, proposal);
  }

  // Fallback: For simple additions, place at the end of the document
  if (proposal.proposal_type === 'add' || proposal.request_type === 'add') {
    // For additions, we want to show where content will be added
    // Place it at the end of the current document
    const position = Math.max(1, docSize - 1);

    // Extract the actual content that will be added from proposed_content if available
    let contentToShow = proposal.title + ': ' + proposal.description;
    if (proposal.proposed_content) {
      contentToShow = extractNewContent(currentDocument, proposal.proposed_content);
    }

    return [{
      from: position,
      to: position,
      type: 'addition',
      content: contentToShow
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

  // Check if content is being added (proposed doc is longer)
  const currentContent = currentDoc.content || [];
  const proposedContent = proposedDoc.content || [];

  if (proposedContent.length > currentContent.length) {
    // Content is being added - we need to find where in the proposed doc
    // the new content is and calculate its range

    // Find the new nodes
    const newNodeIndices: number[] = [];
    for (let i = currentContent.length; i < proposedContent.length; i++) {
      newNodeIndices.push(i);
    }

    // Calculate the positions of these new nodes in the proposed document
    let position = 0;
    // Account for doc node
    position += 1;

    // Calculate position up to where new content starts
    for (let i = 0; i < currentContent.length && i < proposedContent.length; i++) {
      position += calculateNodeSize(proposedContent[i]);
    }

    // Now calculate the range of the new content
    const startPos = position;
    let endPos = startPos;

    for (const idx of newNodeIndices) {
      if (idx < proposedContent.length) {
        endPos += calculateNodeSize(proposedContent[idx]);
      }
    }

    // Extract text for display
    const newContent = extractNewContent(currentDoc, proposedDoc);

    decorations.push({
      from: startPos,
      to: endPos,
      type: 'addition',
      content: newContent,
      isNewContent: true,  // Flag to indicate this is entirely new content
      proposedNodes: newNodeIndices.map(i => proposedContent[i])  // Store the actual nodes
    } as any);
  } else if (proposedContent.length < currentContent.length) {
    // Content is being removed
    decorations.push({
      from: 1,
      to: Math.max(1, docSize - 1),
      type: 'deletion',
      content: 'Removing: ' + proposal.description
    });
  } else {
    // Content is being modified - show the actual changes
    const modifiedContent = extractModifiedContent(currentDoc, proposedDoc);
    decorations.push({
      from: 1,
      to: Math.max(1, docSize - 1),
      type: 'modification',
      content: modifiedContent || (proposal.title + ': ' + proposal.description)
    });
  }

  return decorations;
}

/**
 * Extracts the actual new content being added
 */
function extractNewContent(currentDoc: JSONContent, proposedDoc: JSONContent): string {
  const currentContent = currentDoc.content || [];
  const proposedContent = proposedDoc.content || [];

  // Find the new nodes that don't exist in current
  const newNodes: any[] = [];

  // Simple approach: get nodes that are in proposed but not in current
  // (comparing by index for now)
  for (let i = currentContent.length; i < proposedContent.length; i++) {
    newNodes.push(proposedContent[i]);
  }

  // Extract text from the new nodes
  const textParts: string[] = [];
  for (const node of newNodes) {
    const text = extractTextFromNode(node);
    if (text) {
      textParts.push(text);
    }
  }

  return textParts.join('\n\n') || 'New content';
}

/**
 * Extracts modified content for comparison
 */
function extractModifiedContent(currentDoc: JSONContent, proposedDoc: JSONContent): string {
  // For now, just extract all text from proposed that's different
  const proposedText = extractTextFromNode(proposedDoc);
  const currentText = extractTextFromNode(currentDoc);

  if (proposedText !== currentText) {
    // Find the difference (simplified)
    const proposedLines = proposedText.split('\n');
    const currentLines = currentText.split('\n');

    // Find new lines
    const newLines = proposedLines.filter(line => !currentLines.includes(line));

    if (newLines.length > 0) {
      return newLines.join('\n');
    }
  }

  return proposedText;
}

/**
 * Recursively extracts text from a node
 */
function extractTextFromNode(node: any): string {
  if (!node) return '';

  if (node.type === 'text') {
    return node.text || '';
  }

  if (node.content && Array.isArray(node.content)) {
    const textParts: string[] = [];
    for (const child of node.content) {
      const childText = extractTextFromNode(child);
      if (childText) {
        textParts.push(childText);
      }
    }
    return textParts.join('');
  }

  return '';
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