// Utility to extract all geo-mark locations from a ProseMirror document
// This traverses the document JSON and finds all marks of type 'geoMark'

export interface GeoMarkData {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  displayText?: string;
  colorIndex?: number;
  color?: string;
  description?: string;
  transportProfile?: 'walking' | 'driving' | 'cycling';
  transportFrom?: string;
  waypoints?: Array<{ lat: number; lng: number }>;
  coordSource?: string;
  visitDocument?: any;
  photoName?: string | null;
}

/**
 * Extract all geo-mark locations from a ProseMirror document
 * @param doc The ProseMirror document JSON
 * @returns Array of GeoMarkData objects
 */
export function extractLocationsFromDoc(doc: any): GeoMarkData[] {
  if (!doc || !doc.content) {
    return [];
  }

  const locations: GeoMarkData[] = [];
  const seenGeoIds = new Set<string>();

  // Recursive function to traverse nodes
  function traverseNode(node: any) {
    // Check if this node has marks
    if (node.marks && Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type === 'geoMark' && mark.attrs) {
          const attrs = mark.attrs;

          // Skip if we've already seen this geoId
          if (attrs.geoId && !seenGeoIds.has(attrs.geoId)) {
            seenGeoIds.add(attrs.geoId);

            // Extract the location data
            const location: GeoMarkData = {
              geoId: attrs.geoId,
              placeName: attrs.placeName || '',
              lat: attrs.lat || 0,
              lng: attrs.lng || 0,
              displayText: attrs.displayText || node.text, // Use node text as display if not specified
              colorIndex: attrs.colorIndex,
              description: attrs.description,
              transportProfile: attrs.transportProfile,
              transportFrom: attrs.transportFrom,
              waypoints: attrs.waypoints,
              coordSource: attrs.coordSource,
              visitDocument: attrs.visitDocument,
              photoName: attrs.photoName,
            };

            locations.push(location);
          }
        }
      }
    }

    // Recursively traverse child nodes
    if (node.content && Array.isArray(node.content)) {
      for (const childNode of node.content) {
        traverseNode(childNode);
      }
    }
  }

  // Start traversal from the root
  traverseNode(doc);

  // Sort locations by their appearance order (colorIndex if available)
  locations.sort((a, b) => {
    if (a.colorIndex !== undefined && b.colorIndex !== undefined) {
      return a.colorIndex - b.colorIndex;
    }
    return 0;
  });

  // Add colors based on index
  const COLORS = [
    '#3B82F6', // Blue
    '#8B5CF6', // Purple
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#84CC16', // Lime
    '#F97316', // Orange
    '#6366F1', // Indigo
  ];

  locations.forEach((loc, index) => {
    if (!loc.color) {
      loc.color = COLORS[(loc.colorIndex ?? index) % COLORS.length];
    }
  });

  return locations;
}