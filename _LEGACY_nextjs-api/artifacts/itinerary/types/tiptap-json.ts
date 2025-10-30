/**
 * TipTap JSON document type definitions for itinerary content
 */

// Root document structure
export interface TipTapDocument {
  type: 'doc';
  content: TipTapNode[];
}

// Generic node structure
export interface TipTapNode {
  type: 'paragraph' | 'heading' | 'text' | 'hardBreak' | 'bulletList' | 'orderedList' | 'listItem' | 'codeBlock' | 'details' | 'detailsSummary' | 'detailsContent' | 'transportation' | 'destination';
  content?: TipTapNode[];
  marks?: TipTapMark[];
  attrs?: Record<string, any>;
  text?: string;
}

// Text node with content
export interface TextNode extends TipTapNode {
  type: 'text';
  text: string;
  marks?: TipTapMark[];
}

// Paragraph node
export interface ParagraphNode extends TipTapNode {
  type: 'paragraph';
  content?: TipTapNode[];
}

// Heading node
export interface HeadingNode extends TipTapNode {
  type: 'heading';
  attrs: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
  };
  content?: TipTapNode[];
}

// Details node (collapsible section)
export interface DetailsNode extends TipTapNode {
  type: 'details';
  attrs?: {
    open?: boolean;
  };
  content?: TipTapNode[];
}

// Details summary node
export interface DetailsSummaryNode extends TipTapNode {
  type: 'detailsSummary';
  content?: TipTapNode[];
}

// Details content node
export interface DetailsContentNode extends TipTapNode {
  type: 'detailsContent';
  content?: TipTapNode[];
}

// Transportation node
export interface TransportationNode extends TipTapNode {
  type: 'transportation';
  attrs: {
    mode: 'walking' | 'driving' | 'cycling';
    duration?: number; // in minutes
    distance?: number; // in meters
    fromLocation?: string;
    toLocation?: string;
    waypoints?: Array<[number, number]>; // Intermediate waypoints
    notes?: string;
  };
  content?: TipTapNode[];
}

// Destination node
export interface DestinationNode extends TipTapNode {
  type: 'destination';
  attrs: {
    name: string;
    context?: string;
    coordinates?: [number, number];
    placeId?: string;
    colorIndex?: number;
    open?: boolean;
  };
  content?: TipTapNode[];
}

// Mark structure (formatting)
export interface TipTapMark {
  type: 'link' | 'bold' | 'italic' | 'code' | 'strike';
  attrs?: Record<string, any>;
}

// Enhanced link mark for locations
export interface LocationLinkMark extends TipTapMark {
  type: 'link';
  attrs: {
    href: string;
    target?: string;
    rel?: string;
    class?: string;
    // Custom location metadata - stored directly in attrs
    locationData?: LocationMetadata;
  };
}

// Location metadata stored in link
export interface LocationMetadata {
  name: string;
  coordinates: [number, number]; // [lng, lat]
  placeId?: string;
  colorIndex: number;
  color: string; // Hex color for the marker
  bgColor: string; // Background color for text highlight
  context?: string; // e.g., "Copenhagen, Denmark"
  day?: number;
  time?: string;
  travelMode?: 'walking' | 'driving' | 'cycling';
}

// Helper type guards
export function isTextNode(node: TipTapNode): node is TextNode {
  return node.type === 'text';
}

export function isParagraphNode(node: TipTapNode): node is ParagraphNode {
  return node.type === 'paragraph';
}

export function isHeadingNode(node: TipTapNode): node is HeadingNode {
  return node.type === 'heading';
}

export function isLocationLink(mark: TipTapMark): mark is LocationLinkMark {
  return mark.type === 'link' && mark.attrs?.locationData !== undefined;
}

export function isTransportationNode(node: TipTapNode): node is TransportationNode {
  return node.type === 'transportation';
}

export function isDestinationNode(node: TipTapNode): node is DestinationNode {
  return node.type === 'destination';
}

// Utility to extract all location links from a document
export function extractLocationLinks(doc: TipTapDocument): LocationLinkMark[] {
  const links: LocationLinkMark[] = [];
  
  function traverse(node: TipTapNode) {
    // Check text nodes for link marks
    if (isTextNode(node) && node.marks) {
      for (const mark of node.marks) {
        if (isLocationLink(mark)) {
          links.push(mark);
        }
      }
    }
    
    // Traverse child nodes
    if (node.content) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  }
  
  for (const node of doc.content) {
    traverse(node);
  }
  
  return links;
}