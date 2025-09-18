// Simplified diff utilities for Edge Function (Deno-compatible)

export interface DiffOperation {
  type: 'insert' | 'delete' | 'replace';
  path: number[];
  oldValue?: any;
  newValue?: any;
}

export interface DiffDecoration {
  from: number;
  to: number;
  type: 'addition' | 'deletion' | 'modification';
  content?: string;
}

/**
 * Generate diff operations between two documents
 */
export function generateDiffOperations(
  currentDoc: any,
  proposedDoc: any
): DiffOperation[] {
  const operations: DiffOperation[] = [];

  // Ensure both docs have content arrays
  const currentContent = currentDoc?.content || [];
  const proposedContent = proposedDoc?.content || [];

  // Track what we've processed
  const processedCurrent = new Set<number>();
  const processedProposed = new Set<number>();

  // Find matches and modifications
  proposedContent.forEach((proposedNode: any, propIndex: number) => {
    let foundMatch = false;

    currentContent.forEach((currentNode: any, currIndex: number) => {
      if (processedCurrent.has(currIndex)) return;

      if (nodesAreSimilar(currentNode, proposedNode)) {
        foundMatch = true;
        processedCurrent.add(currIndex);
        processedProposed.add(propIndex);

        if (!deepEqual(currentNode, proposedNode)) {
          // Node was modified
          operations.push({
            type: 'replace',
            path: [currIndex],
            oldValue: currentNode,
            newValue: proposedNode,
          });
        }
      }
    });

    if (!foundMatch) {
      // This is a new node
      operations.push({
        type: 'insert',
        path: [propIndex],
        newValue: proposedNode,
      });
    }
  });

  // Find deletions
  currentContent.forEach((currentNode: any, currIndex: number) => {
    if (!processedCurrent.has(currIndex)) {
      operations.push({
        type: 'delete',
        path: [currIndex],
        oldValue: currentNode,
      });
    }
  });

  return operations;
}

/**
 * Create proposed content with minimal changes
 */
export function createMinimalProposedContent(
  currentDoc: any,
  aiSuggestion: any
): { proposedDoc: any; operations: DiffOperation[]; decorations: DiffDecoration[] } {
  // Clone current document
  const proposedDoc = JSON.parse(JSON.stringify(currentDoc || { type: 'doc', content: [] }));

  if (!proposedDoc.content) {
    proposedDoc.content = [];
  }

  const operations: DiffOperation[] = [];
  const decorations: DiffDecoration[] = [];

  // Create the new content to add
  const newContent = {
    type: 'heading',
    attrs: { level: 2 },
    content: [{ type: 'text', text: aiSuggestion.title || 'New Section' }]
  };

  const descContent = {
    type: 'paragraph',
    content: [{ type: 'text', text: aiSuggestion.description || '' }]
  };

  // Add operations for the new content
  const insertIndex = proposedDoc.content.length;

  operations.push({
    type: 'insert',
    path: [insertIndex],
    newValue: newContent
  });

  operations.push({
    type: 'insert',
    path: [insertIndex + 1],
    newValue: descContent
  });

  // For decorations in an empty or nearly empty document, we need to use positions that exist
  // The document always has at least positions 0 to doc.nodeSize (usually 2 for empty doc)
  const currentDocSize = calculateDocumentSize(currentDoc);

  // For insertions at the end of the document, show decoration at the last valid position
  if (currentDocSize <= 2) {
    // Document is empty or nearly empty - use a single decoration at the end
    decorations.push({
      from: 1,
      to: 1,
      type: 'addition',
      content: `${aiSuggestion.title}: ${aiSuggestion.description}`
    });
  } else {
    // Document has content - calculate actual position
    const position = calculateApproximatePosition(currentDoc, insertIndex);
    const endPosition = Math.min(
      currentDocSize - 1,
      position + estimateNodeSize(newContent) + estimateNodeSize(descContent)
    );

    decorations.push({
      from: Math.max(1, Math.min(position, currentDocSize - 1)),
      to: Math.max(1, Math.min(endPosition, currentDocSize - 1)),
      type: 'addition',
      content: `${aiSuggestion.title}: ${aiSuggestion.description}`
    });
  }

  // Add the content to proposed doc for visualization
  proposedDoc.content.push(newContent, descContent);

  // Add quick facts if available
  if (aiSuggestion.enriched_data?.quick_facts?.length) {
    const factsContent = {
      type: 'bulletList',
      content: aiSuggestion.enriched_data.quick_facts.map((fact: string) => ({
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: fact }]
        }]
      }))
    };

    operations.push({
      type: 'insert',
      path: [insertIndex + 2],
      newValue: factsContent
    });

    proposedDoc.content.push(factsContent);
  }

  return { proposedDoc, operations, decorations };
}

// Helper functions
function nodesAreSimilar(a: any, b: any): boolean {
  // Check if nodes are similar enough to be considered the same
  if (a?.type !== b?.type) return false;

  // For headings, check the text content
  if (a.type === 'heading' || a.type === 'paragraph') {
    const textA = extractText(a);
    const textB = extractText(b);

    // If text is >70% similar, consider them the same node
    return calculateSimilarity(textA, textB) > 0.7;
  }

  return false;
}

function extractText(node: any): string {
  if (node?.text) return node.text;
  if (node?.content && Array.isArray(node.content)) {
    return node.content.map((child: any) => extractText(child)).join(' ');
  }
  return '';
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

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

function calculateApproximatePosition(doc: any, nodeIndex: number): number {
  let position = 1;
  const content = doc.content || [];

  for (let i = 0; i < nodeIndex && i < content.length; i++) {
    position += estimateNodeSize(content[i]);
  }

  return position;
}

function estimateNodeSize(node: any): number {
  if (!node) return 0;

  let size = 2; // Node markers

  if (node.content && Array.isArray(node.content)) {
    node.content.forEach((child: any) => {
      size += estimateNodeSize(child);
    });
  } else if (node.text) {
    size += node.text.length;
  }

  return size;
}

function calculateDocumentSize(doc: any): number {
  if (!doc) return 2; // Empty doc has size 2

  // Check if this is an empty document (just has an empty paragraph)
  // TipTap reports this as size 2
  if (doc.content && doc.content.length === 1 &&
      doc.content[0].type === 'paragraph' &&
      (!doc.content[0].content || doc.content[0].content.length === 0)) {
    return 2;
  }

  let size = 2; // Document node itself

  if (doc.content && Array.isArray(doc.content)) {
    doc.content.forEach((node: any) => {
      const nodeSize = estimateNodeSize(node);
      // Only add size if the node actually has content
      if (node.type === 'paragraph' && (!node.content || node.content.length === 0)) {
        // Empty paragraphs don't add to the size in TipTap
        // Skip adding anything
      } else {
        size += nodeSize;
      }
    });
  }

  return size;
}