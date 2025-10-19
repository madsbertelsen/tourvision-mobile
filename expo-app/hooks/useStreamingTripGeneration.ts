import { useState, useCallback, useRef } from 'react';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { htmlToProsemirror } from '@/utils/prosemirror-html';

export interface StreamingState {
  isStreaming: boolean;
  isComplete: boolean;
  error: string | null;
  document: any;
}

export interface UseStreamingTripGenerationReturn {
  state: StreamingState;
  startGeneration: (prompt: string) => Promise<void>;
  cancel: () => void;
}

export function useStreamingTripGeneration(): UseStreamingTripGenerationReturn {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    isComplete: false,
    error: null,
    document: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: `node-${Date.now()}` }, content: [] }
      ]
    },
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const htmlBufferRef = useRef<string>('');

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({
      ...prev,
      isStreaming: false,
      error: 'Cancelled by user',
    }));
  }, []);

  const startGeneration = useCallback(async (prompt: string) => {
    // Reset state
    htmlBufferRef.current = '';
    setState({
      isStreaming: true,
      isComplete: false,
      error: null,
      document: {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { id: `node-${Date.now()}` }, content: [] }
        ]
      },
    });

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const apiUrl = generateAPIUrl('/api/chat-simple');
      console.log('[StreamingHook] Calling API:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: prompt,
                }
              ],
            },
          ],
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[StreamingHook] Stream complete');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('[StreamingHook] Received chunk:', chunk.substring(0, 100));

        // Add chunk to buffer
        htmlBufferRef.current += chunk;

        // Try to extract itinerary content
        const itineraryMatch = htmlBufferRef.current.match(/<itinerary[^>]*>(.*?)(?:<\/itinerary>|$)/is);

        if (itineraryMatch) {
          const itineraryHTML = itineraryMatch[1];

          // Convert HTML to ProseMirror JSON
          try {
            const pmDoc = htmlToProsemirror(itineraryHTML);

            // Update document state
            setState(prev => ({
              ...prev,
              document: pmDoc,
            }));
          } catch (parseError) {
            console.warn('[StreamingHook] Parse error (continuing):', parseError);
            // Continue streaming even if parse fails
          }
        }
      }

      // Final parse of complete content
      const finalMatch = htmlBufferRef.current.match(/<itinerary[^>]*>(.*?)<\/itinerary>/is);
      if (finalMatch) {
        const pmDoc = htmlToProsemirror(finalMatch[1]);
        setState(prev => ({
          ...prev,
          isStreaming: false,
          isComplete: true,
          document: pmDoc,
        }));
      } else {
        // No itinerary tags found, try parsing the whole buffer
        console.warn('[StreamingHook] No itinerary tags found, parsing raw HTML');
        const pmDoc = htmlToProsemirror(htmlBufferRef.current);
        setState(prev => ({
          ...prev,
          isStreaming: false,
          isComplete: true,
          document: pmDoc,
        }));
      }

    } catch (error: any) {
      console.error('[StreamingHook] Error:', error);

      if (error.name === 'AbortError') {
        // Already handled in cancel()
        return;
      }

      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: error.message || 'Failed to generate trip',
      }));
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  return {
    state,
    startGeneration,
    cancel,
  };
}
