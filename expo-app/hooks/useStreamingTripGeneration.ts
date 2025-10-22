import { useState, useCallback, useRef, useEffect } from 'react';
import { htmlToProsemirror } from '@/utils/prosemirror-html';
import { supabase } from '@/lib/supabase/client';

// Get Supabase URL from environment
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';

// Typing instruction types
export type TypingInstruction =
  | { type: 'setHeading'; level: 1 | 2 | 3 }
  | { type: 'typeText'; text: string }
  | { type: 'insertParagraph' }
  | { type: 'insertGeoMark'; attrs: any; text: string }
  | { type: 'selectRange'; from: number; to: number }
  | { type: 'deleteSelection' };

// Parse HTML into typing instructions
function parseHTMLToTypingInstructions(html: string): TypingInstruction[] {
  const instructions: TypingInstruction[] = [];

  // Remove itinerary wrapper tags if present
  const cleanHtml = html.replace(/<\/?itinerary[^>]*>/g, '').trim();

  // Split by HTML tags but keep them
  const tokens = cleanHtml.split(/(<[^>]+>)/g).filter(Boolean);

  let currentElement: string | null = null;
  let currentLevel: number | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    // Check if it's an opening tag (trim for tag matching)
    const trimmedToken = token.trim();
    const headingMatch = trimmedToken.match(/^<h([1-3])(?:\s[^>]*)?>$/i);
    const paragraphMatch = trimmedToken.match(/^<p(?:\s[^>]*)?>$/i);
    const geoMarkMatch = trimmedToken.match(/^<span\s+class="geo-mark"([^>]*)>$/i);
    const blockquoteOpen = trimmedToken.match(/^<blockquote(?:\s[^>]*)?>$/i);

    // Check if it's a closing tag (trim for tag matching)
    const closingHeading = trimmedToken.match(/^<\/h[1-3]>$/i);
    const closingParagraph = trimmedToken.match(/^<\/p>$/i);
    const closingGeoMark = trimmedToken.match(/^<\/span>$/i);
    const closingBlockquote = trimmedToken.match(/^<\/blockquote>$/i);

    if (headingMatch) {
      const level = parseInt(headingMatch[1]) as 1 | 2 | 3;
      instructions.push({ type: 'setHeading', level });
      currentElement = 'heading';
      currentLevel = level;
    } else if (paragraphMatch || blockquoteOpen) {
      // Paragraphs are default, no need to set
      currentElement = 'paragraph';
    } else if (geoMarkMatch) {
      // Parse geo-mark attributes
      const attrsString = geoMarkMatch[1];
      const attrs: any = {};

      const attrRegex = /(\w+(?:-\w+)*)="([^"]*)"/g;
      let match;
      while ((match = attrRegex.exec(attrsString)) !== null) {
        const key = match[1];
        const value = match[2];

        // Convert kebab-case to camelCase for attributes
        let camelKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

        // Remove "data" prefix if present (e.g., "dataGeoId" -> "geoId")
        if (camelKey.startsWith('data')) {
          camelKey = camelKey.charAt(4).toLowerCase() + camelKey.slice(5);
        }

        attrs[camelKey] = value;
      }

      // Get the text content (next token)
      const textContent = tokens[i + 1] || '';
      instructions.push({ type: 'insertGeoMark', attrs, text: textContent });

      // Skip the text token since we already processed it
      i++;
      currentElement = 'geo-mark';
    } else if (closingHeading || closingParagraph || closingBlockquote) {
      // After closing a block element, insert paragraph for next content
      if (closingHeading || closingParagraph || closingBlockquote) {
        instructions.push({ type: 'insertParagraph' });
      }
      currentElement = null;
      currentLevel = null;
    } else if (closingGeoMark) {
      // After geo-mark, continue in current element
      currentElement = currentElement === 'geo-mark' ? 'paragraph' : currentElement;
    } else if (!trimmedToken.startsWith('<')) {
      // It's text content - decode HTML entities but preserve spaces
      const text = token
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"');

      // Only push non-empty text (but preserve spaces)
      if (text.trim()) {
        instructions.push({ type: 'typeText', text });
      }
    }
  }

  return instructions;
}

export interface StreamingState {
  isStreaming: boolean;
  isComplete: boolean;
  error: string | null;
  document: any;
  typingInstructions: TypingInstruction[];
  useTypingMode: boolean; // If true, use typing instructions instead of document updates
  generationId?: string; // Track the current generation
}

export interface UseStreamingTripGenerationReturn {
  state: StreamingState;
  startGeneration: (prompt: string, documentId?: string) => Promise<void>;
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
    typingInstructions: [],
    useTypingMode: true, // Enable typing mode by default
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const htmlBufferRef = useRef<string>('');
  const sessionIdRef = useRef<string | null>(null);
  const channelRef = useRef<any>(null);

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

  const startGeneration = useCallback(async (prompt: string, documentId?: string) => {
    // Reset state
    htmlBufferRef.current = '';
    const sessionId = `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionIdRef.current = sessionId;

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
      typingInstructions: [],
      useTypingMode: true,
    });

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      console.log('[StreamingHook] Starting generation with sessionId:', sessionId);

      // Subscribe to Realtime channel for deltas
      channelRef.current = supabase.channel(`trip-generation:${sessionId}`);

      channelRef.current
        .on('broadcast', { event: 'generation-start' }, (payload: any) => {
          console.log('[StreamingHook] Generation started');
        })
        .on('broadcast', { event: 'generation-delta' }, (payload: any) => {
          const { delta } = payload.payload;
          if (delta) {
            // Append delta to buffer
            htmlBufferRef.current += delta;

            // Try to parse and update document
            const itineraryMatch = htmlBufferRef.current.match(/<itinerary[^>]*>(.*?)(?:<\/itinerary>|$)/is);
            if (itineraryMatch) {
              const itineraryHTML = itineraryMatch[1];
              try {
                const pmDoc = htmlToProsemirror(itineraryHTML);
                setState(prev => ({
                  ...prev,
                  document: pmDoc,
                }));
              } catch (parseError) {
                // Continue streaming even if parse fails
                console.warn('[StreamingHook] Parse error:', parseError);
              }
            }
          }
        })
        .on('broadcast', { event: 'generation-complete' }, (payload: any) => {
          console.log('[StreamingHook] Generation complete');

          // Final parse
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
            const pmDoc = htmlToProsemirror(htmlBufferRef.current);
            setState(prev => ({
              ...prev,
              isStreaming: false,
              isComplete: true,
              document: pmDoc,
            }));
          }

          // Cleanup channel
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }
        })
        .subscribe();

      // Call Edge Function to start generation
      const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-trip-stream`;
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          prompt,
          sessionId,
          model: process.env.EXPO_PUBLIC_AI_MODEL || 'mistral-small-latest',
          temperature: 0.7,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Edge Function error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[StreamingHook] Edge Function result:', result);

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

      // Cleanup channel on error
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return {
    state,
    startGeneration,
    cancel,
  };
}