import { useState, useCallback, useRef } from 'react';

// Get Supabase URL from environment
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';

export interface StreamingState {
  isGenerating: boolean;
  error: string | null;
}

export interface UseStreamingDocumentGenerationReturn {
  state: StreamingState;
  startGeneration: (prompt: string, documentId: string) => Promise<void>;
  cancel: () => void;
}

/**
 * Simplified hook for AI document generation using Y.js collaboration
 *
 * The Edge Function now participates as a Y.js collaborator, so we don't need
 * to handle streaming or document updates here. The existing Y.js collaboration
 * infrastructure handles all updates automatically.
 */
export function useStreamingDocumentGeneration(): UseStreamingDocumentGenerationReturn {
  const [state, setState] = useState<StreamingState>({
    isGenerating: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState({
      isGenerating: false,
      error: 'Cancelled by user',
    });
  }, []);

  const startGeneration = useCallback(async (prompt: string, documentId: string) => {
    setState({
      isGenerating: true,
      error: null,
    });

    // Create abort controller for cancellation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      console.log('[useStreamingDocumentGeneration] Starting AI generation for document:', documentId);

      // Call Edge Function - it will handle Y.js collaboration
      const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-document-stream`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          documentId,
          model: process.env.EXPO_PUBLIC_AI_MODEL || 'mistral-small-latest',
          temperature: 0.7,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Edge Function error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[useStreamingDocumentGeneration] Generation complete:', result);

      setState({
        isGenerating: false,
        error: null,
      });

    } catch (error: any) {
      console.error('[useStreamingDocumentGeneration] Error:', error);

      if (error.name === 'AbortError') {
        // Already handled in cancel()
        return;
      }

      setState({
        isGenerating: false,
        error: error.message || 'Failed to generate document',
      });
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
