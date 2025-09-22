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
 * Create proposed content with minimal changes and generate ProseMirror transaction steps
 */
export function createMinimalProposedContent(
  currentDoc: any,
  aiSuggestion: any
): {
  proposedDoc: any;
  operations: DiffOperation[];
  decorations: DiffDecoration[];
  transactionSteps?: any[];
  inverseSteps?: any[];
} {
  // Clone current document
  const proposedDoc = JSON.parse(JSON.stringify(currentDoc || { type: 'doc', content: [] }));

  if (!proposedDoc.content) {
    proposedDoc.content = [];
  }

  const operations: DiffOperation[] = [];
  const decorations: DiffDecoration[] = [];
  const transactionSteps: any[] = [];
  const inverseSteps: any[] = [];

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

  // Check if this is about Sagrada Familia specifically
  const isSagradaFamilia = aiSuggestion.title?.toLowerCase().includes('sagrada') ||
                          aiSuggestion.description?.toLowerCase().includes('sagrada');

  let newContent: any;

  if (isSagradaFamilia) {
    // Create a proper destination node for Sagrada Familia
    newContent = {
      type: 'destination',
      attrs: {
        id: 'sagrada-familia-' + Date.now(),
        name: 'Sagrada Familia',
        location: {
          lat: 41.4036,
          lng: 2.1744
        },
        arrivalTime: '09:00',
        departureTime: '12:00',
        duration: '3 hours',
        description: 'Visit Antoni Gaudí\'s architectural masterpiece',
        googlePlaceId: 'ChIJk_s92NyipBIRUMnDG8Kq2Js'
      },
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [
            { type: 'text', text: '🏛️ ' },
            {
              type: 'text',
              text: 'Sagrada Familia',
              marks: [{
                type: 'location',
                attrs: {
                  latitude: 41.4036,
                  longitude: 2.1744,
                  placeName: 'Sagrada Familia',
                  placeId: 'ChIJk_s92NyipBIRUMnDG8Kq2Js',
                  address: 'Carrer de Mallorca, 401, 08013 Barcelona'
                }
              }]
            }
          ]
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Start your Barcelona adventure at the iconic ' },
            {
              type: 'text',
              text: 'Sagrada Familia',
              marks: [{
                type: 'location',
                attrs: {
                  latitude: 41.4036,
                  longitude: 2.1744,
                  placeName: 'Sagrada Familia',
                  address: 'Carrer de Mallorca, 401'
                }
              }]
            },
            { type: 'text', text: ', Antoni Gaudí\'s unfinished masterpiece.' }
          ]
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [
                  { type: 'text', text: '⏰ Duration: 2-3 hours' }
                ]
              }]
            },
            {
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [
                  { type: 'text', text: '🎫 Book tickets online (€26-36)' }
                ]
              }]
            },
            {
              type: 'listItem',
              content: [{
                type: 'paragraph',
                content: [
                  { type: 'text', text: '🕐 Best time: 9 AM opening' }
                ]
              }]
            }
          ]
        }
      ]
    };
  } else {
    // Fallback to simple content for other suggestions
    const heading = {
      type: 'heading',
      attrs: { level: 2 },
      content: [createTextWithMarks(aiSuggestion.title || 'New Section', aiSuggestion.locationData)]
    };

    const paragraph = {
      type: 'paragraph',
      content: [createTextWithMarks(aiSuggestion.description || '', aiSuggestion.descriptionLocationData)]
    };

    newContent = [heading, paragraph];
  }

  // Add operations for the new content
  const insertIndex = proposedDoc.content.length;

  // Calculate the exact position in the document for the ProseMirror step
  const insertPosition = calculateDocumentSize(currentDoc);

  if (Array.isArray(newContent)) {
    // Multiple nodes to insert
    newContent.forEach((node, idx) => {
      operations.push({
        type: 'insert',
        path: [insertIndex + idx],
        newValue: node
      });
      proposedDoc.content.push(node);
    });

    // Create a ProseMirror ReplaceStep for inserting multiple nodes
    const step = {
      stepType: 'replace',
      from: insertPosition,
      to: insertPosition,
      slice: {
        content: newContent,
        openStart: 0,
        openEnd: 0
      }
    };
    transactionSteps.push(step);

    // Create inverse step for undo
    const inverseStep = {
      stepType: 'replace',
      from: insertPosition,
      to: insertPosition + calculateNodeListSize(newContent),
      slice: {
        content: [],
        openStart: 0,
        openEnd: 0
      }
    };
    inverseSteps.push(inverseStep);
  } else {
    // Single node to insert
    operations.push({
      type: 'insert',
      path: [insertIndex],
      newValue: newContent
    });
    proposedDoc.content.push(newContent);

    // Create a ProseMirror ReplaceStep for inserting a single node
    const step = {
      stepType: 'replace',
      from: insertPosition,
      to: insertPosition,
      slice: {
        content: [newContent],
        openStart: 0,
        openEnd: 0
      }
    };
    transactionSteps.push(step);

    // Create inverse step for undo
    const inverseStep = {
      stepType: 'replace',
      from: insertPosition,
      to: insertPosition + calculateProseMirrorNodeSize(newContent),
      slice: {
        content: [],
        openStart: 0,
        openEnd: 0
      }
    };
    inverseSteps.push(inverseStep);
  }

  // Calculate document positions for decorations
  const currentDocSize = insertPosition;

  // Create a proper ProseMirror content structure for the decoration
  // This will be rendered in the diff preview
  const decorationContent = {
    type: 'doc',
    content: Array.isArray(newContent) ? newContent : [newContent]
  };

  // For insertions at the end of the document
  decorations.push({
    from: currentDocSize,
    to: currentDocSize,
    type: 'addition',
    content: decorationContent
  });

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

  return {
    proposedDoc,
    operations,
    decorations,
    transactionSteps: transactionSteps.length > 0 ? transactionSteps : undefined,
    inverseSteps: inverseSteps.length > 0 ? inverseSteps : undefined
  };
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
  if (!doc) return 0;

  // Check if this is an empty document (just has an empty paragraph)
  // Empty docs in ProseMirror have just the positions 0, 1, 2
  if (doc.content && doc.content.length === 1 &&
      doc.content[0].type === 'paragraph' &&
      (!doc.content[0].content || doc.content[0].content.length === 0)) {
    return 2; // Insert position for empty doc
  }

  // Start at position 1 (after doc opening)
  let position = 1;

  if (doc.content && Array.isArray(doc.content)) {
    doc.content.forEach((node: any) => {
      position += calculateProseMirrorNodeSize(node);
    });
  }

  // Return position before doc closing (where we can insert)
  return position;
}

function calculateProseMirrorNodeSize(node: any): number {
  if (!node) return 0;

  if (node.type === 'text') {
    // Text nodes only have their character length, no open/close positions
    return node.text ? node.text.length : 0;
  }

  // Non-text nodes have opening (1) and closing (1) positions
  let size = 1; // Opening position

  if (node.content && Array.isArray(node.content)) {
    node.content.forEach((child: any) => {
      size += calculateProseMirrorNodeSize(child);
    });
  }

  size += 1; // Closing position

  return size;
}

function calculateNodeListSize(nodes: any[]): number {
  if (!nodes || nodes.length === 0) return 0;

  let totalSize = 0;
  nodes.forEach((node: any) => {
    totalSize += calculateProseMirrorNodeSize(node);
  });

  return totalSize;
}