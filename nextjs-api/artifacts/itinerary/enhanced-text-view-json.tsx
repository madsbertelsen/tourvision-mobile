'use client';

import React, { useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { ItineraryTipTapEditorJSON as ItineraryEditor } from './itinerary-editor-tiptap-json';
import { parseLocationsFromJSON } from './location-parser-json';
import { useVisibleLocations } from './use-visible-locations';
import type { Suggestion } from '@/lib/db/schema';
import type { LocationColorMap } from './location-color-assignment';

interface EnhancedTextViewProps {
  content: string; // JSON string
  suggestions: Suggestion[];
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  status: 'streaming' | 'idle';
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  onVisibleLocationsChange?: (visibleLocations: string[]) => void;
  hoveredLocationName?: string | null;
  onLocationHover?: (locationName: string | null) => void;
  colorMap?: LocationColorMap | null;
}

export function EnhancedTextViewJSON({
  content,
  suggestions,
  isCurrentVersion,
  currentVersionIndex,
  status,
  onSaveContent,
  onVisibleLocationsChange,
  hoveredLocationName,
  onLocationHover,
  colorMap = null,
}: EnhancedTextViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const detailsStateRef = useRef<Map<string, boolean>>(new Map());

  // Parse locations from JSON content
  const locations = useMemo(() => {
    try {
      return parseLocationsFromJSON(content);
    } catch (error) {
      console.error('[EnhancedTextViewJSON] Failed to parse locations:', error);
      return [];
    }
  }, [content]);

  // Track visible locations using editor hook
  const visibleLocations = useVisibleLocations(
    locations,
    containerRef as React.RefObject<HTMLElement>,
  );

  // Notify parent of visibility changes
  useEffect(() => {
    if (onVisibleLocationsChange) {
      console.log(
        '[EnhancedTextViewJSON] Visible locations changed:',
        visibleLocations,
      );
      onVisibleLocationsChange(visibleLocations);
    }
  }, [visibleLocations, onVisibleLocationsChange]);

  // Add hover event listeners to destination blocks
  useEffect(() => {
    if (!containerRef.current || !onLocationHover) return;

    const handleMouseEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if we're hovering over a destination node or its children
      const destinationNode = target.closest('.destination-node') as HTMLElement;
      
      if (destinationNode?.hasAttribute('data-destination')) {
        try {
          const destinationData = JSON.parse(
            destinationNode.getAttribute('data-destination')!,
          );
          onLocationHover(destinationData.name);
        } catch {
          // Ignore parse errors
        }
      }
    };

    const handleMouseLeave = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Check if we're leaving a destination node
      const destinationNode = target.closest('.destination-node') as HTMLElement;
      
      if (destinationNode?.hasAttribute('data-destination')) {
        // Check if we're actually leaving the destination node, not just moving between its children
        const relatedTarget = e.relatedTarget as HTMLElement;
        if (!relatedTarget || !destinationNode.contains(relatedTarget)) {
          onLocationHover(null);
        }
      }
    };

    const container = containerRef.current;
    container.addEventListener('mouseenter', handleMouseEnter, true);
    container.addEventListener('mouseleave', handleMouseLeave, true);

    return () => {
      container.removeEventListener('mouseenter', handleMouseEnter, true);
      container.removeEventListener('mouseleave', handleMouseLeave, true);
    };
  }, [onLocationHover]);

  // Apply hover effect based on external hover state (from map)
  useEffect(() => {
    if (!containerRef.current) return;

    const destinationNodes = containerRef.current.querySelectorAll('.destination-node');
    destinationNodes.forEach((node) => {
      const element = node as HTMLElement;
      try {
        const destinationData = JSON.parse(element.getAttribute('data-destination')!);
        if (destinationData.name === hoveredLocationName) {
          element.classList.add('hovered');
        } else {
          element.classList.remove('hovered');
        }
      } catch {
        // Ignore parse errors
      }
    });
  }, [hoveredLocationName]);

  // Preserve details open/closed state during re-renders
  // This prevents collapsing when hovering triggers a re-render
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    
    // Save current state of all details elements before DOM updates
    const detailsElements = containerRef.current.querySelectorAll('details.destination-node');
    detailsElements.forEach((details) => {
      const summary = details.querySelector('summary');
      if (summary) {
        const key = summary.textContent?.trim() || '';
        detailsStateRef.current.set(key, details.hasAttribute('open'));
      }
    });
  });
  
  // Restore details state after content updates
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Small delay to ensure DOM is updated
    requestAnimationFrame(() => {
      const detailsElements = containerRef.current?.querySelectorAll('details.destination-node');
      detailsElements?.forEach((details) => {
        const summary = details.querySelector('summary');
        if (summary) {
          const key = summary.textContent?.trim() || '';
          const shouldBeOpen = detailsStateRef.current.get(key);
          if (shouldBeOpen !== undefined) {
            if (shouldBeOpen && !details.hasAttribute('open')) {
              details.setAttribute('open', '');
            } else if (!shouldBeOpen && details.hasAttribute('open')) {
              details.removeAttribute('open');
            }
          }
        }
      });
    });
  }, [content, hoveredLocationName]);

  return (
    <div
      ref={containerRef}
      className="flex flex-row py-8 md:p-20 px-4 h-full overflow-auto"
    >
      <ItineraryEditor
        content={content}
        suggestions={suggestions}
        isCurrentVersion={isCurrentVersion}
        currentVersionIndex={currentVersionIndex}
        status={status}
        onSaveContent={onSaveContent}
        colorMap={colorMap}
      />
    </div>
  );
}
