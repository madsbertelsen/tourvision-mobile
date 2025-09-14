'use client';

import { lazy, Suspense, memo, useEffect, useState } from 'react';
import { useExplorePlacesStream } from '@/hooks/use-explore-places-stream';
import { DocumentToolResult } from './document';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import type { Document } from '@/lib/db/schema';

// Lazy load the ExplorePlace component to avoid SSR issues with Mapbox
const ExplorePlace = lazy(() => 
  import('./explore-place-list').then(mod => ({ 
    default: mod.ExplorePlaceList 
  }))
);

interface ItineraryDocumentPreviewProps {
  part: any;
  state: string;
  isReadonly: boolean;
}

// Component to handle itinerary document preview with place selection UI
const PureItineraryDocumentPreview = ({ 
  part, 
  state, 
  isReadonly 
}: ItineraryDocumentPreviewProps) => {
  // Get streaming data from the custom hook
  const streamingData = useExplorePlacesStream();
  
  // Fetch the document when we have an ID
  const { data: documents } = useSWR<Array<Document>>(
    state === 'output-available' && part.output?.id 
      ? `/api/document?id=${part.output.id}` 
      : null,
    fetcher
  );
  
  // Parse places from the fetched document
  let completedData = null;
  if (documents && documents[0]) {
    try {
      const content = JSON.parse(documents[0].content || '{}');
      
      // First try to find the hidden metadata paragraph with places data
      const metadataNode = content.content?.find((n: any) => 
        n.type === 'paragraph' && n.attrs?.['data-places-pool']
      );
      
      if (metadataNode?.attrs?.['data-places-pool']) {
        const places = JSON.parse(metadataNode.attrs['data-places-pool']);
        const city = metadataNode.attrs['data-city'] || 'the destination';
        completedData = { city, places };
      } else {
        // Fallback: try old format with placesPool node
        const poolNode = content.content?.find((n: any) => n.type === 'placesPool');
        if (poolNode?.attrs) {
          completedData = {
            city: poolNode.attrs.city,
            places: poolNode.attrs.places || []
          };
        }
      }
    } catch (error) {
      console.error('[ItineraryDocumentPreview] Error parsing document:', error);
    }
  }
  
  // Determine what data to display
  // Use streaming data if available, otherwise use parsed completed data
  const displayData = streamingData || completedData;
  const hasPlaces = displayData?.places?.length > 0;
  
  console.log('[ItineraryDocumentPreview] State:', state, 'Streaming data:', streamingData, 'Completed data:', completedData, 'Display data:', displayData);
  
  // Check if artifact is visible
  const isArtifactVisible = typeof window !== 'undefined' && 
    document.querySelector('[data-artifact-visible="true"]');
  
  // Show open button when we have output
  const showOpenButton = state === 'output-available' && part.output;
  
  // Show loading state when we don't have any data yet
  if (!hasPlaces) {
    return (
      <div className="w-full">
        <div className="border rounded-xl p-6 space-y-3 bg-background">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full size-5 border-b-2 border-primary" />
            <span className="text-sm text-muted-foreground">
              {streamingData ? `Found ${streamingData.places?.length || 0} places so far...` : 'Preparing personalized places...'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Finding the best attractions, restaurants, and experiences based on your preferences...
          </div>
        </div>
      </div>
    );
  }
  
  // Show the ExplorePlace component with available data
  return (
    <div className="w-full overflow-hidden">
      {/* Place selection UI */}
      <div>
        <Suspense fallback={
          <div className="h-[600px] bg-muted/50 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading interactive explorer...</p>
            </div>
          </div>
        }>
          <ExplorePlace
            city={displayData.city}
            places={displayData.places}
            documentId={part.output?.id}
            documentTitle={part.output?.title || 'Itinerary'}
            onComplete={(reactions) => {
              console.log('[ItineraryDocumentPreview] User reactions:', reactions);
              // TODO: Send reactions back to AI for itinerary generation
            }}
          />
        </Suspense>
      </div>
    </div>
  );
};

export const ItineraryDocumentPreview = memo(
  PureItineraryDocumentPreview,
  (prevProps, nextProps) => {
    // Re-render if state or part changes
    if (prevProps.state !== nextProps.state) return false;
    if (prevProps.part !== nextProps.part) return false;
    return true;
  }
);