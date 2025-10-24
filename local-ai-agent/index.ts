import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import WebSocket from 'ws';
import { htmlToProseMirrorJSON, appendProseMirrorNodesToYjs } from './html-to-yjs.js';
import crypto from 'crypto';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const TIPTAP_APP_ID = process.env.TIPTAP_APP_ID || 'yko82w79';
const TIPTAP_APP_SECRET = process.env.TIPTAP_APP_SECRET!;
const POLL_INTERVAL = 5000; // Poll every 5 seconds

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

console.log('[AI Agent] Starting TourVision AI Agent...');
console.log('[AI Agent] Supabase URL:', SUPABASE_URL);
console.log('[AI Agent] Tiptap App ID:', TIPTAP_APP_ID);

/**
 * Generate JWT token for Tiptap Cloud authentication
 */
function generateTiptapJWT(documentName: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    nbf: now,  // Not before timestamp
    exp: now + (24 * 60 * 60), // 24 hours from now
    iss: 'https://cloud.tiptap.dev',  // Issuer
    aud: TIPTAP_APP_ID,  // Audience (App ID)

    // Optional but recommended fields
    sub: 'ai-agent', // Subject (user identifier)
    allowedDocumentNames: [documentName],
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', TIPTAP_APP_SECRET)
    .update(message)
    .digest('base64url');

  return `${message}.${signature}`;
}

/**
 * Process a trip generation request
 */
async function processTripGeneration(tripId: string, prompt: string) {
  console.log(`\n[AI Agent] Processing trip generation for: ${tripId}`);
  console.log(`[AI Agent] Prompt: ${prompt.substring(0, 100)}...`);

  try {
    // Generate JWT token for Tiptap Cloud
    const tiptapToken = generateTiptapJWT(tripId);
    // Correct URL format: https://APP_ID.collab.tiptap.cloud (HocuspocusProvider handles WebSocket upgrade)
    const tiptapUrl = `https://${TIPTAP_APP_ID}.collab.tiptap.cloud`;

    console.log('[AI Agent] Connecting to Tiptap Cloud:', tiptapUrl);

    // Create Y.Doc and Hocuspocus provider
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: tiptapUrl,
      name: tripId,
      document: ydoc,
      token: tiptapToken,
      WebSocketPolyfill: WebSocket as any,
      onConnect: () => console.log('[AI Agent] Connected to Tiptap Cloud'),
      onDisconnect: () => console.log('[AI Agent] Disconnected from Tiptap Cloud'),
      onSynced: () => console.log('[AI Agent] Document synced'),
      onStatus: ({ status }) => console.log('[AI Agent] Status:', status),
    });

    // Wait for provider to sync
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tiptap Cloud sync timeout'));
      }, 30000);

      provider.on('synced', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    console.log('[AI Agent] Starting AI generation...');

    // Get the Y.js XML fragment
    const xmlFragment = ydoc.getXmlFragment('prosemirror');

    // Stream from OpenAI
    const stream = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant helping to write a travel itinerary document.
Return your response as clean, semantic HTML with the following structure:

<h1>Trip Title</h1>
<p>Brief introduction</p>

<h2>Day 1: Arrival</h2>
<p>Description of activities</p>
<ul>
  <li>Morning: Activity</li>
  <li>Afternoon: Activity</li>
  <li>Evening: Activity</li>
</ul>

Continue this pattern for each day. Use:
- <h1> for the main trip title
- <h2> for day headers
- <p> for descriptions
- <ul> and <li> for activity lists
- <strong> for emphasis
- <em> for subtle emphasis

Do not include any code blocks, markdown formatting, or explanations.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      stream: true,
    });

    let htmlBuffer = '';
    let processedLength = 0;

    // Process stream chunks
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        htmlBuffer += content;

        // Process complete HTML tags as they come in
        const lastTagEnd = htmlBuffer.lastIndexOf('>');
        if (lastTagEnd > processedLength) {
          const completeHtml = htmlBuffer.substring(processedLength, lastTagEnd + 1);

          try {
            // Convert HTML to ProseMirror JSON
            const prosemirrorJSON = htmlToProseMirrorJSON(completeHtml);

            if (prosemirrorJSON && prosemirrorJSON.content) {
              // Append to Y.js document
              ydoc.transact(() => {
                appendProseMirrorNodesToYjs(xmlFragment, prosemirrorJSON.content);
              });

              console.log('[AI Agent] Streamed chunk to document');
            }

            processedLength = lastTagEnd + 1;
          } catch (error) {
            console.error('[AI Agent] Error processing HTML chunk:', error);
          }
        }
      }
    }

    // Process any remaining HTML
    if (htmlBuffer.length > processedLength) {
      const remainingHtml = htmlBuffer.substring(processedLength);
      try {
        const prosemirrorJSON = htmlToProseMirrorJSON(remainingHtml);
        if (prosemirrorJSON && prosemirrorJSON.content) {
          ydoc.transact(() => {
            appendProseMirrorNodesToYjs(xmlFragment, prosemirrorJSON.content);
          });
        }
      } catch (error) {
        console.error('[AI Agent] Error processing final HTML:', error);
      }
    }

    console.log('[AI Agent] Generation complete, cleaning up...');

    // Wait a bit for final sync
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Disconnect provider
    provider.destroy();

    console.log('[AI Agent] Trip generation completed successfully');

  } catch (error) {
    console.error('[AI Agent] Error processing trip generation:', error);
    throw error;
  }
}

/**
 * Poll Supabase for pending trip generation requests
 */
async function pollForRequests() {
  try {
    // Query for trips that need AI generation
    // This assumes you have a column like `ai_generation_requested` or similar
    const { data: trips, error } = await supabase
      .from('trips')
      .select('id, title, description')
      .eq('ai_generation_requested', true)
      .limit(1);

    if (error) {
      console.error('[AI Agent] Error querying trips:', error);
      return;
    }

    if (trips && trips.length > 0) {
      const trip = trips[0];
      console.log(`[AI Agent] Found trip requesting generation: ${trip.id}`);

      // Mark as processing
      await supabase
        .from('trips')
        .update({ ai_generation_requested: false, ai_generation_in_progress: true })
        .eq('id', trip.id);

      // Process the generation
      const prompt = trip.description || `Create a trip itinerary for: ${trip.title}`;
      await processTripGeneration(trip.id, prompt);

      // Mark as complete
      await supabase
        .from('trips')
        .update({ ai_generation_in_progress: false })
        .eq('id', trip.id);
    }

  } catch (error) {
    console.error('[AI Agent] Error in poll cycle:', error);
  }
}

/**
 * Main loop
 */
async function main() {
  console.log('[AI Agent] Starting polling loop...');
  console.log(`[AI Agent] Polling every ${POLL_INTERVAL}ms`);

  // Initial poll
  await pollForRequests();

  // Set up interval
  setInterval(async () => {
    await pollForRequests();
  }, POLL_INTERVAL);
}

// Start the agent
main().catch(error => {
  console.error('[AI Agent] Fatal error:', error);
  process.exit(1);
});
