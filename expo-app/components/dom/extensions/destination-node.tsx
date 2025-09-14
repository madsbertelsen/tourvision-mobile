'use dom';

import { ChevronDownIcon, ChevronRightIcon, ClockIcon, DollarSignIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { DESTINATION_COLORS } from '../../../../types/tiptap';

export interface DestinationAttributes {
  destinationId: string;
  name: string;
  context?: string;
  coordinates?: [number, number];
  placeId?: string;
  colorIndex: number;
  timeSlot?: {
    start: string;
    end: string;
  };
  duration?: string;
  booking?: any;
  tips?: string[];
  priority?: 'high' | 'medium' | 'low';
  category?: 'landmark' | 'museum' | 'restaurant' | 'activity' | 'shopping';
  weatherDependent?: boolean;
  cost?: {
    amount: number;
    currency: string;
    perPerson?: boolean;
  };
  isExpanded?: boolean;
}

const DestinationComponent = ({ node, updateAttributes }: any) => {
  const attrs = node.attrs as DestinationAttributes;
  const color = DESTINATION_COLORS[attrs.colorIndex % DESTINATION_COLORS.length];
  const isExpanded = attrs.isExpanded ?? false;

  const toggleExpanded = () => {
    updateAttributes({ isExpanded: !isExpanded });
  };

  return (
    <NodeViewWrapper className="destination-node my-3">
      <div 
        className="border rounded-lg overflow-hidden"
        style={{ borderColor: color }}
      >
        <div 
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
          style={{ backgroundColor: `${color}10` }}
          onClick={toggleExpanded}
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-8 rounded" style={{ backgroundColor: color }} />
            <MapPinIcon className="w-5 h-5" style={{ color }} />
            <div>
              <h3 className="font-semibold text-gray-900">{attrs.name}</h3>
              {attrs.context && (
                <p className="text-sm text-gray-500">{attrs.context}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {attrs.duration && (
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <ClockIcon className="w-4 h-4" />
                <span>{attrs.duration}</span>
              </div>
            )}
            {attrs.cost && (
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <DollarSignIcon className="w-4 h-4" />
                <span>{attrs.cost.amount} {attrs.cost.currency}</span>
              </div>
            )}
            {isExpanded ? (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
        
        {isExpanded && (
          <div className="p-4 border-t border-gray-200">
            {attrs.timeSlot && (
              <div className="mb-3 text-sm">
                <span className="font-medium">Time:</span> {attrs.timeSlot.start} - {attrs.timeSlot.end}
              </div>
            )}
            
            {attrs.category && (
              <div className="mb-3">
                <span className="inline-block px-2 py-1 text-xs font-medium rounded" 
                      style={{ backgroundColor: `${color}20`, color }}>
                  {attrs.category}
                </span>
              </div>
            )}
            
            <NodeViewContent className="prose prose-sm max-w-none" />
            
            {attrs.tips && attrs.tips.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 rounded">
                <h4 className="text-sm font-medium text-blue-900 mb-1">Tips</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  {attrs.tips.map((tip, index) => (
                    <li key={index}>• {tip}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {attrs.booking && attrs.booking.required && (
              <div className="mt-3 p-3 bg-amber-50 rounded">
                <h4 className="text-sm font-medium text-amber-900">Booking Required</h4>
                <p className="text-sm text-amber-800 mt-1">
                  Status: {attrs.booking.status || 'Not booked'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const DestinationNode = Node.create({
  name: 'destination',
  
  group: 'block',
  
  content: 'block*',
  
  addAttributes() {
    return {
      destinationId: { default: null },
      name: { default: '' },
      context: { default: null },
      coordinates: { default: null },
      placeId: { default: null },
      colorIndex: { default: 0 },
      timeSlot: { default: null },
      duration: { default: null },
      booking: { default: null },
      tips: { default: null },
      priority: { default: 'medium' },
      category: { default: null },
      weatherDependent: { default: false },
      cost: { default: null },
      isExpanded: { default: false },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="destination"]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'destination' }), 0];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(DestinationComponent);
  },
});