import { EnrichmentPipeline } from '@/lib/enrichment-pipeline';
import { FirecrawlClient, formatForAI } from '@/lib/firecrawl/firecrawl-client';
import { mistral } from '@ai-sdk/mistral';
import { convertToModelMessages, createUIMessageStream, JsonToSseTransformStream, smoothStream, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Convert UIMessages to ModelMessages format
  const modelMessages = convertToModelMessages(messages);

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
<span class="geo-mark" data-geo="true" data-lat="PENDING" data-lng="PENDING" data-place-name="Location Name, City" title="📍 Location Name">Location Name</span>

CRITICAL: You MUST ALWAYS use data-lat="PENDING" data-lng="PENDING" for ALL locations.
Never provide actual coordinate values - the system will automatically fetch accurate coordinates from Google Places API.
LLM-generated coordinates are often inaccurate and will be replaced anyway.

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