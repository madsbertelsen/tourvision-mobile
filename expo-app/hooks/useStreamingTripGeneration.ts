import { useState, useCallback, useRef } from 'react';
import { htmlToProsemirror } from '@/utils/prosemirror-html';

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
      console.log('[StreamingHook] Using Edge Function for AI generation');
      await streamFromEdgeFunction(prompt, abortControllerRef.current.signal);
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

  // Stream from Edge Function
  const streamFromEdgeFunction = async (prompt: string, signal: AbortSignal) => {
    const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/generate-trip-stream`;
    console.log('[StreamingHook] Calling Edge Function:', edgeFunctionUrl);

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        prompt: prompt,
        model: process.env.EXPO_PUBLIC_AI_MODEL || 'mistral-small-latest',
        temperature: 0.7,
      }),
      signal,
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
  };

  return {
    state,
    startGeneration,
    cancel,
  };
}