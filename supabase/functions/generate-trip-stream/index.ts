import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Mistral } from 'npm:@mistralai/mistralai@1.3.0';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TripGenerationRequest {
  prompt: string;
  sessionId: string; // Client provides session ID for Realtime channel
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
      sessionId,
      model = 'mistral-small-latest',
      temperature = 0.7
    }: TripGenerationRequest = await req.json();

    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    console.log('[Generate Trip] Processing request:', {
      sessionId,
      prompt: prompt.substring(0, 100) + '...',
      model,
    });

    // Get Mistral API key from environment
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }

    // Create Supabase client for Realtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Initialize Mistral client
    const mistralClient = new Mistral({ apiKey: mistralApiKey });

    // Subscribe to Realtime channel for broadcasting
    const channel = supabase.channel(`trip-generation:${sessionId}`);
    await channel.subscribe();

    // Broadcast start event
    await channel.send({
      type: 'broadcast',
      event: 'generation-start',
      payload: { sessionId, timestamp: new Date().toISOString() },
    });

    // Stream completion with Mistral SDK
    const streamResponse = await mistralClient.chat.stream({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature,
      maxTokens: 4000,
    });

    // Process stream and broadcast deltas via Realtime
    let fullContent = '';
    let chunkCount = 0;
    const eventLog: Array<{ event: string; timestamp: string; data?: any }> = [];

    // Log start event
    eventLog.push({
      event: 'generation-start',
      timestamp: new Date().toISOString(),
    });

    for await (const chunk of streamResponse) {
      const delta = chunk.data.choices[0]?.delta?.content;

      if (delta) {
        fullContent += delta;
        chunkCount++;

        // Broadcast delta via Realtime
        await channel.send({
          type: 'broadcast',
          event: 'generation-delta',
          payload: {
            sessionId,
            delta,
            chunkNumber: chunkCount,
            timestamp: new Date().toISOString(),
          },
        });

        // Log delta (first 50 chars only for brevity)
        eventLog.push({
          event: 'generation-delta',
          timestamp: new Date().toISOString(),
          data: {
            chunkNumber: chunkCount,
            deltaPreview: delta.substring(0, 50) + (delta.length > 50 ? '...' : ''),
          },
        });
      }
    }

    // Broadcast completion event
    await channel.send({
      type: 'broadcast',
      event: 'generation-complete',
      payload: {
        sessionId,
        fullContent,
        chunkCount,
        timestamp: new Date().toISOString(),
      },
    });

    // Log completion event
    eventLog.push({
      event: 'generation-complete',
      timestamp: new Date().toISOString(),
      data: { contentLength: fullContent.length, chunkCount },
    });

    console.log('[Generate Trip] Generation complete:', {
      sessionId,
      contentLength: fullContent.length,
      chunkCount,
    });

    // Cleanup: unsubscribe from channel
    await supabase.removeChannel(channel);

    // Return success response with full content and event log
    return new Response(
      JSON.stringify({
        success: true,
        sessionId,
        contentLength: fullContent.length,
        chunkCount,
        fullContent, // Include the generated content for testing
        eventLog, // Include log of Realtime events broadcast
        realtimeChannel: `trip-generation:${sessionId}`,
        note: 'This response includes the full generated content for testing. In production, clients subscribe to the Realtime channel to receive deltas.',
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
