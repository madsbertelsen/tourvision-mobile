// Simplified diff utilities for Edge Function (Deno-compatible)

// Known place names that should be marked as locations
const KNOWN_PLACES = [
  'Copenhagen', 'Paris', 'London', 'Berlin', 'Rome', 'Barcelona',
  'Amsterdam', 'Vienna', 'Prague', 'Stockholm', 'Oslo', 'Helsinki',
  'Tokyo', 'Kyoto', 'Bangkok', 'Singapore', 'Dubai', 'New York',
  'San Francisco', 'Los Angeles', 'Chicago', 'Boston', 'Miami'
];

/**
 * Check if text contains a known place name
 */
function shouldAddLocationMark(text: string): boolean {
  return KNOWN_PLACES.some(place =>
    text.toLowerCase().includes(place.toLowerCase())
  );
}

/**
 * Extract location data from text (simplified version)
 * In production, this would call a geocoding service
 */
function extractLocationDataFromText(text: string): any {
  // Find the first known place in the text
  const foundPlace = KNOWN_PLACES.find(place =>
    text.toLowerCase().includes(place.toLowerCase())
  );

  if (!foundPlace) {
    return null;
  }

  // Simplified coordinates - in production, use geocoding API
  const coordinates: Record<string, [number, number]> = {
    'copenhagen': [12.5683, 55.6761],
    'paris': [2.3522, 48.8566],
    'london': [-0.1276, 51.5074],
    'berlin': [13.4050, 52.5200],
    'rome': [12.4964, 41.9028],
    'barcelona': [2.1734, 41.3851],
    'amsterdam': [4.9041, 52.3676],
    'vienna': [16.3738, 48.2082],
    'prague': [14.4378, 50.0755],
    'stockholm': [18.0686, 59.3293],
    'oslo': [10.7522, 59.9139],
    'helsinki': [24.9384, 60.1695],
    'tokyo': [139.6503, 35.6762],
    'kyoto': [135.7681, 35.0116],
    'bangkok': [100.5018, 13.7563],
    'singapore': [103.8198, 1.3521],
    'dubai': [55.2708, 25.2048],
    'new york': [-74.0060, 40.7128],
    'san francisco': [-122.4194, 37.7749],
    'los angeles': [-118.2437, 34.0522],
    'chicago': [-87.6298, 41.8781],
    'boston': [-71.0589, 42.3601],
    'miami': [-80.1918, 25.7617]
  };

  const key = foundPlace.toLowerCase();
  const [longitude, latitude] = coordinates[key] || [0, 0];

  return {
    latitude,
    longitude,
    placeName: foundPlace,
    placeId: `place-${key}`,
    address: foundPlace
  };
}

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

  // Helper function to create text node with location marks if needed
  const createTextWithMarks = (text: string, locationData?: any) => {
    const textNode: any = { type: 'text', text };

    // Check if we should add location marks (if text contains place names)
    if (locationData || shouldAddLocationMark(text)) {
      textNode.marks = [{
        type: 'location',
        attrs: locationData || extractLocationDataFromText(text)
      }];
    }

    return textNode;
  };

  // Create the new content to add
  const newContent = {
    type: 'heading',
    attrs: { level: 2 },
    content: [createTextWithMarks(aiSuggestion.title || 'New Section', aiSuggestion.locationData)]
  };

  const descContent = {
    type: 'paragraph',
    content: [createTextWithMarks(aiSuggestion.description || '', aiSuggestion.descriptionLocationData)]
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