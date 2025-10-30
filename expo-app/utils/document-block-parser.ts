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
  transportFrom?: string | null;
  transportProfile?: string | null;
  waypoints?: Array<{lat: number, lng: number}> | null;
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
 * Now extracts from marks (not nodes) since geo-marks are marks in ProseMirror schema
 * Auto-assigns sequential colorIndex if not present
 */
function extractGeoMarks(node: any, startingColorIndex: number = 0): GeoMarkInBlock[] {
  const geoMarks: GeoMarkInBlock[] = [];
  const seenGeoIds = new Set<string>();
  let colorCounter = startingColorIndex;

  if (!node || !node.content) return geoMarks;

  function traverse(n: any) {
    // Check if this node is a text node with geo-mark marks
    if (n.type === 'text' && n.marks && Array.isArray(n.marks)) {
      for (const mark of n.marks) {
        if (mark.type === 'geoMark' && mark.attrs) {
          // Only add each geo-mark once (by geoId) to avoid duplicates
          if (!seenGeoIds.has(mark.attrs.geoId)) {
            seenGeoIds.add(mark.attrs.geoId);

            // Use stored colorIndex if available, otherwise auto-assign sequentially
            const hasStoredColor = mark.attrs.colorIndex !== undefined;
            const colorIndex = hasStoredColor ? mark.attrs.colorIndex : colorCounter++;

            console.log('[Parser] Geo-mark:', mark.attrs.placeName,
              'hasStored:', hasStoredColor,
              'stored:', mark.attrs.colorIndex,
              'assigned:', colorIndex,
              'counter:', colorCounter);

            geoMarks.push({
              geoId: mark.attrs.geoId,
              placeName: mark.attrs.placeName,
              lat: mark.attrs.lat,
              lng: mark.attrs.lng,
              colorIndex: colorIndex,
              text: n.text || '',  // Use the text from the text node
              transportFrom: mark.attrs.transportFrom || null,
              transportProfile: mark.attrs.transportProfile || null,
              waypoints: mark.attrs.waypoints || null
            });
          }
        }
      }
    }

    // Continue traversing child nodes
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
    } else if (node.type === 'bulletList' || node.type === 'orderedList' ||
               node.type === 'bullet_list' || node.type === 'ordered_list') {
      // Process list items to extract geo-marks (handle both camelCase and snake_case)
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
