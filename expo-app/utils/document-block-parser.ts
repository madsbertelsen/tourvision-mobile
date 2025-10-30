/**
 * Parse ProseMirror document into navigable blocks with geo-marks
 */

export interface GeoMarkInBlock {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex: number;
  text: string;
}

export interface DocumentBlock {
  type: 'paragraph' | 'heading';
  level?: number; // for headings
  text: string;
  geoMarks: GeoMarkInBlock[];
  hasGeoMarks: boolean;
}

/**
 * Extract text content from a node and its children
 */
function extractTextContent(node: any): string {
  if (!node) return '';

  if (node.type === 'text') {
    return node.text || '';
  }

  if (node.type === 'geoMark' && node.content) {
    // Extract text from geo-mark content
    return node.content.map((child: any) => extractTextContent(child)).join('');
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map((child: any) => extractTextContent(child)).join('');
  }

  return '';
}

/**
 * Extract geo-marks from a node
 * Auto-assigns sequential colorIndex if not present
 */
function extractGeoMarks(node: any, startingColorIndex: number = 0): GeoMarkInBlock[] {
  const geoMarks: GeoMarkInBlock[] = [];
  let colorCounter = startingColorIndex;

  if (!node || !node.content) return geoMarks;

  function traverse(n: any) {
    if (n.type === 'geoMark' && n.attrs) {
      const text = extractTextContent(n);
      // Use stored colorIndex if available, otherwise auto-assign sequentially
      const hasStoredColor = n.attrs.colorIndex !== undefined;
      const colorIndex = hasStoredColor ? n.attrs.colorIndex : colorCounter++;

      console.log('[Parser] Geo-mark:', n.attrs.placeName,
        'hasStored:', hasStoredColor,
        'stored:', n.attrs.colorIndex,
        'assigned:', colorIndex,
        'counter:', colorCounter);

      geoMarks.push({
        geoId: n.attrs.geoId,
        placeName: n.attrs.placeName,
        lat: n.attrs.lat,
        lng: n.attrs.lng,
        colorIndex: colorIndex,
        text: text
      });
    }

    if (n.content && Array.isArray(n.content)) {
      n.content.forEach((child: any) => traverse(child));
    }
  }

  node.content.forEach((child: any) => traverse(child));

  return geoMarks;
}

/**
 * Parse document into blocks
 * Auto-assigns sequential colorIndex across all geo-marks in document
 */
export function parseDocumentIntoBlocks(doc: any): DocumentBlock[] {
  if (!doc || !doc.content) return [];

  const blocks: DocumentBlock[] = [];
  let globalColorIndex = 0;

  for (const node of doc.content) {
    if (node.type === 'paragraph' || node.type === 'heading') {
      const text = extractTextContent(node);
      const geoMarks = extractGeoMarks(node, globalColorIndex);

      // Increment globalColorIndex by number of geo-marks found
      globalColorIndex += geoMarks.length;

      blocks.push({
        type: node.type,
        level: node.attrs?.level,
        text: text,
        geoMarks: geoMarks,
        hasGeoMarks: geoMarks.length > 0
      });
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      // Process list items to extract geo-marks
      const text = extractTextContent(node);
      const geoMarks = extractGeoMarks(node, globalColorIndex);

      // Increment globalColorIndex by number of geo-marks found
      globalColorIndex += geoMarks.length;

      blocks.push({
        type: 'paragraph', // Treat as paragraph for simplicity
        text: text,
        geoMarks: geoMarks,
        hasGeoMarks: geoMarks.length > 0
      });
    }
  }

  return blocks;
}

/**
 * Get all geo-marks from specific blocks
 */
export function getGeoMarksFromBlocks(blocks: DocumentBlock[], blockIndices: number[]): GeoMarkInBlock[] {
  const geoMarks: GeoMarkInBlock[] = [];

  for (const index of blockIndices) {
    if (index >= 0 && index < blocks.length) {
      geoMarks.push(...blocks[index].geoMarks);
    }
  }

  return geoMarks;
}
