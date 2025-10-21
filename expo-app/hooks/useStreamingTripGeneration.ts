import { useState, useCallback, useRef } from 'react';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { htmlToProsemirror } from '@/utils/prosemirror-html';

// Toggle to use mock streaming instead of real API
const USE_MOCK_STREAMING = true;

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

// Mock HTML response that aligns with ProseMirror schema (full trip)
const MOCK_TRIP_HTML = `<itinerary>
<h1>Tokyo Food Tour</h1>

<h2>Day 1: Traditional Tokyo</h2>

<h3>Morning: Temple & Markets</h3>
<p>Start your journey at <span class="geo-mark" data-geo-id="loc-001" data-place-name="Senso-ji Temple, Tokyo, Japan" data-lat="35.7148" data-lng="139.7967" data-color-index="0" data-coord-source="google">Senso-ji Temple</span>, Tokyo's oldest Buddhist temple. Explore the vibrant <span class="geo-mark" data-geo-id="loc-002" data-place-name="Nakamise Shopping Street, Tokyo, Japan" data-lat="35.7119" data-lng="139.7965" data-color-index="1" data-coord-source="google">Nakamise Shopping Street</span> for traditional snacks.</p>

<h3>Lunch: Authentic Ramen</h3>
<p>Head to <span class="geo-mark" data-geo-id="loc-003" data-place-name="Ichiran Ramen Shibuya, Tokyo, Japan" data-lat="35.6595" data-lng="139.7004" data-color-index="2" data-coord-source="google">Ichiran Ramen</span> for tonkotsu ramen in solo dining booths.</p>

<blockquote>
<p><strong>Pro Tip:</strong> Get a Suica card for easy transportation. Most restaurants accept cash only!</p>
</blockquote>
</itinerary>`;

// Mock HTML for inline edit (replacing ramen section with sushi alternatives)
const MOCK_INLINE_EDIT_HTML = `<h3>Lunch: Sushi Experience</h3>
<p>Visit <span class="geo-mark" data-geo-id="loc-new-001" data-place-name="Sushi Dai, Tsukiji, Tokyo, Japan" data-lat="35.6654" data-lng="139.7707" data-color-index="3" data-coord-source="google">Sushi Dai</span> at the outer Tsukiji Market for incredibly fresh sushi. Alternatively, try <span class="geo-mark" data-geo-id="loc-new-002" data-place-name="Sushizanmai Tsukiji, Tokyo, Japan" data-lat="35.6657" data-lng="139.7703" data-color-index="4" data-coord-source="google">Sushizanmai</span> for a more accessible option with excellent quality.</p>

<blockquote>
<p><strong>Sushi Tip:</strong> Arrive early at Sushi Dai as lines can be 2+ hours. Sushizanmai is open 24/7 and has shorter waits!</p>
</blockquote>`;

export interface StreamingState {
  isStreaming: boolean;
  isComplete: boolean;
  error: string | null;
  document: any;
  typingInstructions: TypingInstruction[];
  useTypingMode: boolean; // If true, use typing instructions instead of document updates
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
      typingInstructions: [],
      useTypingMode: true,
    });

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      if (USE_MOCK_STREAMING) {
        console.log('[StreamingHook] Using MOCK streaming');
        await simulateMockStreaming(prompt, abortControllerRef.current.signal);
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

  // Mock streaming simulation - generates typing instructions for realistic typing
  const simulateMockStreaming = async (prompt: string, signal: AbortSignal) => {
    console.log('[StreamingHook] Starting mock streaming (typing mode)...');
    console.log('[StreamingHook] Prompt:', prompt);

    // Detect if this is an inline edit (replacement) or full trip generation
    const isInlineEdit = prompt.includes('selected this text');
    console.log('[StreamingHook] Is inline edit:', isInlineEdit);

    // Simulate a brief "thinking" delay before starting
    await new Promise(resolve => setTimeout(resolve, 500));

    // Choose appropriate mock HTML based on prompt type
    const mockHtml = isInlineEdit ? MOCK_INLINE_EDIT_HTML : MOCK_TRIP_HTML;
    console.log('[StreamingHook] Using mock HTML length:', mockHtml.length);

    // Parse the mock HTML into typing instructions
    const instructions = parseHTMLToTypingInstructions(mockHtml);

    console.log(`[StreamingHook] Generated ${instructions.length} typing instructions`);

    // Debug: Count instruction types
    const typeCounts = instructions.reduce((acc, inst) => {
      acc[inst.type] = (acc[inst.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('[StreamingHook] Instruction types:', typeCounts);

    // Debug: Show first few geo-mark instructions
    const geoMarkInstructions = instructions.filter(inst => inst.type === 'insertGeoMark');
    console.log('[StreamingHook] First 3 geo-mark instructions:', geoMarkInstructions.slice(0, 3));

    // Set the instructions but keep document empty - it will be built by typing
    setState(prev => ({
      ...prev,
      isStreaming: false,
      isComplete: false, // Not complete until typing finishes
      typingInstructions: instructions,
    }));

    console.log('[StreamingHook] Mock streaming complete! Ready to type.');
  };

  // Real API streaming
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
