interface PresentationBlock {
  id: string;
  content: string; // HTML content
  pmContent: any; // ProseMirror node
  locations: Array<{
    name: string;
    lat: number;
    lng: number;
  }>;
}

/**
 * Parse ProseMirror document into presentation blocks
 * Each top-level node becomes a separate slide
 */
export function parsePresentationBlocks(pmDoc: any): PresentationBlock[] {
  const blocks: PresentationBlock[] = [];

  console.log('[parsePresentationBlocks] Parsing ProseMirror document:', JSON.stringify(pmDoc, null, 2).substring(0, 500));

  // Check if pmDoc has a content array (it's a ProseMirror doc)
  if (!pmDoc || !pmDoc.content || !Array.isArray(pmDoc.content)) {
    console.warn('[parsePresentationBlocks] Invalid ProseMirror document structure');
    return [];
  }

  // Each top-level node in the document becomes a block
  pmDoc.content.forEach((node: any, index: number) => {
    console.log(`[parsePresentationBlocks] Processing node ${index}:`, {
      type: node.type,
      hasContent: !!node.content,
      contentLength: node.content?.length
    });

    // Extract locations from this node and its children
    const locations = extractLocationsFromPMNode(node);

    // Convert ProseMirror node back to HTML for rendering
    const htmlContent = pmNodeToHTML(node);

    blocks.push({
      id: `block-${index}`,
      content: htmlContent,
      pmContent: node,
      locations,
    });
  });

  console.log(`[parsePresentationBlocks] Total blocks found: ${blocks.length}`);
  return blocks;
}

/**
 * Recursively extract locations from a ProseMirror node and its children
 */
function extractLocationsFromPMNode(node: any): Array<{
  name: string;
  lat: number;
  lng: number;
}> {
  const locations: Array<{ name: string; lat: number; lng: number }> = [];

  // Recursive function to traverse the node tree
  function traverse(n: any) {
    // Check if this node has geo-mark marks
    if (n.marks && Array.isArray(n.marks)) {
      for (const mark of n.marks) {
        if (mark.type === 'geoMark' && mark.attrs) {
          const { placeName, lat, lng } = mark.attrs;
          if (lat && lng && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
            locations.push({
              name: placeName || n.text || '',
              lat: parseFloat(lat),
              lng: parseFloat(lng),
            });
          }
        }
      }
    }

    // Recursively traverse children
    if (n.content && Array.isArray(n.content)) {
      for (const child of n.content) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return locations;
}

/**
 * Convert a ProseMirror node to HTML string
 */
function pmNodeToHTML(node: any): string {
  if (!node) return '';

  // Handle text nodes
  if (node.type === 'text') {
    let text = node.text || '';

    // Apply marks (bold, italic, geo-mark, etc.)
    if (node.marks && Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold':
            text = `<strong>${text}</strong>`;
            break;
          case 'italic':
            text = `<em>${text}</em>`;
            break;
          case 'geoMark':
            const attrs = mark.attrs || {};
            text = `<span class="geo-mark" data-place-name="${attrs.placeName || ''}" data-lat="${attrs.lat || ''}" data-lng="${attrs.lng || ''}" data-coord-source="${attrs.coordSource || 'llm'}" data-color-index="${attrs.colorIndex || 0}">${text}</span>`;
            break;
        }
      }
    }

    return text;
  }

  // Handle block nodes
  const childrenHTML = (node.content || []).map((child: any) => pmNodeToHTML(child)).join('');

  switch (node.type) {
    case 'paragraph':
      return `<p>${childrenHTML}</p>`;
    case 'heading':
      const level = node.attrs?.level || 1;
      return `<h${level}>${childrenHTML}</h${level}>`;
    case 'bulletList':
      return `<ul>${childrenHTML}</ul>`;
    case 'orderedList':
      return `<ol>${childrenHTML}</ol>`;
    case 'listItem':
      return `<li>${childrenHTML}</li>`;
    case 'blockquote':
      return `<blockquote>${childrenHTML}</blockquote>`;
    default:
      return childrenHTML;
  }
}

/**
 * Calculate the center point and zoom level for a set of locations
 */
export function calculateMapBounds(locations: Array<{ lat: number; lng: number }>) {
  if (locations.length === 0) {
    return null;
  }

  if (locations.length === 1) {
    return {
      center: { lat: locations[0].lat, lng: locations[0].lng },
      zoom: 12,
    };
  }

  // Calculate bounds
  let minLat = locations[0].lat;
  let maxLat = locations[0].lat;
  let minLng = locations[0].lng;
  let maxLng = locations[0].lng;

  locations.forEach(loc => {
    minLat = Math.min(minLat, loc.lat);
    maxLat = Math.max(maxLat, loc.lat);
    minLng = Math.min(minLng, loc.lng);
    maxLng = Math.max(maxLng, loc.lng);
  });

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Calculate appropriate zoom level based on span
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const maxSpan = Math.max(latSpan, lngSpan);

  let zoom = 12; // Default zoom
  if (maxSpan > 10) zoom = 6;
  else if (maxSpan > 5) zoom = 8;
  else if (maxSpan > 2) zoom = 10;
  else if (maxSpan > 0.5) zoom = 11;

  return {
    center: { lat: centerLat, lng: centerLng },
    zoom,
  };
}
