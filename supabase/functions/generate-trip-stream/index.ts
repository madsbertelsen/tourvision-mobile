import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TripGenerationRequest {
  prompt: string;
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
    const { prompt, model = 'mistral-small-latest', temperature = 0.7 }: TripGenerationRequest = await req.json();

    console.log('[Generate Trip] Processing request:', {
      prompt: prompt.substring(0, 100) + '...',
      model,
    });

    // Get Mistral API key from environment
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!mistralApiKey) {
      throw new Error('MISTRAL_API_KEY not configured');
    }

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

    // Call Mistral API for streaming completion
    const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature,
        max_tokens: 4000,
        stream: true, // Enable streaming
      }),
    });

    if (!mistralResponse.ok) {
      const error = await mistralResponse.text();
      console.error('[Generate Trip] Mistral API error:', error);
      throw new Error(`Mistral API error: ${mistralResponse.status}`);
    }

    // Create a ReadableStream to stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = mistralResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Send any remaining buffer
              if (buffer) {
                controller.enqueue(new TextEncoder().encode(buffer));
              }
              controller.close();
              break;
            }

            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process SSE (Server-Sent Events) format
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6); // Remove 'data: ' prefix

                if (data === '[DONE]') {
                  continue;
                }

                try {
                  const json = JSON.parse(data);
                  const content = json.choices?.[0]?.delta?.content;

                  if (content) {
                    // Stream the content directly to the client
                    controller.enqueue(new TextEncoder().encode(content));
                  }
                } catch (parseError) {
                  console.warn('[Generate Trip] Failed to parse SSE data:', data);
                }
              }
            }
          }
        } catch (error) {
          console.error('[Generate Trip] Stream error:', error);
          controller.error(error);
        }
      },
    });

    // Return the streaming response
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
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
