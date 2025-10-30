'use client';

import { Artifact } from '@/components/create-artifact';
import { DiffView } from '@/components/diffview';
import { DocumentSkeleton } from '@/components/document-skeleton';
import { EnhancedTextViewJSON as EnhancedTextView } from './enhanced-text-view-json';
import { WorkspaceView } from './workspace-view';
import {
  ClockRewind,
  CopyIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  UndoIcon,
  MapIcon,
  FileTextIcon,
  LayoutSplitIcon,
  BoxIcon,
} from '@/components/icons';
import type { Suggestion } from '@/lib/db/schema';
import { toast } from 'sonner';
import { getSuggestions } from '../actions';
import { useMemo, Suspense, lazy, useState, useCallback } from 'react';
import { parseLocationsFromJSON, parseTransportationFromJSON } from './location-parser-json';

// Lazy load map to avoid SSR issues
const MapView = lazy(() => import('./map-view').then(mod => ({ default: mod.MapView })));

type ViewMode = 'text' | 'map' | 'split' | 'workspace';

interface TextArtifactMetadata {
  suggestions: Array<Suggestion>;
  viewMode?: ViewMode;
}

export const itineraryArtifactJSON = new Artifact<'itinerary', TextArtifactMetadata>({
  kind: 'itinerary',
  description: 'Travel itineraries and journey plans (JSON format).',
  initialize: async ({ documentId, setMetadata }) => {
    const suggestions = await getSuggestions({ documentId });

    setMetadata({
      suggestions,
    });
  },
  onStreamPart: ({ streamPart, setMetadata, setArtifact }) => {
    if (streamPart.type === 'data-suggestion') {
      setMetadata((metadata) => {
        return {
          suggestions: [...metadata.suggestions, streamPart.data],
        };
      });
    }

    if (streamPart.type === 'data-textDelta') {
      setArtifact((draftArtifact) => {
        // For JSON format, we receive complete JSON documents
        // Replace the content entirely with the new JSON
        console.log('[ItineraryClientJSON] Received text delta:', {
          dataLength: streamPart.data.length,
          isJSON: streamPart.data.startsWith('{'),
          preview: streamPart.data.substring(0, 100)
        });
        
        // Only update content if we have actual data
        // This prevents the content from being empty during streaming transitions
        const newContent = streamPart.data || draftArtifact.content;
        
        return {
          ...draftArtifact,
          content: newContent, // Use new content or keep existing if empty
          isVisible:
            draftArtifact.status === 'streaming' &&
            streamPart.data.length > 400 &&
            streamPart.data.length < 450
              ? true
              : draftArtifact.isVisible,
          status: 'streaming',
        };
      });
    }
    
    // Handle stream completion
    if (streamPart.type === 'finish') {
      setArtifact((draftArtifact) => {
        console.log('[ItineraryClientJSON] Stream finished, setting status to idle');
        return {
          ...draftArtifact,
          status: 'idle',
        };
      });
    }

  },
  content: ({
    mode,
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    getDocumentContentById,
    isLoading,
    metadata,
    setMetadata,
  }) => {
    // Check if document is in workspace mode (legacy format - should not happen with new documents)
    const isWorkspaceMode = useMemo(() => {
      try {
        const doc = JSON.parse(content);
        const hasPlacesPool = doc.content?.some((n: any) => n.type === 'placesPool');
        const hasItineraryPlan = doc.content?.some((n: any) => n.type === 'itineraryPlan');
        return hasPlacesPool && hasItineraryPlan;
      } catch {
        return false;
      }
    }, [content]);
    
    // Parse workspace data if in workspace mode
    const workspaceData = useMemo(() => {
      if (!isWorkspaceMode) return null;
      try {
        const doc = JSON.parse(content);
        const poolNode = doc.content?.find((n: any) => n.type === 'placesPool');
        const planNode = doc.content?.find((n: any) => n.type === 'itineraryPlan');
        return {
          city: poolNode?.attrs?.city || 'Unknown',
          placesPool: poolNode?.attrs?.places || [],
          itineraryPlan: planNode?.attrs || { days: [] },
        };
      } catch {
        return null;
      }
    }, [content, isWorkspaceMode]);
    
    // Use metadata.viewMode directly instead of local state
    // Default to workspace view if document is in workspace mode
    const viewMode = metadata?.viewMode || (isWorkspaceMode ? 'workspace' : 'text');
    
    // State for tracking visible locations in split view
    const [visibleLocationNames, setVisibleLocationNames] = useState<string[]>([]);
    // State for tracking hovered location
    const [hoveredLocationName, setHoveredLocationName] = useState<string | null>(null);
    
    // Parse locations from JSON content
    const locations = useMemo(() => {
      try {
        const parsed = parseLocationsFromJSON(content);
        console.log('[ItineraryClientJSON] Parsed locations from content:', parsed.length, parsed.map(l => ({
          name: l.name,
          hasCoords: !!l.coordinates,
          coords: l.coordinates,
          day: l.day,
          colorIndex: l.colorIndex
        })));
        return parsed;
      } catch (error) {
        console.error('[ItineraryClientJSON] Failed to parse locations:', error);
        return [];
      }
    }, [content]);
    
    // Parse transportation segments from JSON content
    const transportationSegments = useMemo(() => {
      try {
        const segments = parseTransportationFromJSON(content);
        console.log('[ItineraryClientJSON] Parsed transportation segments:', segments.length, segments);
        return segments;
      } catch (error) {
        console.error('[ItineraryClientJSON] Failed to parse transportation segments:', error);
        return [];
      }
    }, [content]);
    
    // Create centralized color map for consistency between map and text
    const colorMap = useMemo(() => {
      // For JSON, we might not need this since colors are in the data
      // But keeping for compatibility with map view
      try {
        const doc = JSON.parse(content);
        const locationNames: string[] = [];
        
        // Extract location names from JSON
        function traverse(node: any) {
          if (node.type === 'text' && node.marks) {
            for (const mark of node.marks) {
              if (mark.type === 'link' && mark.attrs?.locationData) {
                locationNames.push(mark.attrs.locationData.name);
              }
            }
          }
          if (node.content) {
            for (const child of node.content) {
              traverse(child);
            }
          }
        }
        
        if (doc.content) {
          for (const node of doc.content) {
            traverse(node);
          }
        }
        
        const colorMap: any = {};
        locationNames.forEach((name, index) => {
          colorMap[name] = index;
        });
        
        return colorMap;
      } catch {
        return null;
      }
    }, [content]);
    
    // Callback for visibility changes
    const handleVisibleLocationsChange = useCallback((visibleNames: string[]) => {
      setVisibleLocationNames(visibleNames);
    }, []);
    
    // Callback for waypoint changes
    const handleWaypointsChange = useCallback((segmentIndex: number, waypoints: Array<[number, number]>) => {
      if (!content) return;
      
      try {
        const doc = JSON.parse(content);
        let segmentCount = 0;
        let updated = false;
        
        // Find and update the transportation node
        function updateNode(node: any): any {
          if (node.type === 'transportation' && segmentCount === segmentIndex) {
            segmentCount++;
            updated = true;
            return {
              ...node,
              attrs: {
                ...node.attrs,
                waypoints: waypoints.length > 0 ? waypoints : undefined
              }
            };
          }
          if (node.type === 'transportation') {
            segmentCount++;
          }
          if (node.content && Array.isArray(node.content)) {
            return {
              ...node,
              content: node.content.map(updateNode)
            };
          }
          return node;
        }
        
        if (doc.content) {
          doc.content = doc.content.map(updateNode);
        }
        
        if (updated) {
          const updatedContent = JSON.stringify(doc);
          onSaveContent(updatedContent, false);
        }
      } catch (error) {
        console.error('[ClientJSON] Error updating waypoints:', error);
      }
    }, [content, onSaveContent]);
    
    // Handlers for workspace interactions
    const handlePlaceMove = useCallback((place: any, from: 'pool' | number, to: 'pool' | number) => {
      try {
        const doc = JSON.parse(content);
        const poolNode = doc.content?.find((n: any) => n.type === 'placesPool');
        const planNode = doc.content?.find((n: any) => n.type === 'itineraryPlan');
        
        if (!poolNode || !planNode) return;
        
        // Remove place from source
        if (from === 'pool') {
          // Mark place as used
          const placeIndex = poolNode.attrs.places.findIndex((p: any) => p.placeName === place.placeName);
          if (placeIndex !== -1) {
            poolNode.attrs.places[placeIndex].status = 'used';
          }
        } else {
          // Remove from day
          const day = planNode.attrs.days[from];
          if (day) {
            day.places = day.places.filter((p: any) => p.placeName !== place.placeName);
          }
        }
        
        // Add place to destination
        if (to === 'pool') {
          // Mark place as available
          const placeIndex = poolNode.attrs.places.findIndex((p: any) => p.placeName === place.placeName);
          if (placeIndex !== -1) {
            poolNode.attrs.places[placeIndex].status = 'available';
          }
        } else {
          // Add to day
          if (!planNode.attrs.days[to]) {
            planNode.attrs.days[to] = {
              dayNumber: to + 1,
              places: [],
              transportation: [],
            };
          }
          planNode.attrs.days[to].places.push(place);
        }
        
        onSaveContent(JSON.stringify(doc), false);
      } catch (error) {
        console.error('[WorkspaceView] Error moving place:', error);
      }
    }, [content, onSaveContent]);
    
    const handleDayAdd = useCallback(() => {
      try {
        const doc = JSON.parse(content);
        const planNode = doc.content?.find((n: any) => n.type === 'itineraryPlan');
        
        if (!planNode) return;
        
        const newDayNumber = planNode.attrs.days.length + 1;
        planNode.attrs.days.push({
          dayNumber: newDayNumber,
          places: [],
          transportation: [],
        });
        
        onSaveContent(JSON.stringify(doc), false);
      } catch (error) {
        console.error('[WorkspaceView] Error adding day:', error);
      }
    }, [content, onSaveContent]);
    
    const handlePlaceRemove = useCallback((place: any, dayIndex: number) => {
      handlePlaceMove(place, dayIndex, 'pool');
    }, [handlePlaceMove]);

    // Don't show loading skeleton during streaming if we already have content
    if (isLoading && !content) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    if (mode === 'diff') {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return <DiffView oldContent={oldContent} newContent={newContent} />;
    }
    
    // Render workspace view if in workspace mode
    if (viewMode === 'workspace' && workspaceData) {
      return (
        <WorkspaceView
          city={workspaceData.city}
          placesPool={workspaceData.placesPool}
          itineraryPlan={workspaceData.itineraryPlan}
          onPlaceMove={handlePlaceMove}
          onDayAdd={handleDayAdd}
          onPlaceRemove={handlePlaceRemove}
          onSaveContent={(content) => onSaveContent(content, false)}
        />
      );
    }

    // Use content as-is since it should already be in TipTap format
    const processedContent = content;

    const textView = (
      <EnhancedTextView
        content={processedContent}
        suggestions={metadata ? metadata.suggestions : []}
        isCurrentVersion={isCurrentVersion}
        currentVersionIndex={currentVersionIndex}
        status={status}
        onSaveContent={onSaveContent}
        onVisibleLocationsChange={viewMode === 'split' ? handleVisibleLocationsChange : undefined}
        hoveredLocationName={hoveredLocationName}
        onLocationHover={setHoveredLocationName}
        colorMap={colorMap}
      />
    );

    const mapView = (
      <div className="w-full h-full">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse">Loading map...</div>
          </div>
        }>
          <MapView 
            locations={locations} 
            content={content}
            mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
            visibleLocationNames={viewMode === 'split' ? visibleLocationNames : undefined}
            hoveredLocationName={hoveredLocationName}
            onLocationHover={setHoveredLocationName}
            colorMap={colorMap}
            transportationSegments={transportationSegments}
            onWaypointsChange={handleWaypointsChange}
          />
        </Suspense>
      </div>
    );

    if (viewMode === 'text') {
      return textView;
    }

    if (viewMode === 'map') {
      return mapView;
    }

    if (viewMode === 'split') {
      return (
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            {mapView}
          </div>
          <div className="flex-1 min-h-0 overflow-auto border-t">
            {textView}
          </div>
        </div>
      );
    }

    return textView;
  },
  actions: [
    {
      icon: <BoxIcon size={18} />,
      description: 'Workspace view',
      onClick: ({ metadata, setMetadata }) => {
        const viewMode = metadata?.viewMode || 'workspace';
        if (viewMode !== 'workspace') {
          setMetadata((prev) => ({ ...prev, viewMode: 'workspace' }));
        }
      },
      isDisabled: ({ content }) => {
        // Only enable workspace view if document has the right structure
        try {
          const doc = JSON.parse(content);
          const hasPlacesPool = doc.content?.some((n: any) => n.type === 'placesPool');
          const hasItineraryPlan = doc.content?.some((n: any) => n.type === 'itineraryPlan');
          return !(hasPlacesPool && hasItineraryPlan);
        } catch {
          return true;
        }
      },
    },
    {
      icon: <FileTextIcon size={18} />,
      description: 'Text view',
      onClick: ({ metadata, setMetadata }) => {
        const viewMode = metadata?.viewMode || 'text';
        if (viewMode !== 'text') {
          setMetadata((prev) => ({ ...prev, viewMode: 'text' }));
        }
      },
    },
    {
      icon: <MapIcon size={18} />,
      description: 'Map view',
      onClick: ({ metadata, setMetadata }) => {
        const viewMode = metadata?.viewMode || 'text';
        if (viewMode !== 'map') {
          setMetadata((prev) => ({ ...prev, viewMode: 'map' }));
        }
      },
    },
    {
      icon: <LayoutSplitIcon size={18} />,
      description: 'Split view',
      onClick: ({ metadata, setMetadata }) => {
        const viewMode = metadata?.viewMode || 'text';
        if (viewMode !== 'split') {
          setMetadata((prev) => ({ ...prev, viewMode: 'split' }));
        }
      },
    },
    {
      icon: <ClockRewind size={18} />,
      description: 'View changes',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('toggle');
      },
      isDisabled: ({ currentVersionIndex, setMetadata }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <UndoIcon size={18} />,
      description: 'View Previous version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('prev');
      },
      isDisabled: ({ currentVersionIndex }) => {
        if (currentVersionIndex === 0) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <RedoIcon size={18} />,
      description: 'View Next version',
      onClick: ({ handleVersionChange }) => {
        handleVersionChange('next');
      },
      isDisabled: ({ isCurrentVersion }) => {
        if (isCurrentVersion) {
          return true;
        }

        return false;
      },
    },
    {
      icon: <CopyIcon size={18} />,
      description: 'Copy to clipboard',
      onClick: ({ content }) => {
        // Convert JSON to readable text for clipboard
        try {
          const doc = JSON.parse(content);
          let text = '';
          
          function extractText(node: any): string {
            if (node.type === 'text') {
              return node.text || '';
            }
            if (node.content) {
              return node.content.map(extractText).join('');
            }
            return '';
          }
          
          for (const node of doc.content) {
            text += `${extractText(node)}\n\n`;
          }
          
          navigator.clipboard.writeText(text.trim());
          toast.success('Copied to clipboard!');
        } catch {
          // Fallback to copying raw content
          navigator.clipboard.writeText(content);
          toast.success('Copied to clipboard!');
        }
      },
    },
  ],
  toolbar: [
    {
      icon: <PenIcon />,
      description: 'Add final polish',
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Please add final polish and check for grammar, add section titles for better structure, and ensure everything reads smoothly.',
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: 'Request suggestions',
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: 'user',
          parts: [
            {
              type: 'text',
              text: 'Please add suggestions you have that could improve the writing.',
            },
          ],
        });
      },
    },
  ],
});