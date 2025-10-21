import { useState, useCallback, useRef, useEffect } from 'react';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { htmlToProsemirror } from '@/utils/prosemirror-html';
import {
  getSocket,
  joinDocument,
  requestAIGeneration,
  subscribe,
  disconnect,
  getCurrentDocumentId
} from '@/lib/collab-socket';

// Toggle to use collab server or real API
const USE_COLLAB_SERVER = true; // Changed from USE_MOCK_STREAMING

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
  const unsubscribersRef = useRef<Array<() => void>>([]);

  // Set up Socket.IO event listeners
  useEffect(() => {
    if (!USE_COLLAB_SERVER) return;

    // Subscribe to AI generation events
    const unsubStart = subscribe('ai-generation-started', (data: any) => {
      console.log('[StreamingHook] AI generation started:', data);
      setState(prev => ({
        ...prev,
        generationId: data.generationId,
      }));
    });

    const unsubSteps = subscribe('steps', (data: any) => {
      console.log('[StreamingHook] Received steps:', data);
      // Process steps from AI
      if (data.clientID === 'ai-assistant' && data.isAI) {
        // Convert ProseMirror steps to typing instructions
        // For now, we'll just log them
        console.log('[StreamingHook] AI steps received, would convert to typing instructions');
      }
    });

    const unsubComplete = subscribe('ai-generation-complete', (data: any) => {
      console.log('[StreamingHook] AI generation complete:', data);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        isComplete: true,
      }));
    });

    const unsubCancelled = subscribe('ai-generation-cancelled', (data: any) => {
      console.log('[StreamingHook] AI generation cancelled:', data);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: 'Generation cancelled',
      }));
    });

    const unsubError = subscribe('ai-error', (error: any) => {
      console.error('[StreamingHook] AI error:', error);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: error.message || 'AI generation failed',
      }));
    });

    unsubscribersRef.current = [unsubStart, unsubSteps, unsubComplete, unsubCancelled, unsubError];

    // Cleanup on unmount
    return () => {
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
    };
  }, []);

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
      if (USE_COLLAB_SERVER) {
        console.log('[StreamingHook] Using COLLAB SERVER for AI generation');
        // Use provided documentId (should be trip ID), fallback to temporary ID only if not provided
        const docId = documentId || `doc-${Date.now()}`;
        console.log('[StreamingHook] Using document ID:', docId);
        await streamFromCollabServer(prompt, docId, abortControllerRef.current.signal);
      } else {
        console.log('[StreamingHook] Using REAL API streaming');
        await streamFromAPI(prompt, abortControllerRef.current.signal);
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

  // Stream from collab server via Socket.IO
  const streamFromCollabServer = async (prompt: string, documentId: string, signal: AbortSignal) => {
    console.log('[StreamingHook] Starting collab server streaming...');
    console.log('[StreamingHook] Document ID:', documentId);
    console.log('[StreamingHook] Prompt:', prompt);

    try {
      // Join document if not already joined
      const currentDocId = getCurrentDocumentId();
      if (currentDocId !== documentId) {
        console.log('[StreamingHook] Joining document:', documentId);
        await joinDocument(documentId, 'User', undefined);
      }

      // Detect if this is an inline edit
      const isInlineEdit = prompt.includes('selected this text');
      console.log('[StreamingHook] Is inline edit:', isInlineEdit);

      // Request AI generation with options
      const options: any = {
        model: process.env.EXPO_PUBLIC_AI_MODEL || 'mistral-small-latest',
        temperature: 0.7,
      };

      // If inline edit, extract the selection range from prompt
      if (isInlineEdit) {
        // Parse the prompt to extract context
        // For now, just set example values
        options.replaceRange = { from: 100, to: 200 };
      }

      console.log('[StreamingHook] Requesting AI generation with options:', options);
      const generationId = await requestAIGeneration(documentId, prompt, options);

      console.log('[StreamingHook] Generation started with ID:', generationId);

      // Update state with generation ID
      setState(prev => ({
        ...prev,
        generationId,
      }));

      // The actual content will come through the Socket.IO events we subscribed to in useEffect

    } catch (error: any) {
      console.error('[StreamingHook] Collab server error:', error);
      throw error;
    }
  };

  // Real API streaming (existing code)
  const streamFromAPI = async (prompt: string, signal: AbortSignal) => {
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