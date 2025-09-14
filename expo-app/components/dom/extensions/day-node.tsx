'use dom';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React from 'react';
import { CalendarIcon, CurrencyDollarIcon, ClockIcon } from '@heroicons/react/24/outline';

export interface DayAttributes {
  dayNumber: number;
  title: string;
  date: string;
  theme?: string;
  estimatedHours?: number;
  estimatedCost?: number;
  destinations?: string[];
}

const DayComponent = ({ node }: any) => {
  const attrs = node.attrs as DayAttributes;
  
  return (
    <NodeViewWrapper className="day-node my-6">
      <div className="border-l-4 border-blue-500 pl-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-bold">
              Day {attrs.dayNumber}
            </div>
            <h2 className="text-xl font-bold text-gray-900">{attrs.title}</h2>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {attrs.date && (
              <div className="flex items-center gap-1">
                <CalendarIcon className="w-4 h-4" />
                <span>{attrs.date}</span>
              </div>
            )}
            {attrs.estimatedHours && (
              <div className="flex items-center gap-1">
                <ClockIcon className="w-4 h-4" />
                <span>{attrs.estimatedHours}h</span>
              </div>
            )}
            {attrs.estimatedCost && (
              <div className="flex items-center gap-1">
                <CurrencyDollarIcon className="w-4 h-4" />
                <span>${attrs.estimatedCost}</span>
              </div>
            )}
          </div>
        </div>
        
        {attrs.theme && (
          <div className="mb-3">
            <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
              {attrs.theme}
            </span>
          </div>
        )}
        
        <NodeViewContent className="pl-2" />
      </div>
    </NodeViewWrapper>
  );
};

export const DayNode = Node.create({
  name: 'day',
  
  group: 'block',
  
  content: 'block*',
  
  addAttributes() {
    return {
      dayNumber: { default: 1 },
      title: { default: '' },
      date: { default: '' },
      theme: { default: null },
      estimatedHours: { default: null },
      estimatedCost: { default: null },
      destinations: { default: [] },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="day"]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'day' }), 0];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(DayComponent);
  },
});