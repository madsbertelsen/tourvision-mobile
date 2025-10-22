import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import OpenAI from 'https://deno.land/x/openai@v4.28.0/mod.ts';
import * as Y from 'npm:yjs@13.6.18';
import { YServerProvider } from '../_shared/yjs-server-provider.ts';
import { htmlToProseMirrorJSON, applyProseMirrorJSONToYjs } from '../_shared/html-to-yjs.ts';

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

    // Create Supabase client for Y.js provider
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize Y.js document and provider
    console.log('[Generate Trip] Initializing Y.js collaboration');
    const ydoc = new Y.Doc();
    const provider = new YServerProvider(ydoc, {
      supabase,
      documentId: tripId,
      userId: 'ai-assistant',
      userName: 'AI Assistant',
      debug: true,
    });

    // Connect and sync with existing document
    await provider.connect();
    console.log('[Generate Trip] Y.js provider connected and synced');

    // Build the system prompt
    const systemPrompt = `You are an AI assistant helping to write a travel itinerary document.

IMPORTANT: You must respond with valid HTML using only these tags:
- <h1>, <h2>, <h3> for headings
- <p> for paragraphs
- <ul> and <li> for bullet lists
- <strong> for bold text
- <em> for italic text

Do NOT use:
- Markdown syntax (no ** or * or #)
- Any other HTML tags
- Code blocks or formatting

Generate content that fits naturally into a travel itinerary.
Use clear, engaging language suitable for travel planning.
Include practical details like timing, transportation, and tips when relevant.

Example format:
<h1>Weekend in Paris</h1>
<p>A romantic getaway to the City of Light.</p>
<h2>Day 1</h2>
<p>Start your morning at the <strong>Eiffel Tower</strong>. Arrive early to avoid crowds.</p>
<ul>
<li>Visit the observation deck</li>
<li>Take photos at Trocadéro Gardens</li>
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

    // Process stream and apply to Y.js document
    let htmlBuffer = '';
    let chunkCount = 0;

    for await (const chunk of streamResponse) {
      const delta = chunk.choices[0]?.delta?.content;

      if (delta) {
        htmlBuffer += delta;
        chunkCount++;

        // Log progress every 50 chunks
        if (chunkCount % 50 === 0) {
          console.log(`[Generate Trip] Received ${chunkCount} chunks, buffer size: ${htmlBuffer.length}`);
        }
      }
    }

    console.log('[Generate Trip] Stream complete, total chunks:', chunkCount);
    console.log('[Generate Trip] Buffer length:', htmlBuffer.length);

    // Extract content from itinerary tags
    const finalMatch = htmlBuffer.match(/<itinerary[^>]*>(.*?)<\/itinerary>/is);
    const htmlContent = finalMatch ? finalMatch[1] : htmlBuffer;

    console.log('[Generate Trip] Parsing HTML to ProseMirror JSON');
    const pmJSON = htmlToProseMirrorJSON(htmlContent);
    console.log('[Generate Trip] ProseMirror JSON nodes:', pmJSON.content?.length || 0);

    // Apply to Y.js document (this broadcasts via Realtime to all clients)
    console.log('[Generate Trip] Applying changes to Y.js document');
    applyProseMirrorJSONToYjs(ydoc, pmJSON);

    // Persist to database
    console.log('[Generate Trip] Persisting to database');
    await provider.persist();

    // Cleanup
    await provider.destroy();
    console.log('[Generate Trip] Generation complete');

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        tripId,
        contentLength: htmlBuffer.length,
        chunkCount,
        nodeCount: pmJSON.content?.length || 0,
        note: 'AI changes applied via Y.js collaboration. All connected clients receive updates automatically.',
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
