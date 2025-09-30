import { mistral } from '@ai-sdk/mistral';
import { convertToModelMessages, createUIMessageStream, streamText } from 'ai';
import { NextRequest } from 'next/server';


export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages = body.messages || [];

  // Validate messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Convert UIMessages to ModelMessages format
  const modelMessages = convertToModelMessages(messages);

  // Get the last user message to check for URLs
  const lastUserMessage = messages[messages.length - 1];
  let extractedContent = null;
  let urlDetected = false;

  if (lastUserMessage && lastUserMessage.role === 'user') {
    const messageText = lastUserMessage.content;

    // Check for URLs in the message
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = messageText.match(urlRegex);

    if (urls && urls.length > 0) {
      urlDetected = true;
      console.log('[Chat with URL] URLs detected:', urls);

      // Extract content from the first URL using Firecrawl
      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (apiKey) {


        if (extractedContent) {
          console.log(`[Chat with URL] Successfully extracted content from ${urls[0]}`);
          console.log(`[Chat with URL] Found ${extractedContent.locations.length} locations`);
        }
      } else {
        console.error('[Chat with URL] FIRECRAWL_API_KEY not configured');
      }
    }
  }

  // Create UI message stream
  const stream = createUIMessageStream({
    execute: ({ writer: dataStream }) => {
      const result = streamText({
        model: mistral('mistral-small-latest'),
        messages: modelMessages,
        system: `You are a helpful travel planning assistant with a focus on creating interactive, location-aware itineraries.

${extractedContent ? `
URL EXTRACTION: The user shared a URL and I've extracted travel content from it.
Your task is to:
1. Acknowledge the shared link naturally
2. Summarize the key travel information
3. Present locations in a way that can be geo-marked for map display
4. Format locations with square brackets [Location Name] so they can be parsed and shown on maps
5. Create a conversational, engaging response that incorporates the extracted content

EXTRACTED CONTENT:
${formatForAI(extractedContent)}

IMPORTANT: When mentioning locations from the extracted content, always format them as [Location Name]
For example: "Start your day at [Sagrada Familia], then head to [Park Güell] for stunning views..."
` : ''}

When users ask about trip planning or itineraries:
1. FIRST respond conversationally with regular text
2. When mentioning specific locations, format them as [Location Name] for geo-marking
3. Create natural, flowing responses that incorporate travel details

Location Formatting Rules:
- Always use square brackets for location names: [Sagrada Familia]
- Keep location names concise and recognizable
- Include major landmarks, attractions, restaurants, and hotels
- These will be automatically detected and displayed on the map

${urlDetected && !extractedContent ?
  'Note: A URL was detected but content extraction failed. Acknowledge this and offer to help with manual planning.' : ''}

Remember: Create engaging, conversational responses while ensuring all location names are properly formatted for map display.`,
        temperature: 0.7,
        onStart: () => {
          console.log('[Chat with URL] Starting AI stream');
        },
        onChunk: ({ chunk }) => {
          if (chunk.type === 'text-delta') {
            dataStream.write(chunk.textDelta);
          }
        },
        onFinish: ({ text }) => {
          console.log('[Chat with URL] AI response complete');
          dataStream.close();
        },
      });

      return result.toDataStreamResponse();
    },
  });

  return stream;
}

// OPTIONS handler for CORS
export async function OPTIONS(req: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}