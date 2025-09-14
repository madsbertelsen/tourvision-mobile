'use client';

import React, { useState, useEffect, memo } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Car, Bike, FootprintsIcon, ChevronDown, ChevronRight, Clock, Route, MapPin } from 'lucide-react';
import type { TransportMode } from '@/lib/editor/transportation-helpers';
import { formatDuration, formatDistance, getModeColor } from '@/lib/editor/transportation-helpers';

interface TransportationNodeProps {
  node: {
    attrs: {
      mode: TransportMode;
      duration?: number;
      distance?: number;
      fromLocation?: string;
      toLocation?: string;
      waypoints?: Array<[number, number]>;
      notes?: string;
    };
  };
  updateAttributes: (attrs: Record<string, any>) => void;
  selected: boolean;
}

// Store expansion state globally per node to persist across re-renders
// Using a Map with a stable key based on node content
const expansionStates = new Map<string, boolean>();

// Create a simple event emitter for expansion state changes
type ExpansionListener = () => void;
const expansionListeners = new Set<ExpansionListener>();

export function onExpansionChange(listener: ExpansionListener): () => void {
  expansionListeners.add(listener);
  return () => expansionListeners.delete(listener);
}

function notifyExpansionChange() {
  expansionListeners.forEach(listener => listener());
}

// Export function to get expansion state for external components
export function getTransportationExpansionState(fromLocation?: string, toLocation?: string, mode?: string): boolean {
  const nodeKey = `${fromLocation || ''}-${toLocation || ''}-${mode || ''}`;
  return expansionStates.get(nodeKey) || false;
}

// Export the expansion states map for real-time updates
export function getExpansionStatesMap(): Map<string, boolean> {
  return expansionStates;
}

function TransportationNodeComponent({ node, updateAttributes, selected }: TransportationNodeProps) {
  // Create a stable key based on node's unique attributes
  const nodeKey = `${node.attrs.fromLocation || ''}-${node.attrs.toLocation || ''}-${node.attrs.mode}`;
  
  // Initialize state from the global map
  const [isExpanded, setIsExpanded] = useState(() => {
    return expansionStates.get(nodeKey) || false;
  });
  const [isEditing, setIsEditing] = useState(false);
  
  // Update expansion state in the Map when it changes
  useEffect(() => {
    expansionStates.set(nodeKey, isExpanded);
    notifyExpansionChange(); // Notify listeners about the change
  }, [nodeKey, isExpanded]);
  
  const { mode, duration, distance, fromLocation, toLocation, waypoints, notes } = node.attrs;
  
  const getModeIcon = (mode: TransportMode) => {
    switch (mode) {
      case 'walking':
        return <FootprintsIcon className="w-4 h-4" />;
      case 'driving':
        return <Car className="w-4 h-4" />;
      case 'cycling':
        return <Bike className="w-4 h-4" />;
    }
  };
  
  const handleModeChange = (newMode: TransportMode) => {
    updateAttributes({ mode: newMode });
    setIsEditing(false);
  };
  
  const modeColor = getModeColor(mode);
  
  const hasDetails = waypoints && waypoints.length > 0 || notes;
  
  return (
    <NodeViewWrapper className="transportation-node my-2" contentEditable={false}>
      <div 
        className={`
          rounded-lg border overflow-hidden
          ${selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-gray-200 dark:border-gray-700'}
          ${isExpanded ? 'bg-gray-50 dark:bg-gray-900' : ''}
          transition-all duration-200
        `}
      >
        {/* Header - clickable to expand/collapse */}
        <div 
          className={`
            flex items-center gap-2 px-3 py-1.5
            hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors
            ${hasDetails ? 'cursor-pointer' : ''}
          `}
          onClick={(e) => {
            e.stopPropagation();
            if (hasDetails) setIsExpanded(!isExpanded);
          }}
          onMouseEnter={(e) => e.stopPropagation()}
          onMouseLeave={(e) => e.stopPropagation()}
        >
          {/* Expand/collapse arrow */}
          {hasDetails && (
            <div className="text-gray-400 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              <ChevronRight className="w-4 h-4" />
            </div>
          )}
          
          {/* Left arrow */}
          <div className="text-gray-400">→</div>
          
          {/* Mode selector */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`
                flex items-center gap-1.5 px-2 py-1 rounded-md
                hover:bg-white dark:hover:bg-gray-700 transition-colors
              `}
              style={{ color: modeColor }}
            >
              {getModeIcon(mode)}
              <ChevronDown className="w-3 h-3" />
            </button>
          
          {isEditing && (
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
              <button
                onClick={() => handleModeChange('walking')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 w-full"
                style={{ color: getModeColor('walking') }}
              >
                <FootprintsIcon className="w-4 h-4" />
                <span className="text-sm">Walking</span>
              </button>
              <button
                onClick={() => handleModeChange('driving')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 w-full"
                style={{ color: getModeColor('driving') }}
              >
                <Car className="w-4 h-4" />
                <span className="text-sm">Driving</span>
              </button>
              <button
                onClick={() => handleModeChange('cycling')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 w-full"
                style={{ color: getModeColor('cycling') }}
              >
                <Bike className="w-4 h-4" />
                <span className="text-sm">Cycling</span>
              </button>
            </div>
          )}
        </div>
        
        {/* Duration and distance */}
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          {duration && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formatDuration(duration)}</span>
            </div>
          )}
          {distance && (
            <div className="flex items-center gap-1">
              <Route className="w-3 h-3" />
              <span>{formatDistance(distance)}</span>
            </div>
          )}
        </div>
        
        {/* Locations if specified */}
        {(fromLocation || toLocation) && (
          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-500 ml-auto">
            {fromLocation && <span>{fromLocation}</span>}
            {fromLocation && toLocation && <span>→</span>}
            {toLocation && <span>{toLocation}</span>}
          </div>
        )}
        
          {/* Right arrow */}
          <div className="text-gray-400">→</div>
        </div>
        
        {/* Expandable content section */}
        {isExpanded && hasDetails && (
          <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {/* Waypoints */}
            {waypoints && waypoints.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <MapPin className="w-3 h-3" />
                  <span>Waypoints ({waypoints.length})</span>
                </div>
                <div className="pl-4 space-y-0.5">
                  {waypoints.map((waypoint, index) => (
                    <div key={index} className="text-xs text-gray-600 dark:text-gray-400">
                      • Point {index + 1}: [{waypoint[0].toFixed(4)}, {waypoint[1].toFixed(4)}]
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Notes */}
            {notes && (
              <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                {notes}
              </div>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const TransportationNode = memo(TransportationNodeComponent, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.selected === nextProps.selected &&
    prevProps.node.attrs.mode === nextProps.node.attrs.mode &&
    prevProps.node.attrs.duration === nextProps.node.attrs.duration &&
    prevProps.node.attrs.distance === nextProps.node.attrs.distance &&
    prevProps.node.attrs.fromLocation === nextProps.node.attrs.fromLocation &&
    prevProps.node.attrs.toLocation === nextProps.node.attrs.toLocation &&
    JSON.stringify(prevProps.node.attrs.waypoints) === JSON.stringify(nextProps.node.attrs.waypoints) &&
    prevProps.node.attrs.notes === nextProps.node.attrs.notes
  );
});