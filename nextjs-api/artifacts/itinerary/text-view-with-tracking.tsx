'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import { TipTapEditor as Editor } from '@/components/text-editor-tiptap';
import { parseLocationsFromItinerary, } from './location-parser';
import { useVisibleLocations } from './use-visible-locations';
import type { Suggestion } from '@/lib/db/schema';

interface TextViewWithTrackingProps {
  content: string;
  suggestions: Suggestion[];
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  status: 'streaming' | 'idle';
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  onVisibleLocationsChange?: (visibleLocations: string[]) => void;
}

export function TextViewWithTracking({
  content,
  suggestions,
  isCurrentVersion,
  currentVersionIndex,
  status,
  onSaveContent,
  onVisibleLocationsChange
}: TextViewWithTrackingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Parse locations from content
  const locations = useMemo(() => 
    parseLocationsFromItinerary(content),
    [content]
  );
  
  // Track visible locations using editor hook
  const visibleLocations = useVisibleLocations(
    locations,
    containerRef as React.RefObject<HTMLElement>
  );
  
  // Notify parent of visibility changes
  useEffect(() => {
    if (onVisibleLocationsChange) {
      onVisibleLocationsChange(visibleLocations);
    }
  }, [visibleLocations, onVisibleLocationsChange]);
  
  
  return (
    <div 
      ref={containerRef} 
      className="flex flex-row py-8 md:p-20 px-4 h-full overflow-auto"
    >
      <Editor
        content={content}
        suggestions={suggestions}
        isCurrentVersion={isCurrentVersion}
        currentVersionIndex={currentVersionIndex}
        status={status}
        onSaveContent={onSaveContent}
      />
      {suggestions && suggestions.length > 0 ? (
        <div className="md:hidden h-dvh w-12 shrink-0" />
      ) : null}
    </div>
  );
}