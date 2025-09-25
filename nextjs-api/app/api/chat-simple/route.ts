import { mistral } from '@ai-sdk/mistral';
import { convertToModelMessages, streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Convert UI messages to model messages
  const modelMessages = convertToModelMessages(messages);

  const result = streamText({
    model: mistral('mistral-small-latest'),
    messages: modelMessages,
    system: 'You are a helpful travel planning assistant. Provide concise, friendly responses to help users plan their trips.',
  });

  // Return response with CORS headers for cross-origin access
  return result.toUIMessageStreamResponse({
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}