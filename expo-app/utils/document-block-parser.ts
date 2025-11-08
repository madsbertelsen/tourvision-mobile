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
  type: 'paragraph' | 'heading' | 'map';
  level?: number; // for headings
  text: string;
  geoMarks: GeoMarkInBlock[];
  hasGeoMarks: boolean;
  height?: number; // for map blocks
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
  const TOTAL_COLORS = 10; // We have 10 colors in our palette

  if (!node || !node.content) return geoMarks;

  // Helper function to get the next color that avoids recent ones
  // NOTE: This is only used when a geo-mark doesn't have a colorIndex stored
  function getNextColorIndex(existingMarks: GeoMarkInBlock[]): number {
    // Use startingColorIndex + length to ensure colors continue across paragraphs
    const baseIndex = startingColorIndex + existingMarks.length;

    if (existingMarks.length === 0) return baseIndex % TOTAL_COLORS;

    // Get the last 3 color indices used
    const recentColors = existingMarks
      .slice(-3)
      .map(mark => mark.colorIndex);

    // Find a color that hasn't been used recently
    for (let i = 0; i < TOTAL_COLORS; i++) {
      const candidateColor = (baseIndex + i) % TOTAL_COLORS;
      if (!recentColors.includes(candidateColor)) {
        return candidateColor;
      }
    }

    // Fallback: just use next sequential
    return baseIndex % TOTAL_COLORS;
  }

  function traverse(n: any) {
    // Check if this is a geoMark node (inline node)
    if (n.type === 'geoMark' && n.attrs) {
      // Only add each geo-mark once (by geoId) to avoid duplicates
      if (!seenGeoIds.has(n.attrs.geoId)) {
        seenGeoIds.add(n.attrs.geoId);

        // Use stored colorIndex if it exists, otherwise assign a new one
        const storedColorIndex = n.attrs.colorIndex;
        const colorIndex = storedColorIndex !== undefined ? storedColorIndex : getNextColorIndex(geoMarks);


        // Extract text from content
        const text = n.content && Array.isArray(n.content) && n.content[0]?.text || '';

        const geoMark = {
          geoId: n.attrs.geoId,
          placeName: n.attrs.placeName,
          lat: n.attrs.lat,
          lng: n.attrs.lng,
          colorIndex: colorIndex,
          text: text,
          transportFrom: n.attrs.transportFrom || null,
          transportProfile: n.attrs.transportProfile || null,
          waypoints: n.attrs.waypoints || null
        };
        geoMarks.push(geoMark);
      }
    }

    // Also check if this node is a text node with geo-mark marks (legacy support)
    if (n.type === 'text' && n.marks && Array.isArray(n.marks)) {
      for (const mark of n.marks) {
        if (mark.type === 'geoMark' && mark.attrs) {
          // Only add each geo-mark once (by geoId) to avoid duplicates
          if (!seenGeoIds.has(mark.attrs.geoId)) {
            seenGeoIds.add(mark.attrs.geoId);

            // Use stored colorIndex if it exists, otherwise assign a new one
            const storedColorIndex = mark.attrs.colorIndex;
            const colorIndex = storedColorIndex !== undefined ? storedColorIndex : getNextColorIndex(geoMarks);


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
  let previousBlockGeoMarks: GeoMarkInBlock[] = [];

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

      // Store geo-marks for potential map block that follows
      previousBlockGeoMarks = geoMarks;
    } else if (node.type === 'map') {
      // Map block displays geo-marks from the previous paragraph/heading
      const height = node.attrs?.height || 400;

      blocks.push({
        type: 'map',
        text: '',
        geoMarks: previousBlockGeoMarks,
        hasGeoMarks: previousBlockGeoMarks.length > 0,
        height: height
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

      // Store geo-marks for potential map block that follows
      previousBlockGeoMarks = geoMarks;
    }
  }

  // Post-process all geo-marks to resolve transport-from references with fuzzy matching
  const allGeoMarks = blocks.flatMap(block => block.geoMarks);

  for (const mark of allGeoMarks) {
    if (mark.transportFrom) {
      // First try exact geo-id match
      let originMark = allGeoMarks.find(m => m.geoId === mark.transportFrom);

      // If not found, try case-insensitive text match (the visible text)
      if (!originMark) {
        const transportFromLower = mark.transportFrom.toLowerCase().trim();
        originMark = allGeoMarks.find(m => {
          const textLower = (m.text || '').toLowerCase().trim();
          return textLower === transportFromLower ||
                 textLower.includes(transportFromLower) ||
                 transportFromLower.includes(textLower);
        });

        // If still not found, try against placeName as fallback
        if (!originMark) {
          originMark = allGeoMarks.find(m => {
            const placeNameLower = m.placeName.toLowerCase();
            return placeNameLower.includes(transportFromLower) ||
                   transportFromLower.includes(placeNameLower);
          });
        }

        // If we found a match, update transportFrom to use the geo-id
        if (originMark) {
          mark.transportFrom = originMark.geoId;
        }
      }
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
