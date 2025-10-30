import { useEffect, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

interface ExplorePlaceData {
  placeName: string;
  description: string;
  coordinates: [number, number];
  imageUrl?: string;
  category: 'attraction' | 'restaurant' | 'activity' | 'accommodation' | 'shopping' | 'nature';
  rating?: number;
  priceLevel?: string;
  estimatedDuration?: string;
  address?: string;
  whyVisit: string;
  tags?: string[];
  currentPlaceIndex: number;
  totalPlaces: number;
}

/**
 * Hook to get explore place data from the latest assistant message
 * The LLM sends these via the explorePlace tool
 */
export function useExplorePlace(messages: ChatMessage[]): ExplorePlaceData | null {
  const [exploreData, setExploreData] = useState<ExplorePlaceData | null>(null);

  useEffect(() => {
    if (!messages || messages.length === 0) {
      return;
    }

    // Find the last assistant message
    const lastAssistantMessage = [...messages]
      .reverse()
      .find(msg => msg.role === 'assistant');

    if (!lastAssistantMessage || !lastAssistantMessage.parts) {
      setExploreData(null);
      return;
    }

    // Look for explorePlace tool calls in the message parts
    const explorePlacePart = lastAssistantMessage.parts.find(
      part => part.type === 'tool-explorePlace'
    );

    if (explorePlacePart?.input) {
      console.log('[useExplorePlace] Found explore place data in message:', explorePlacePart.input);
      setExploreData(explorePlacePart.input as ExplorePlaceData);
    } else {
      // Clear explore data if none found
      setExploreData(null);
    }
  }, [messages]);

  return exploreData;
}