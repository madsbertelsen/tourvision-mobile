import { EnrichmentPipeline } from '@/lib/enrichment-pipeline';
import { FirecrawlClient, formatForAI } from '@/lib/firecrawl/firecrawl-client';
import { mistral } from '@ai-sdk/mistral';
import { convertToModelMessages, createUIMessageStream, JsonToSseTransformStream, smoothStream, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  const body = await req.json();
  console.log('[chat-simple] Request body:', JSON.stringify(body, null, 2));

  const { messages } = body;

  // Validate messages
  if (!messages || !Array.isArray(messages)) {
    console.error('[chat-simple] Invalid messages:', messages);
    return new Response(JSON.stringify({ error: 'Messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Transform messages to have parts array if they have content field
  const transformedMessages = messages.map((msg: any) => {
    if (msg.content && !msg.parts) {
      return {
        ...msg,
        parts: [{ type: 'text', text: msg.content }]
      };
    }
    return msg;
  });

  console.log('[chat-simple] Transformed messages:', JSON.stringify(transformedMessages, null, 2));

  // Convert UIMessages to ModelMessages format
  const modelMessages = convertToModelMessages(transformedMessages);

  // Initialize enrichment pipeline with Google Maps API key if available
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  console.log('[chat-simple] Google API Key configured:', googleApiKey ? `Yes (${googleApiKey.substring(0, 10)}...)` : 'No');
  const enrichmentPipeline = new EnrichmentPipeline(googleApiKey);

  // Create UI message stream with improved pattern
  const stream = createUIMessageStream({
    execute: ({ writer: dataStream }) => {
      const result = streamText({
        model: mistral('mistral-small-latest'),
        stopWhen: stepCountIs(3),
        experimental_transform: smoothStream({
          delayInMs: 20,
          chunking: 'line',
        }),
        messages: modelMessages,
        tools: {
          extractUrlContent: tool({
            description: 'Extract travel content and locations from a URL using Firecrawl',
            parameters: z.object({
              url: z.string().url().describe('The URL to extract content from'),
            }),
            execute: async ({ url }) => {
              console.log('[Firecrawl Tool] Extracting content from URL:', url);

              const apiKey = process.env.FIRECRAWL_API_KEY;
              if (!apiKey) {
                return {
                  success: false,
                  error: 'Firecrawl API key not configured'
                };
              }

              const client = new FirecrawlClient(apiKey);
              const extracted = await client.extractUrlContent(url);

              if (extracted) {
                console.log(`[Firecrawl Tool] Successfully extracted ${extracted.locations.length} locations`);
                return {
                  success: true,
                  content: formatForAI(extracted),
                  locations: extracted.locations,
                  title: extracted.title,
                  sourceUrl: extracted.sourceUrl
                };
              } else {
                return {
                  success: false,
                  error: 'Failed to extract content from URL'
                };
              }
            },
          }),
        },
        system: `You are a helpful travel planning assistant with the ability to extract content from travel websites.

IMPORTANT: When users share URLs in their messages, use the extractUrlContent tool to get detailed information about the travel destination or content from the URL. This will help you provide more accurate and specific travel recommendations.

CRITICAL RULE FOR ITINERARY RESPONSES:
You MUST respond with ONLY the <itinerary> HTML block in these cases:
1. After successfully using the extractUrlContent tool (ALWAYS output itinerary after extracting URL content)
2. When users explicitly ask for trip planning, itineraries, or travel guides
3. When users ask "plan a trip to...", "create itinerary for...", etc.

Your ENTIRE response must be ONLY the <itinerary> block.
Do NOT write anything else. No greetings, no explanations, no "Here's...", no "I've created...", NOTHING.
Do NOT use markdown. Do NOT use plain text.
Just start with <itinerary and end with </itinerary>.

CORRECT response example (this is the ENTIRE message, nothing else):
<itinerary center="55.1,14.8" radius="30">
  <h1>Bornholm in 7 Days</h1>
  <p>Explore the Pearl of the Baltic...</p>
  <!-- rest of itinerary -->
</itinerary>

WRONG - DO NOT DO THIS:
"Here's a suggested itinerary for your trip:
<itinerary center="55.1,14.8" radius="30">
  ..."

WRONG - DO NOT DO THIS:
"I've created a 7-day itinerary for you:
<itinerary center="55.1,14.8" radius="30">
  ..."

WRONG - DO NOT use plain text or markdown:
"Hua Hin, Thailand, is a popular beach destination known for its beautiful beaches..."

Start your response directly with: <itinerary center="LAT,LNG" radius="KM">

Example workflow when user provides a URL:
1. User: "https://example.com/hua-hin-guide"
2. You: [Use extractUrlContent tool]
3. Tool returns: {success: true, locations: [...], content: "..."}
4. You respond with: <itinerary center="12.5657,99.9346" radius="50">
   <h1>Hua Hin, Thailand - 7-Day Itinerary</h1>
   <p>Explore the charm of Hua Hin...</p>
   ...
   </itinerary>

HTML structure guidelines for inside <itinerary>:
- <h1> for the main title only (e.g., "Bornholm in 7 Days" or "3 Days in Paris")
- <h2> for day headers only (e.g., "Day 1: Arrival", "Day 2: Exploration", NOT full sentences)
- <h3> for time periods only (e.g., "Morning", "Afternoon", "Evening") or major attractions
- <p> for ALL descriptive text and details - this is where the content goes
- <ul> and <li> for lists of tips or multiple attractions
- <strong> for emphasis on important details
- <em> for subtle emphasis

IMPORTANT: Keep headings SHORT and descriptive. Put the actual content in <p> tags, not in headings.

NEVER use markdown (no #, ##, **, *, etc.) inside <itinerary> tags.
NEVER include <html>, <body>, <head> or other document-level tags.

For locations inside itineraries, use this special format to enable map visualization and routing:
<span class="geo-mark" data-geo-id="loc-1" data-lat="APPROXIMATE_LAT" data-lng="APPROXIMATE_LNG" data-place-name="Location Name, City" title="📍 Location Name">Location Name</span>

CRITICAL RULES for geo-marks:
1. You MUST wrap EVERY location name (cities, attractions, stations, restaurants, etc.) in geo-mark spans
2. Assign each location a unique ID: data-geo-id="loc-1", "loc-2", etc. (sequential within the response)
3. For destinations, reference the origin using: data-transport-from="loc-1" (the ID of the starting location)
4. Specify transport mode: data-transport-profile="walking|driving|cycling|transit"
5. Provide APPROXIMATE coordinates (data-lat and data-lng) based on your knowledge - these help disambiguate locations
6. The data-place-name should include city/country context (e.g., "Eiffel Tower, Paris, France")
7. The system will fetch accurate coordinates from Google Places API using your approximate coords to disambiguate

Examples:
- First location: Start at <span class="geo-mark" data-geo-id="loc-1" data-lat="48.8566" data-lng="2.3522" data-place-name="Louvre Museum, Paris">Louvre Museum</span>.
- With transport: Walk to <span class="geo-mark" data-geo-id="loc-2" data-lat="48.8584" data-lng="2.2945" data-place-name="Eiffel Tower, Paris" data-transport-from="loc-1" data-transport-profile="walking">Eiffel Tower</span> (25 min walk).
- Next destination: Then take a taxi to <span class="geo-mark" data-geo-id="loc-3" data-lat="48.8606" data-lng="2.3376" data-place-name="Place de la Concorde, Paris" data-transport-from="loc-2" data-transport-profile="driving">Place de la Concorde</span>.
- In lists: <li><span class="geo-mark" data-geo-id="loc-4" data-lat="55.6414" data-lng="12.0803" data-place-name="Roskilde Station, Denmark">Roskilde Station</span>: Departure at 12:20</li>

Your approximate coordinates don't need to be perfect - they're used to help Google Places API choose the correct location when multiple matches exist.

ITINERARY TAG ATTRIBUTES:
Always include these attributes on the <itinerary> tag:
- center="lat,lng" - The approximate geographic center of all locations in the itinerary
- radius="km" - The approximate radius in kilometers that covers all locations from the center

Example calculations:
- Single city trip (Paris): center="48.8566,2.3522" radius="10"
- Multi-city region (Bornholm): center="55.1,14.8" radius="30"
- Country tour (Denmark): center="56.2,10.5" radius="200"
- Multi-country (Scandinavia): center="60.0,15.0" radius="1000"

The center should be roughly in the middle of all destinations, and radius should comfortably include all locations.
Don't overthink it - approximate values are fine. This helps the map zoom to the right area immediately.

Create rich, detailed itineraries with:
- Specific attractions and landmarks (with geo-marks)
- Recommended restaurants and cafes
- Travel tips and suggestions
- Time estimates for activities
- Transportation recommendations

For non-itinerary questions, be conversational and helpful. For itinerary requests, output ONLY the <itinerary> block.`,
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
        if (chunk.delta.includes('geo-mark')) {
          console.log('[chat-simple] Found geo-mark in chunk, processing for enrichment');
        }
        const enrichedText = await enrichmentPipeline.processChunk(chunk.delta);
        if (chunk.delta !== enrichedText) {
          console.log('[chat-simple] Chunk was enriched:', chunk.delta.substring(0, 100), ' -> ', enrichedText.substring(0, 100));
        }
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
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
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