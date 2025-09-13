'use dom';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';
import { 
  LightBulbIcon, 
  CalendarIcon, 
  CurrencyDollarIcon,
  MapIcon,
  ShoppingBagIcon,
  TruckIcon
} from '@heroicons/react/24/outline';

export interface TipAttributes {
  tipId: string;
  icon?: string;
  category: 'booking' | 'timing' | 'budget' | 'local' | 'food' | 'transportation';
  priority?: 'high' | 'medium' | 'low';
}

const TIP_ICONS = {
  booking: CalendarIcon,
  timing: CalendarIcon,
  budget: CurrencyDollarIcon,
  local: MapIcon,
  food: ShoppingBagIcon,
  transportation: TruckIcon,
};

const TIP_COLORS = {
  booking: '#F59E0B',
  timing: '#3B82F6',
  budget: '#10B981',
  local: '#8B5CF6',
  food: '#EC4899',
  transportation: '#6B7280',
};

const PRIORITY_INDICATORS = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

const TipComponent = ({ node }: any) => {
  const attrs = node.attrs as TipAttributes;
  const Icon = TIP_ICONS[attrs.category] || LightBulbIcon;
  const color = TIP_COLORS[attrs.category] || '#6B7280';
  const priorityIndicator = attrs.priority ? PRIORITY_INDICATORS[attrs.priority] : null;
  
  return (
    <NodeViewWrapper className="tip-node my-2">
      <div 
        className="flex gap-3 p-3 rounded-lg border"
        style={{
          backgroundColor: `${color}10`,
          borderColor: `${color}40`,
        }}
      >
        <div className="flex-shrink-0">
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span 
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color }}
            >
              {attrs.category} tip
            </span>
            {priorityIndicator && (
              <span className="text-xs">{priorityIndicator}</span>
            )}
          </div>
          <NodeViewContent className="text-sm text-gray-700" />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const TipNode = Node.create({
  name: 'tip',
  
  group: 'block',
  
  content: 'inline*',
  
  addAttributes() {
    return {
      tipId: { default: '' },
      icon: { default: null },
      category: { default: 'local' },
      priority: { default: 'medium' },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="tip"]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'tip' }), 0];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(TipComponent);
  },
});