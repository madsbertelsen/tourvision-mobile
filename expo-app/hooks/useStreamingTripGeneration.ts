import { useState, useCallback, useRef } from 'react';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { htmlToProsemirror } from '@/utils/prosemirror-html';

// Toggle to use mock streaming instead of real API
const USE_MOCK_STREAMING = true;

// Mock HTML response that aligns with ProseMirror schema
const MOCK_TRIP_HTML = `<itinerary>
<h1>5-Day Tokyo Food Lover's Adventure</h1>

<h2>Day 1: Traditional Tokyo</h2>

<h3>Morning: Temple & Markets</h3>
<p>Start your journey at <span class="geo-mark" data-geo-id="loc-001" data-place-name="Senso-ji Temple, Tokyo, Japan" data-lat="35.7148" data-lng="139.7967" data-color-index="0" data-coord-source="google">Senso-ji Temple</span>, Tokyo's oldest Buddhist temple. Explore the vibrant <span class="geo-mark" data-geo-id="loc-002" data-place-name="Nakamise Shopping Street, Tokyo, Japan" data-lat="35.7119" data-lng="139.7965" data-color-index="1" data-coord-source="google">Nakamise Shopping Street</span> leading to the temple, sampling traditional snacks like ningyo-yaki (small cakes) and senbei (rice crackers).</p>

<h3>Lunch: Authentic Ramen</h3>
<p>Head to <span class="geo-mark" data-geo-id="loc-003" data-place-name="Ichiran Ramen Shibuya, Tokyo, Japan" data-lat="35.6595" data-lng="139.7004" data-color-index="2" data-coord-source="google">Ichiran Ramen in Shibuya</span> for an authentic tonkotsu ramen experience in their unique solo dining booths.</p>

<h3>Afternoon: Tsukiji Outer Market</h3>
<p>Visit <span class="geo-mark" data-geo-id="loc-004" data-place-name="Tsukiji Outer Market, Tokyo, Japan" data-lat="35.6654" data-lng="139.7707" data-color-index="3" data-coord-source="google">Tsukiji Outer Market</span> for the freshest sushi and seafood. Try tamago-yaki, grilled scallops, and uni (sea urchin) from the various stalls.</p>

<h2>Day 2: Modern Tokyo Cuisine</h2>

<h3>Morning: Trendy Breakfast</h3>
<p>Experience modern Japanese breakfast at <span class="geo-mark" data-geo-id="loc-005" data-place-name="Bills Omotesando, Tokyo, Japan" data-lat="35.6652" data-lng="139.7125" data-color-index="4" data-coord-source="google">Bills in Omotesando</span>, famous for their fluffy ricotta pancakes.</p>

<h3>Afternoon: Harajuku Street Food</h3>
<p>Explore <span class="geo-mark" data-geo-id="loc-006" data-place-name="Takeshita Street, Tokyo, Japan" data-lat="35.6702" data-lng="139.7033" data-color-index="5" data-coord-source="google">Takeshita Street in Harajuku</span> and try colorful crepes, giant rainbow cotton candy, and Instagram-worthy desserts.</p>

<h3>Evening: Yakitori Alley</h3>
<p>Dine at <span class="geo-mark" data-geo-id="loc-007" data-place-name="Omoide Yokocho, Tokyo, Japan" data-lat="35.6938" data-lng="139.7004" data-color-index="6" data-coord-source="google">Omoide Yokocho (Memory Lane)</span> in Shinjuku, a narrow alley packed with tiny yakitori joints serving grilled chicken skewers and cold beer.</p>

<h2>Day 3: Culinary Classes & Markets</h2>

<h3>Morning: Sushi Making Class</h3>
<p>Join a hands-on sushi-making workshop near <span class="geo-mark" data-geo-id="loc-008" data-place-name="Tokyo Tower, Tokyo, Japan" data-lat="35.6586" data-lng="139.7454" data-color-index="7" data-coord-source="google">Tokyo Tower</span>. Learn to make nigiri, maki rolls, and taste your creations.</p>

<h3>Afternoon: Depachika Food Halls</h3>
<p>Visit the basement food halls (depachika) at <span class="geo-mark" data-geo-id="loc-009" data-place-name="Mitsukoshi Ginza, Tokyo, Japan" data-lat="35.6719" data-lng="139.7659" data-color-index="8" data-coord-source="google">Mitsukoshi in Ginza</span>. Sample premium wagyu beef, artisanal Japanese sweets, and beautifully packaged bento boxes.</p>

<h2>Day 4: Hidden Gems & Local Favorites</h2>

<h3>Morning: Breakfast at Toyosu</h3>
<p>Early visit to <span class="geo-mark" data-geo-id="loc-010" data-place-name="Toyosu Fish Market, Tokyo, Japan" data-lat="35.6425" data-lng="139.7848" data-color-index="9" data-coord-source="google">Toyosu Fish Market</span> (the new Tsukiji) to witness the tuna auctions and enjoy the freshest sushi breakfast at the market restaurants.</p>

<h3>Afternoon: Tempura Experience</h3>
<p>Savor crispy tempura at a traditional restaurant in <span class="geo-mark" data-geo-id="loc-011" data-place-name="Ningyocho, Tokyo, Japan" data-lat="35.6858" data-lng="139.7831" data-color-index="10" data-coord-source="google">Ningyocho</span>, where chefs fry seasonal vegetables and seafood to perfection.</p>

<h2>Day 5: Sweet Endings</h2>

<h3>Morning: Matcha Everything</h3>
<p>Visit <span class="geo-mark" data-geo-id="loc-012" data-place-name="Uji Tea House Asakusa, Tokyo, Japan" data-lat="35.7101" data-lng="139.7989" data-color-index="11" data-coord-source="google">a traditional tea house in Asakusa</span> for matcha ceremonies, matcha ice cream, and matcha parfaits.</p>

<h3>Afternoon: Souvenir Shopping</h3>
<p>Pick up food souvenirs at <span class="geo-mark" data-geo-id="loc-013" data-place-name="Tokyo Station, Tokyo, Japan" data-lat="35.6812" data-lng="139.7671" data-color-index="12" data-coord-source="google">Tokyo Station</span>'s character street and enjoy the famous Tokyo Banana and other local treats.</p>

<blockquote>
<p><strong>Pro Tip:</strong> Get a Suica card for easy transportation between all these locations. Most restaurants accept cash only, so keep yen handy!</p>
</blockquote>
</itinerary>`;

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
      if (USE_MOCK_STREAMING) {
        console.log('[StreamingHook] Using MOCK streaming');
        await simulateMockStreaming(abortControllerRef.current.signal);
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

  // Mock streaming simulation - chunks by semantic units for realistic typing feel
  const simulateMockStreaming = async (signal: AbortSignal) => {
    console.log('[StreamingHook] Starting mock streaming (slow, realistic mode)...');

    // Split by semantic units (headings, paragraphs, etc.) for natural agent typing feel
    const semanticChunks = MOCK_TRIP_HTML
      // Split by major elements but keep the tags
      .split(/(?=<h[1-6]|<p[>\s]|<blockquote)/)
      .filter(chunk => chunk.trim().length > 0);

    console.log(`[StreamingHook] Will stream ${semanticChunks.length} semantic chunks`);

    // Add opening tag first
    htmlBufferRef.current = '<itinerary>';

    for (let i = 0; i < semanticChunks.length; i++) {
      // Check if cancelled
      if (signal.aborted) {
        throw new Error('AbortError');
      }

      const chunk = semanticChunks[i];
      const chunkPreview = chunk.replace(/\n/g, ' ').substring(0, 50);
      console.log(`[StreamingHook] Chunk ${i + 1}/${semanticChunks.length}:`, chunkPreview);

      // Stream the chunk character by character for extra smooth effect
      const charsPerUpdate = 10; // characters to add at once (reduced for slower feel)
      for (let j = 0; j < chunk.length; j += charsPerUpdate) {
        if (signal.aborted) throw new Error('AbortError');

        const miniChunk = chunk.substring(j, j + charsPerUpdate);
        htmlBufferRef.current += miniChunk;

        // Try to extract and parse itinerary content
        const itineraryMatch = htmlBufferRef.current.match(/<itinerary[^>]*>(.*?)$/is);

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
            // Silent - partial HTML may not parse yet
          }
        }

        // Slower delay for realistic typing feel
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      // Much longer pause between semantic units (headings, paragraphs)
      // Vary the delay to feel more natural:
      // - Longer after headings (agent "thinking" about what to write)
      // - Medium after paragraphs
      const isHeading = chunk.trim().startsWith('<h');
      const delay = isHeading ? 800 : 500; // ms (doubled for slower feel)

      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Add closing tag and final parse
    htmlBufferRef.current += '</itinerary>';

    const finalMatch = htmlBufferRef.current.match(/<itinerary[^>]*>(.*?)<\/itinerary>/is);
    if (finalMatch) {
      const pmDoc = htmlToProsemirror(finalMatch[1]);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        isComplete: true,
        document: pmDoc,
      }));
      console.log('[StreamingHook] Mock streaming complete!');
    } else {
      throw new Error('Failed to parse mock HTML');
    }
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
