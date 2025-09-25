import { EnrichmentPipeline } from '@/lib/enrichment-pipeline';
import { mistral } from '@ai-sdk/mistral';
import { convertToModelMessages, createUIMessageStream, JsonToSseTransformStream, smoothStream, streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Convert UIMessages to ModelMessages format
  const modelMessages = convertToModelMessages(messages);

  // Initialize enrichment pipeline with Google Maps API key if available
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const enrichmentPipeline = new EnrichmentPipeline(googleApiKey);

  // Create UI message stream with improved pattern
  const stream = createUIMessageStream({
    execute: ({ writer: dataStream }) => {
      const result = streamText({
        model: mistral('mistral-small-latest'),
        experimental_transform: smoothStream({
          delayInMs: 20,
          chunking: 'line',
        }),
        messages: modelMessages,
        system: `You are a helpful travel planning assistant.

When users ask about trip planning or itineraries:
1. FIRST respond conversationally with regular text (e.g., "That sounds like a wonderful trip! Paris is...")
2. THEN present the detailed itinerary wrapped in <itinerary> tags
3. Inside <itinerary> tags, use ONLY HTML formatting (no markdown)

Example response format:
That sounds like a wonderful trip! Paris is a city full of romance and history. Here's a detailed 3-day itinerary for you:

<itinerary>
  <h1>Paris in 3 Days</h1>
  <p>Experience the best of Paris...</p>
  <h2>Day 1: Iconic Landmarks</h2>
  <h3>Morning</h3>
  <p>Start your day at...</p>
  <!-- etc -->
</itinerary>

I hope this itinerary helps you make the most of your time in Paris!

HTML tags to use inside <itinerary>:
- <h1> for the main title
- <h2> for day headers
- <h3> for time periods (Morning, Afternoon, Evening)
- <p> for paragraphs
- <ul> and <li> for lists
- <strong> for bold text
- <em> for italic text

NEVER use markdown (no #, ##, **, *, etc.) inside <itinerary> tags.
NEVER include <html>, <body>, <head> or other document-level tags.

For locations inside itineraries, use this special format to enable map visualization:
<span class="geo-mark" data-geo="true" data-lat="48.8584" data-lng="2.2945" data-place-name="Eiffel Tower, Paris" title="📍 Eiffel Tower">Eiffel Tower</span>

Include known coordinates for major landmarks:
- Eiffel Tower, Paris: lat="48.8584" lng="2.2945"
- Louvre Museum, Paris: lat="48.8606" lng="2.3376"
- Sagrada Familia, Barcelona: lat="41.4036" lng="2.1744"
- Park Güell, Barcelona: lat="41.4145" lng="2.1527"
- Big Ben, London: lat="51.5007" lng="-0.1246"
- Times Square, New York: lat="40.7580" lng="-73.9855"
- Colosseum, Rome: lat="41.8902" lng="12.4922"

For unknown locations, use lat="PENDING" lng="PENDING".

Create rich, detailed itineraries with:
- Specific attractions and landmarks (with geo-marks)
- Recommended restaurants and cafes
- Travel tips and suggestions
- Time estimates for activities
- Transportation recommendations

Be conversational and helpful in your responses.`,
      });

      // Consume the stream
      result.consumeStream();

      // Merge the result stream with the data stream
      dataStream.merge(result.toUIMessageStream());
    },
    generateId: () => Math.random().toString(36).substring(7),
    onFinish: async ({ messages }) => {
      // Log for debugging
      console.log('Stream finished, messages count:', messages.length);

      // Check if the last message contains HTML with geo-marks that need enrichment
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.content?.includes('data-lat="PENDING"')) {
        console.log('Note: Message contains locations that could be enriched with coordinates');
        // Future: Trigger enrichment pipeline here when SDK supports it
      }
    },
    onError: (error) => {
      console.error('Streaming error:', error);
      return 'An error occurred while processing your request.';
    },
  });

  // Create enrichment transform stream
  const enrichmentTransform = new TransformStream({
    async transform(chunk: any, controller) {
      // Only process text-delta chunks that might contain HTML
      if (chunk.type === 'text-delta' && chunk.delta) {
        const enrichedText = await enrichmentPipeline.processChunk(chunk.delta);
        controller.enqueue({
          ...chunk,
          delta: enrichedText
        });
      } else {
        // Pass through non-text chunks unchanged
        controller.enqueue(chunk);
      }
    },
    async flush(controller) {
      // Process any remaining buffered content
      const remaining = await enrichmentPipeline.flush();
      if (remaining) {
        controller.enqueue({
          type: 'text-delta',
          delta: remaining
        });
      }
    }
  });

  // Return response with enrichment and SSE format
  return new Response(
    stream
      .pipeThrough(enrichmentTransform)
      .pipeThrough(new JsonToSseTransformStream()),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}