/**
 * TipTap Document Types for TourVision Mobile
 * Based on the prototype's document structure
 */

export interface TipTapDocument {
  type: 'doc';
  attrs?: DocumentAttrs;
  content: TipTapNode[];
}

export interface DocumentAttrs {
  tripId?: string;
  tripTitle?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  visibility?: 'private' | 'shared' | 'public';
  owner?: string;
  collaborators?: Collaborator[];
  viewPreferences?: ViewPreferences;
  version?: number;
  lastModified?: string;
  lastModifiedBy?: string;
}

export interface Collaborator {
  userId: string;
  name: string;
  role: 'editor' | 'viewer';
  avatar: string;
  color: string;
}

export interface ViewPreferences {
  mode: 'split' | 'text' | 'map';
  selectedDay: string | 'all';
  mapBounds?: any;
  commentsEnabled: boolean;
  editingEnabled: boolean;
}

export type TipTapNode = 
  | TextNode
  | ParagraphNode
  | HeadingNode
  | DayNode
  | DestinationNode
  | TransportationNode
  | TipNode
  | GroupSplitNode
  | BulletListNode
  | OrderedListNode
  | ListItemNode
  | HardBreakNode;

export interface BaseNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TipTapNode[];
  marks?: Mark[];
}

export interface TextNode extends BaseNode {
  type: 'text';
  text: string;
  marks?: Mark[];
}

export interface ParagraphNode extends BaseNode {
  type: 'paragraph';
  content?: TipTapNode[];
}

export interface HeadingNode extends BaseNode {
  type: 'heading';
  attrs: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
  };
  content?: TipTapNode[];
}

export interface DayNode extends BaseNode {
  type: 'day';
  attrs: {
    dayNumber: number;
    title: string;
    date: string;
    theme?: string;
    estimatedHours?: number;
    estimatedCost?: number;
    destinations?: string[]; // IDs of destination nodes
  };
  content?: TipTapNode[];
}

export interface DestinationNode extends BaseNode {
  type: 'destination';
  attrs: {
    destinationId: string;
    name: string;
    context?: string; // e.g., "Paris, France"
    coordinates?: [number, number]; // [lng, lat]
    placeId?: string; // Google Places ID
    colorIndex: number;
    timeSlot?: {
      start: string;
      end: string;
    };
    duration?: string;
    participants?: string[] | null; // null means all
    splitGroupId?: string;
    booking?: BookingInfo;
    tips?: string[];
    priority?: 'high' | 'medium' | 'low';
    category?: 'landmark' | 'museum' | 'restaurant' | 'activity' | 'shopping';
    accessibility?: {
      wheelchairAccessible?: boolean;
      audioGuide?: boolean;
    };
    weatherDependent?: boolean;
    cost?: CostInfo;
  };
  content?: TipTapNode[];
}

export interface BookingInfo {
  required: boolean;
  status: 'none' | 'pending' | 'booked' | 'confirmed' | 'cancelled';
  suggestedBy?: string;
  suggestedAt?: string;
  provider?: string;
  confirmationNumber?: string;
  bookedBy?: string;
  bookedAt?: string;
  tickets?: number;
  price?: CostInfo;
  deadline?: string;
  url?: string;
}

export interface CostInfo {
  amount: number;
  currency: string;
  perPerson?: boolean;
}

export interface TransportationNode extends BaseNode {
  type: 'transportation';
  attrs: {
    transportId: string;
    mode: 'walking' | 'metro' | 'bus' | 'taxi' | 'uber' | 'bike' | 'car';
    fromDestination: string;
    toDestination: string;
    duration: string;
    distance?: string;
    cost?: CostInfo;
    route?: string;
    accessibility?: boolean;
    alternatives?: TransportAlternative[];
  };
  content?: TipTapNode[];
}

export interface TransportAlternative {
  mode: string;
  duration: string;
  cost: number;
}

export interface TipNode extends BaseNode {
  type: 'tip';
  attrs: {
    tipId: string;
    icon?: string;
    category: 'booking' | 'timing' | 'budget' | 'local' | 'food' | 'transportation';
    priority?: 'high' | 'medium' | 'low';
  };
  content?: TipTapNode[];
}

export interface GroupSplitNode extends BaseNode {
  type: 'groupSplit';
  attrs: {
    splitId: string;
    startTime: string;
    endTime: string;
    reunionPoint: string;
    reunionTime: string;
    groups: SplitGroup[];
  };
  content?: TipTapNode[];
}

export interface SplitGroup {
  groupId: string;
  name: string;
  participants: string[];
  destinations: string[];
  estimatedCost?: number;
}

export interface BulletListNode extends BaseNode {
  type: 'bulletList';
  content?: ListItemNode[];
}

export interface OrderedListNode extends BaseNode {
  type: 'orderedList';
  attrs?: {
    start?: number;
  };
  content?: ListItemNode[];
}

export interface ListItemNode extends BaseNode {
  type: 'listItem';
  content?: TipTapNode[];
}

export interface HardBreakNode extends BaseNode {
  type: 'hardBreak';
}

export interface Mark {
  type: 'bold' | 'italic' | 'link' | 'strike' | 'code' | 'comment' | 'suggestion';
  attrs?: MarkAttrs;
}

export interface MarkAttrs {
  // For links
  href?: string;
  target?: string;
  rel?: string;
  class?: string;
  
  // For comments
  commentId?: string;
  author?: string;
  authorName?: string;
  text?: string;
  timestamp?: string;
  resolved?: boolean;
  replies?: CommentReply[];
  position?: {
    line: number;
    node: string;
  };
  
  // For suggestions
  suggestionId?: string;
  originalText?: string;
  suggestedText?: string;
  reason?: string;
  status?: 'pending' | 'accepted' | 'rejected';
  targetNode?: string;
}

export interface CommentReply {
  replyId: string;
  author: string;
  authorName: string;
  text: string;
  timestamp: string;
}

// Type guards
export function isTextNode(node: TipTapNode): node is TextNode {
  return node.type === 'text';
}

export function isDayNode(node: TipTapNode): node is DayNode {
  return node.type === 'day';
}

export function isDestinationNode(node: TipTapNode): node is DestinationNode {
  return node.type === 'destination';
}

export function isTransportationNode(node: TipTapNode): node is TransportationNode {
  return node.type === 'transportation';
}

export function isTipNode(node: TipTapNode): node is TipNode {
  return node.type === 'tip';
}

export function isGroupSplitNode(node: TipTapNode): node is GroupSplitNode {
  return node.type === 'groupSplit';
}

// Helper to extract all destinations from document
export function extractDestinations(doc: TipTapDocument): DestinationNode[] {
  const destinations: DestinationNode[] = [];
  
  function traverse(node: TipTapNode) {
    if (isDestinationNode(node)) {
      destinations.push(node);
    }
    if (node.content) {
      node.content.forEach(traverse);
    }
  }
  
  doc.content.forEach(traverse);
  return destinations;
}

// Helper to calculate total cost for a day
export function calculateDayCost(dayNode: DayNode, doc: TipTapDocument): number {
  let totalCost = 0;
  
  if (dayNode.attrs.destinations) {
    const destinations = extractDestinations(doc);
    dayNode.attrs.destinations.forEach(destId => {
      const dest = destinations.find(d => d.attrs.destinationId === destId);
      if (dest?.attrs.cost) {
        totalCost += dest.attrs.cost.amount;
      }
    });
  }
  
  return totalCost;
}

// Helper to get color for destination
export const DESTINATION_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple  
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

export function getDestinationColor(colorIndex: number): string {
  return DESTINATION_COLORS[colorIndex % DESTINATION_COLORS.length];
}