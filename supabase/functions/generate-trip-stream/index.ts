import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { streamText } from 'npm:ai@latest';
import * as Y from 'npm:yjs@13.6.18';
import * as htmlparser2 from 'npm:htmlparser2@9.0.0';
import { HocuspocusProvider } from 'npm:@hocuspocus/provider@2.13.5';
import { htmlToProseMirrorJSON, appendProseMirrorNodesToYjs } from '../_shared/html-to-yjs.ts';
import { encode } from 'https://deno.land/std@0.168.0/encoding/base64url.ts';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Generate JWT token for Tiptap Cloud authentication
 */
async function generateTiptapJWT(
  appSecret: string,
  appId: string,
  documentName: string,
  userId: string,
  userName: string
): Promise<string> {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    nbf: now,  // Not before timestamp
    exp: now + (24 * 60 * 60), // 24 hours
    iss: 'https://cloud.tiptap.dev',  // Issuer
    aud: appId,  // Audience (App ID)
    sub: userId,  // Subject
    allowedDocumentNames: [documentName],
  };

  const encodedHeader = encode(JSON.stringify(header));
  const encodedPayload = encode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message)
  );

  const encodedSignature = encode(new Uint8Array(signature));
  return `${message}.${encodedSignature}`;
}

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

    // Get AI configuration - AI SDK automatically uses AI_GATEWAY_API_KEY if set
    const aiGatewayApiKey = Deno.env.get('AI_GATEWAY_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    // The AI SDK will automatically use the AI Gateway if AI_GATEWAY_API_KEY is set
    // Otherwise it falls back to OpenAI
    const apiKey = aiGatewayApiKey || openaiApiKey;

    if (!apiKey) {
      throw new Error('AI_GATEWAY_API_KEY or OPENAI_API_KEY must be configured');
    }

    // Get Tiptap Cloud configuration
    const tiptapAppId = 'yko82w79';
    const tiptapAppSecret = Deno.env.get('TIPTAP_APP_SECRET');

    if (!tiptapAppSecret) {
      throw new Error('TIPTAP_APP_SECRET not configured');
    }

    // Generate JWT token for Tiptap Cloud authentication
    console.log('[Generate Trip] Generating Tiptap Cloud token');
    const tiptapToken = await generateTiptapJWT(tiptapAppSecret, tiptapAppId, tripId, 'ai-agent', 'AI Assistant');

    // Tiptap Cloud URL - use HTTPS (HocuspocusProvider handles WebSocket upgrade)
    const tiptapUrl = `https://${tiptapAppId}.collab.tiptap.cloud`;

    // Initialize Y.js document and Hocuspocus provider
    console.log('[Generate Trip] Initializing Tiptap Cloud collaboration');
    console.log('[Generate Trip] Connecting to Tiptap Cloud:', tiptapUrl);
    const ydoc = new Y.Doc();

    const tiptapProvider = new HocuspocusProvider({
      url: tiptapUrl,
      name: tripId,
      document: ydoc,
      token: tiptapToken,
      // WebSocket polyfill for Deno
      WebSocketPolyfill: WebSocket as any,
    });

    // Wait for provider to sync
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[Generate Trip] Tiptap Cloud sync timeout after 30s');
        reject(new Error('Tiptap Cloud sync timeout'));
      }, 30000); // Increased to 30 seconds

      tiptapProvider.on('connect', () => {
        console.log('[Generate Trip] Tiptap Cloud WebSocket connected');
      });

      tiptapProvider.on('synced', () => {
        clearTimeout(timeout);
        console.log('[Generate Trip] Tiptap Cloud provider synced');
        resolve(null);
      });

      tiptapProvider.on('disconnect', ({ event }: any) => {
        console.log('[Generate Trip] Tiptap Cloud disconnected:', event);
      });

      tiptapProvider.on('status', ({ status }: any) => {
        console.log('[Generate Trip] Tiptap Cloud status:', status);
      });

      tiptapProvider.on('error', (error: any) => {
        clearTimeout(timeout);
        console.error('[Generate Trip] Tiptap Cloud error:', error);
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

    // Map model names - AI Gateway expects format "provider/model-name"
    const modelToUse = model === 'mistral-small-latest' ? 'gpt-4o-mini' : model;
    // Always use openai/ prefix - the AI SDK will use AI_GATEWAY_API_KEY if set
    const modelString = `openai/${modelToUse}`;

    console.log('[Generate Trip] Using:', aiGatewayApiKey ? 'Vercel AI Gateway' : 'Direct OpenAI API');
    console.log('[Generate Trip] Starting AI stream with model:', modelString);

    // Use Vercel AI SDK streamText for streaming
    // The AI SDK automatically uses AI_GATEWAY_API_KEY env var if available
    let result;
    try {
      result = await streamText({
        model: modelString,
        system: systemPrompt,
        prompt: prompt,
        temperature,
        maxTokens: 4000,
      });
    } catch (error: any) {
      console.error('[Generate Trip] Error creating stream:', error);
      if (error.message?.includes('quota') || error.message?.includes('429')) {
        throw new Error('AI API quota exceeded. Please ensure AI Gateway is properly configured or try again later.');
      }
      throw error;
    }

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

    // Process the stream using AI SDK's text stream
    for await (const textPart of result.textStream) {
      if (textPart) {
        chunkCount++;

        // Feed chunk to parser
        parser.write(textPart);

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

    // Tiptap Cloud automatically persists changes
    // Wait a moment for final sync, then cleanup
    console.log('[Generate Trip] Waiting for Tiptap Cloud to persist...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Cleanup
    tiptapProvider.destroy();
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
