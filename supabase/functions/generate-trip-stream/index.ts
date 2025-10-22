import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://deno.land/x/openai@v4.28.0/mod.ts';
import * as Y from 'npm:yjs@13.6.18';
import * as htmlparser2 from 'npm:htmlparser2@9.0.0';
import { HocuspocusProvider } from 'npm:@hocuspocus/provider@2.13.5';
import { htmlToProseMirrorJSON, applyProseMirrorJSONToYjs, appendProseMirrorNodesToYjs } from '../_shared/html-to-yjs.ts';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TripGenerationRequest {
  prompt: string;
  tripId: string; // The trip document to collaborate on
  model?: string;
  temperature?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const {
      prompt,
      tripId,
      model = 'mistral-small-latest',
      temperature = 0.7
    }: TripGenerationRequest = await req.json();

    if (!tripId) {
      throw new Error('tripId is required');
    }

    console.log('[Generate Trip] Processing request:', {
      tripId,
      prompt: prompt.substring(0, 100) + '...',
      model,
    });

    // Get AI Gateway configuration (falls back to direct OpenAI if not configured)
    const aiGatewayBaseUrl = Deno.env.get('AI_GATEWAY_BASE_URL');
    const aiGatewayApiKey = Deno.env.get('AI_GATEWAY_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    // Use AI Gateway if configured, otherwise direct OpenAI
    const useGateway = aiGatewayBaseUrl && aiGatewayApiKey;
    const apiKey = useGateway ? aiGatewayApiKey : openaiApiKey;
    const baseURL = useGateway ? aiGatewayBaseUrl : undefined;

    if (!apiKey) {
      throw new Error('AI_GATEWAY_API_KEY or OPENAI_API_KEY must be configured');
    }

    console.log('[Generate Trip] Using:', useGateway ? `AI Gateway (${baseURL})` : 'Direct OpenAI API');

    // Get Hocuspocus URL
    // TEST: Use Edge Function instead of standalone server
    // Standalone: ws://host.docker.internal:1234/collaboration (for Docker)
    // Edge Function: ws://127.0.0.1:54321/functions/v1/hocuspocus-ws (same runtime)
    const hocuspocusUrl = Deno.env.get('HOCUSPOCUS_URL') || 'ws://127.0.0.1:54321/functions/v1/hocuspocus-ws';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // For server-side, we use the service role key as the token
    // Append to URL for Edge Function (WebSocket can't send custom headers)
    const authToken = supabaseServiceKey;
    const urlWithToken = `${hocuspocusUrl}?token=${encodeURIComponent(authToken)}`;

    // Initialize Y.js document and Hocuspocus provider
    console.log('[Generate Trip] Initializing Hocuspocus collaboration');
    console.log('[Generate Trip] Connecting to Edge Function:', hocuspocusUrl);
    const ydoc = new Y.Doc();

    const provider = new HocuspocusProvider({
      url: urlWithToken,
      name: tripId,
      document: ydoc,
      // Don't pass token separately for Edge Function (already in URL)
      // token: authToken,
      // WebSocket polyfill for Deno
      WebSocketPolyfill: WebSocket as any,
    });

    // Wait for provider to sync
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Hocuspocus sync timeout')), 10000);

      provider.on('synced', () => {
        clearTimeout(timeout);
        console.log('[Generate Trip] Hocuspocus provider synced');
        resolve(null);
      });

      provider.on('error', (error: any) => {
        clearTimeout(timeout);
        console.error('[Generate Trip] Hocuspocus error:', error);
        reject(error);
      });
    });

    // Build the system prompt
    const systemPrompt = `You are an AI assistant helping to write a travel itinerary document.

IMPORTANT: You must respond with valid HTML using these tags:
- <h1>, <h2>, <h3> for headings
- <p> for paragraphs
- <ul> and <li> for bullet lists
- <strong> for bold text
- <em> for italic text
- <span class="geo-mark"> for locations with coordinates

For locations (landmarks, attractions, restaurants, hotels, neighborhoods):
Wrap them in geo-mark spans with approximate coordinates:
<span class="geo-mark" data-place-name="Full Location Name, City, Country" data-lat="latitude" data-lng="longitude" data-color-index="0" data-coord-source="llm">Location Name</span>

Example:
<span class="geo-mark" data-place-name="Eiffel Tower, Paris, France" data-lat="48.8584" data-lng="2.2945" data-color-index="0" data-coord-source="llm">Eiffel Tower</span>

Use different data-color-index values (0-9) for different locations to help distinguish them visually.

Do NOT use:
- Markdown syntax (no ** or * or #)
- Code blocks or formatting
- Other HTML tags not listed above

Generate content that fits naturally into a travel itinerary.
Use clear, engaging language suitable for travel planning.
Include practical details like timing, transportation, and tips when relevant.

Example format:
<h1>Weekend in Paris</h1>
<p>A romantic getaway to the City of Light.</p>
<h2>Day 1</h2>
<p>Start your morning at the <span class="geo-mark" data-place-name="Eiffel Tower, Paris, France" data-lat="48.8584" data-lng="2.2945" data-color-index="0" data-coord-source="llm">Eiffel Tower</span>. Arrive early to avoid crowds.</p>
<ul>
<li>Visit the observation deck</li>
<li>Take photos at <span class="geo-mark" data-place-name="Trocadéro Gardens, Paris, France" data-lat="48.8620" data-lng="2.2877" data-color-index="1" data-coord-source="llm">Trocadéro Gardens</span></li>
</ul>

Wrap your entire response in <itinerary></itinerary> tags.`;

    // Initialize OpenAI client (with AI Gateway if configured)
    const openai = new OpenAI({
      apiKey,
      baseURL,
    });

    // Stream completion with OpenAI
    console.log('[Generate Trip] Starting OpenAI stream');
    const streamResponse = await openai.chat.completions.create({
      model: model === 'mistral-small-latest' ? 'gpt-4o-mini' : model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: 4000,
      stream: true,
    });

    // Clear document first for streaming
    const fragment = ydoc.getXmlFragment('prosemirror');
    ydoc.transact(() => {
      fragment.delete(0, fragment.length);
    }, 'ai-assistant-clear');

    // Track streaming state
    let chunkCount = 0;
    let completeBlocks: string[] = [];
    let currentBlockHtml = '';
    let currentTag = '';
    let tagStack: string[] = [];
    let insideItinerary = false;
    let textBuffer = '';
    let totalNodesApplied = 0;

    // Create HTML parser for incremental parsing
    const parser = new htmlparser2.Parser({
      onopentag(name: string, attributes: {[key: string]: string}) {
        // Skip itinerary wrapper
        if (name === 'itinerary') {
          insideItinerary = true;
          return;
        }

        if (!insideItinerary) return;

        // Track tag stack
        tagStack.push(name);

        // Build opening tag with attributes
        let tag = `<${name}`;
        for (const [key, value] of Object.entries(attributes)) {
          tag += ` ${key}="${value}"`;
        }
        tag += '>';

        currentBlockHtml += tag;

        // Track block-level elements
        if (['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'blockquote'].includes(name)) {
          if (currentTag === '') {
            currentTag = name;
          }
        }
      },

      ontext(text: string) {
        if (!insideItinerary) return;

        // Accumulate text
        textBuffer += text;
        currentBlockHtml += text;
      },

      onclosetag(name: string) {
        if (name === 'itinerary') {
          insideItinerary = false;
          return;
        }

        if (!insideItinerary) return;

        // Remove from tag stack
        tagStack.pop();

        // Add closing tag
        currentBlockHtml += `</${name}>`;

        // Check if we completed a block-level element
        if (name === currentTag && tagStack.length === 0) {
          // We have a complete block!
          completeBlocks.push(currentBlockHtml);

          console.log(`[Generate Trip] Complete block detected: ${name} (length: ${currentBlockHtml.length})`);

          // Process accumulated blocks periodically (batch of 3 for less frequent updates)
          if (completeBlocks.length >= 3) {
            const blocksToProcess = [...completeBlocks];
            completeBlocks = [];

            console.log(`[Generate Trip] Processing ${blocksToProcess.length} complete blocks`);

            // Convert to ProseMirror nodes
            const nodes: any[] = [];
            for (const block of blocksToProcess) {
              const blockJSON = htmlToProseMirrorJSON(block);
              if (blockJSON.content && blockJSON.content.length > 0) {
                nodes.push(...blockJSON.content);
              }
            }

            if (nodes.length > 0) {
              // Append to Y.js document (broadcasts to clients)
              appendProseMirrorNodesToYjs(ydoc, nodes);
              totalNodesApplied += nodes.length;

              // Get current document size for verification
              const fragment = ydoc.getXmlFragment('prosemirror');
              console.log(`[Generate Trip] Streamed ${nodes.length} nodes to document (total in fragment: ${fragment.length})`);
            }
          }

          // Reset for next block
          currentBlockHtml = '';
          currentTag = '';
          textBuffer = '';
        }
      },

      onerror(error: Error) {
        console.error('[Generate Trip] Parser error:', error);
      }
    }, {
      decodeEntities: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true
    });

    // Process the stream
    for await (const chunk of streamResponse) {
      const delta = chunk.choices[0]?.delta?.content;

      if (delta) {
        chunkCount++;

        // Feed chunk to parser
        parser.write(delta);

        // Log progress
        if (chunkCount % 50 === 0) {
          console.log(`[Generate Trip] Received ${chunkCount} chunks, complete blocks: ${completeBlocks.length}`);
        }
      }
    }

    // End parsing
    parser.end();

    console.log('[Generate Trip] Stream complete, total chunks:', chunkCount);

    // Process any remaining complete blocks
    if (completeBlocks.length > 0) {
      console.log(`[Generate Trip] Processing final ${completeBlocks.length} blocks`);

      const nodes: any[] = [];
      for (const block of completeBlocks) {
        const blockJSON = htmlToProseMirrorJSON(block);
        if (blockJSON.content && blockJSON.content.length > 0) {
          nodes.push(...blockJSON.content);
        }
      }

      if (nodes.length > 0) {
        appendProseMirrorNodesToYjs(ydoc, nodes);
        totalNodesApplied += nodes.length;
        console.log(`[Generate Trip] Applied final ${nodes.length} nodes`);
      }
    }

    // Handle any incomplete block (shouldn't happen with well-formed HTML)
    if (currentBlockHtml.trim()) {
      console.log('[Generate Trip] Warning: Incomplete block at end of stream:', currentBlockHtml.substring(0, 100));
    }

    // Hocuspocus automatically persists via onStoreDocument hook
    // Just wait a moment for final save, then cleanup
    console.log('[Generate Trip] Waiting for Hocuspocus to persist...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Cleanup
    provider.destroy();
    console.log('[Generate Trip] Generation complete');

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        tripId,
        chunkCount,
        blocksProcessed: completeBlocks.length,
        totalNodesApplied,
        note: 'AI changes streamed incrementally via Y.js collaboration. All connected clients received real-time updates.',
      }, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Generate Trip] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
