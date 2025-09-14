'use dom';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

export interface TransportationAttributes {
  transportId: string;
  mode: 'walking' | 'metro' | 'bus' | 'taxi' | 'uber' | 'bike' | 'car';
  fromDestination: string;
  toDestination: string;
  duration: string;
  distance?: string;
  cost?: {
    amount: number;
    currency: string;
  };
  route?: string;
  accessibility?: boolean;
}

const TRANSPORT_ICONS: Record<string, string> = {
  walking: '🚶',
  metro: '🚇',
  bus: '🚌',
  taxi: '🚕',
  uber: '🚗',
  bike: '🚴',
  car: '🚙',
};

const TRANSPORT_COLORS: Record<string, string> = {
  walking: '#10B981',
  metro: '#8B5CF6',
  bus: '#3B82F6',
  taxi: '#F59E0B',
  uber: '#000000',
  bike: '#84CC16',
  car: '#6B7280',
};

const TransportationComponent = ({ node }: any) => {
  const attrs = node.attrs as TransportationAttributes;
  const icon = TRANSPORT_ICONS[attrs.mode] || '🚶';
  const color = TRANSPORT_COLORS[attrs.mode] || '#6B7280';
  
  return (
    <NodeViewWrapper className="transportation-node my-3">
      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <span>{attrs.fromDestination}</span>
            <ArrowRightIcon className="w-4 h-4 text-gray-400" />
            <span>{attrs.toDestination}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
            <span className="font-medium" style={{ color }}>
              {attrs.mode.charAt(0).toUpperCase() + attrs.mode.slice(1)}
            </span>
            <span>• {attrs.duration}</span>
            {attrs.distance && <span>• {attrs.distance}</span>}
            {attrs.cost && (
              <span>• {attrs.cost.amount} {attrs.cost.currency}</span>
            )}
          </div>
          {attrs.route && (
            <div className="mt-2 text-xs text-gray-500">
              Route: {attrs.route}
            </div>
          )}
        </div>
        {attrs.accessibility && (
          <div className="text-blue-600" title="Wheelchair accessible">
            ♿
          </div>
        )}
      </div>
      <NodeViewContent className="hidden" />
    </NodeViewWrapper>
  );
};

export const TransportationNode = Node.create({
  name: 'transportation',
  
  group: 'block',
  
  content: 'inline*',
  
  addAttributes() {
    return {
      transportId: { default: '' },
      mode: { default: 'walking' },
      fromDestination: { default: '' },
      toDestination: { default: '' },
      duration: { default: '' },
      distance: { default: null },
      cost: { default: null },
      route: { default: null },
      accessibility: { default: false },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="transportation"]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'transportation' }), 0];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(TransportationComponent);
  },
});