import { useEffect, useState, useRef, useCallback } from 'react';
import type { Location } from './location-parser';

/**
 * Custom hook to track which locations are visible in the editor viewport
 * Works with TipTap editor rendered content
 */
export function useVisibleLocations(
  locations: Location[],
  containerRef: React.RefObject<HTMLElement>
): string[] {
  const [visibleLocations, setVisibleLocations] = useState<string[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const checkVisibleLocations = useCallback(() => {
    if (!containerRef.current) return;
    
    // Get the scrollable container and its bounds
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    
    // Find all destination nodes in the TipTap editor
    const destinations = container.querySelectorAll('.destination-node[data-destination]');
    console.log('[useVisibleLocations] Found destinations:', destinations.length, 'Locations:', locations.length);
    const visibleSet = new Set<string>();
    
    destinations.forEach((dest) => {
      const dataDestination = dest.getAttribute('data-destination');
      if (!dataDestination) return;
      
      try {
        const destinationData = JSON.parse(dataDestination);
        const locationName = destinationData.name;
        
        // Check if this destination matches any of our locations
        const matchingLocation = locations.find(loc => 
          loc.name === locationName
        );
      
      if (matchingLocation) {
        // Check if the destination is visible in the viewport
        const rect = dest.getBoundingClientRect();
        const isVisible = (
          rect.top < containerRect.bottom &&
          rect.bottom > containerRect.top &&
          rect.left < containerRect.right &&
          rect.right > containerRect.left
        );
        
        if (isVisible) {
          visibleSet.add(matchingLocation.name);
        }
      }
      } catch (e) {
        // Ignore JSON parse errors
      }
    });
    
    // Update state with debounce
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      const newVisibleArray = Array.from(visibleSet);
      // Only update if actually changed
      setVisibleLocations(prev => {
        if (prev.length !== newVisibleArray.length || 
            !prev.every(name => newVisibleArray.includes(name))) {
          return newVisibleArray;
        }
        return prev;
      });
    }, 100);
  }, [locations, containerRef]);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    
    // Initial check
    checkVisibleLocations();
    
    // Listen for scroll events
    const handleScroll = () => {
      checkVisibleLocations();
    };
    
    // Also listen for content changes (ProseMirror updates)
    const observer = new MutationObserver(() => {
      checkVisibleLocations();
    });
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    observer.observe(container, { 
      childList: true, 
      subtree: true,
      characterData: true 
    });
    
    // Cleanup
    return () => {
      container.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [checkVisibleLocations]);
  
  return visibleLocations;
}