'use dom';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React, { useState } from 'react';
import { UserGroupIcon, MapPinIcon, ClockIcon } from '@heroicons/react/24/outline';

export interface SplitGroup {
  groupId: string;
  name: string;
  participants: string[];
  destinations: string[];
  estimatedCost?: number;
}

export interface GroupSplitAttributes {
  splitId: string;
  startTime: string;
  endTime: string;
  reunionPoint: string;
  reunionTime: string;
  groups: SplitGroup[];
}

const GROUP_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const GroupSplitComponent = ({ node }: any) => {
  const attrs = node.attrs as GroupSplitAttributes;
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  
  return (
    <NodeViewWrapper className="group-split-node my-4">
      <div className="border-2 border-dashed border-purple-300 rounded-lg p-4 bg-purple-50">
        <div className="flex items-center gap-2 mb-3">
          <UserGroupIcon className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-purple-900">Group Split</h3>
          <span className="text-sm text-purple-700">
            {attrs.startTime} - {attrs.endTime}
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {attrs.groups.map((group, index) => {
            const color = GROUP_COLORS[index % GROUP_COLORS.length];
            const isSelected = selectedGroup === group.groupId;
            
            return (
              <div
                key={group.groupId}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-opacity-100 shadow-md'
                    : 'border-opacity-50 hover:border-opacity-75'
                }`}
                style={{
                  borderColor: color,
                  backgroundColor: isSelected ? `${color}10` : 'white',
                }}
                onClick={() => setSelectedGroup(isSelected ? null : group.groupId)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium" style={{ color }}>
                    {group.name}
                  </h4>
                  {group.estimatedCost && (
                    <span className="text-sm text-gray-600">
                      ${group.estimatedCost}
                    </span>
                  )}
                </div>
                
                <div className="text-sm text-gray-600">
                  <div className="flex items-center gap-1 mb-1">
                    <UserGroupIcon className="w-3 h-3" />
                    <span>{group.participants.length} people</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPinIcon className="w-3 h-3" />
                    <span>{group.destinations.length} stops</span>
                  </div>
                </div>
                
                {isSelected && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Participants:</div>
                    <div className="text-sm">{group.participants.join(', ')}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-purple-200">
          <MapPinIcon className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium text-purple-900">Reunion:</span>
          <span className="text-sm text-gray-700">
            {attrs.reunionPoint} at {attrs.reunionTime}
          </span>
        </div>
        
        <NodeViewContent className="mt-3" />
      </div>
    </NodeViewWrapper>
  );
};

export const GroupSplitNode = Node.create({
  name: 'groupSplit',
  
  group: 'block',
  
  content: 'block*',
  
  addAttributes() {
    return {
      splitId: { default: '' },
      startTime: { default: '' },
      endTime: { default: '' },
      reunionPoint: { default: '' },
      reunionTime: { default: '' },
      groups: { default: [] },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-type="groupSplit"]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'groupSplit' }), 0];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(GroupSplitComponent);
  },
});