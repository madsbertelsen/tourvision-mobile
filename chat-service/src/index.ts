#!/usr/bin/env node

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { streamText } from 'ai';
import { config } from 'dotenv';
import { ollama } from 'ollama-ai-provider-v2';
import { openai } from '@ai-sdk/openai';

// Load environment variables from .env.local
config();

// Configuration
const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0';

// AI Assistant user ID (created by scripts/create-ai-user.js)
const AI_USER_ID = '9e33f156-c21d-4234-939f-bc3455e2e5c2';

// AI Provider configuration
const AI_PROVIDER = process.env.AI_PROVIDER || 'ollama'; // 'ollama' or 'vercel-gateway'

// Ollama configuration (direct connection)
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

// Vercel AI Gateway configuration (OpenAI-compatible endpoint)
const VERCEL_AI_GATEWAY_URL = process.env.VERCEL_AI_GATEWAY_URL; // e.g., https://gateway.vercel.ai/v1
const VERCEL_AI_API_KEY = process.env.VERCEL_AI_API_KEY;
const VERCEL_GATEWAY_MODEL = process.env.VERCEL_GATEWAY_MODEL || 'gpt-4o-mini'; // Model routed through gateway

// Get the appropriate model based on provider
function getModel() {
  if (AI_PROVIDER === 'vercel-gateway' && VERCEL_AI_GATEWAY_URL && VERCEL_AI_API_KEY) {
    return openai(VERCEL_GATEWAY_MODEL, {
      baseURL: VERCEL_AI_GATEWAY_URL,
      apiKey: VERCEL_AI_API_KEY,
    });
  }
  return ollama(OLLAMA_MODEL);
}

// Types
interface ChatMessage {
  id: string;
  document_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    initial_prompt?: boolean;
    source?: string;
    document_generated?: boolean;
    error?: boolean;
    error_message?: string;
    model?: string;
  };
  created_at: string;
}

interface Document {
  id: string;
  title: string;
}

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Create two Supabase clients:
// 1. Service key for realtime subscriptions (bypasses RLS, required for Node.js)
// 2. Service key for admin operations (updating documents, inserting messages)
const supabaseRealtime: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🚀 Document Chat Listener started');
console.log('📡 Connecting to Supabase:', SUPABASE_URL);
console.log('🤖 AI Provider:', AI_PROVIDER);
if (AI_PROVIDER === 'vercel-gateway') {
  console.log('🌐 Gateway URL:', VERCEL_AI_GATEWAY_URL);
  console.log('🧠 Model:', VERCEL_GATEWAY_MODEL);
} else {
  console.log('🤖 Ollama URL:', OLLAMA_BASE_URL);
  console.log('🧠 Model:', OLLAMA_MODEL);
}
console.log('⏳ Listening for new chat messages...\n');

// Track processing to avoid duplicates
const processingMessages = new Set<string>();

// Subscribe to new messages in document_chats table
const subscription: RealtimeChannel = supabaseRealtime
  .channel('document-chats')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'document_chats'
    },
    async (payload) => {
      const message = payload.new as ChatMessage;

      // Only process user messages
      if (message.role !== 'user') {
        return;
      }

      // Avoid processing the same message multiple times
      if (processingMessages.has(message.id)) {
        return;
      }

      processingMessages.add(message.id);

      console.log(`\n📨 New message received:`);
      console.log(`   Document: ${message.document_id}`);
      console.log(`   User: ${message.user_id}`);
      console.log(`   Content: "${message.content}"`);
      console.log(`   Metadata:`, message.metadata);

      // Check if this is an initial prompt
      if (message.metadata?.initial_prompt === true) {
        console.log(`   ✨ This is an initial prompt - generating document...`);
        await processInitialPrompt(message);
      } else {
        console.log(`   💬 Regular chat message - generating AI response...`);
        await processRegularMessage(message);
      }

      // Remove from processing set after a delay
      setTimeout(() => {
        processingMessages.delete(message.id);
      }, 60000); // 1 minute
    }
  )
  .subscribe((status, error) => {
    console.log(`📡 Subscription status: ${status}`);
    if (error) {
      console.error('❌ Subscription error:', JSON.stringify(error, null, 2));
    }
    if (status === 'SUBSCRIBED') {
      console.log('✅ Successfully subscribed to document_chats table');
    } else if (status === 'CHANNEL_ERROR') {
      console.error('❌ Channel error - retrying...');
      if (error) {
        console.error('Error details:', JSON.stringify(error, null, 2));
      }
    } else if (status === 'TIMED_OUT') {
      console.error('❌ Subscription timed out');
      console.error('This usually means:');
      console.error('  1. Realtime is not enabled on the table');
      console.error('  2. Network/firewall is blocking WebSocket connections');
      console.error('  3. The Supabase URL or API key is incorrect');
    } else if (status === 'CLOSED') {
      console.log('⚠️ Subscription closed');
    }
  });

async function processInitialPrompt(message: ChatMessage): Promise<void> {
  const { document_id, content } = message;

  try {
    console.log(`\n🤖 Generating document for prompt: "${content}"`);

    // For initial prompts, just respond with an acknowledgment
    // Document generation would happen through the Y.js collaboration layer
    // Insert assistant response into chat (using AI user ID)
    console.log(`   💬 Adding assistant response to chat...`);
    const { error: chatError } = await supabaseAdmin
      .from('document_chats')
      .insert({
        document_id,
        user_id: AI_USER_ID,
        role: 'assistant',
        content: 'I\'m ready to help you plan your trip! You can edit the document directly, and I\'ll assist with suggestions and recommendations.',
        metadata: {
          source: 'document_chat_listener',
          document_generated: true,
          model: OLLAMA_MODEL,
          provider: 'ollama'
        }
      });

    if (chatError) {
      console.error('   ⚠️ Error inserting assistant message:', chatError);
    } else {
      console.log(`   ✅ Response sent!`);
    }

  } catch (error: any) {
    console.error(`   ❌ Error processing initial prompt:`, error);

    // Insert error message into chat (using AI user ID)
    try {
      await supabaseAdmin
        .from('document_chats')
        .insert({
          document_id,
          user_id: AI_USER_ID,
          role: 'assistant',
          content: `I encountered an error while processing your prompt: ${error.message}. Please try again.`,
          metadata: {
            source: 'document_chat_listener',
            error: true,
            error_message: error.message
          }
        });
    } catch (insertError) {
      console.error('   ❌ Failed to insert error message:', insertError);
    }
  }
}

async function processRegularMessage(message: ChatMessage): Promise<void> {
  const { document_id, content } = message;

  try {
    console.log(`\n🤖 Generating AI response for: "${content}"`);

    // Get recent chat history for context
    const { data: chatHistory, error: historyError } = await supabaseAdmin
      .from('document_chats')
      .select('role, content')
      .eq('document_id', document_id)
      .order('created_at', { ascending: true })
      .limit(10);

    if (historyError) {
      console.error('   ⚠️ Error fetching chat history:', historyError);
    }

    // Get current document title for context
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('title')
      .eq('id', document_id)
      .single();

    if (docError) {
      console.error('   ⚠️ Error fetching document:', docError);
    }

    // Build conversation context
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: `You are a helpful travel planning assistant. You are helping the user plan their trip "${document?.title || 'Untitled Trip'}".

Your role is to:
- Answer questions about their trip
- Provide helpful suggestions and recommendations
- Help them refine their travel plans
- Be concise and friendly

CRITICAL OUTPUT FORMAT REQUIREMENT:
You MUST format ALL responses as valid ProseMirror HTML. The schema supports these elements:

Block Elements:
- <p>Paragraph text</p> - Standard paragraph
- <h1>, <h2>, <h3>, <h4>, <h5>, <h6> - Headings (level 1-6)
- <blockquote> - Quoted text
- <ul><li>Item</li></ul> - Bullet list with list items
- <ol><li>Item</li></ol> - Numbered list with list items
- <pre><code>Code</code></pre> - Code block
- <hr> - Horizontal rule

Inline Formatting (marks):
- <strong>Bold</strong> or <b>Bold</b> - Bold text
- <em>Italic</em> or <i>Italic</i> - Italic text
- <code>inline code</code> - Inline code
- <a href="url">Link text</a> - Hyperlink
- <br> - Line break

Location References (geo-marks):
When mentioning specific locations, wrap them as:
<span class="geo-mark" data-place-name="Eiffel Tower, Paris, France" data-lat="48.8584" data-lng="2.2945" data-coord-source="llm">Eiffel Tower</span>

Example response:
<p>I'd recommend visiting <span class="geo-mark" data-place-name="Eiffel Tower, Paris, France" data-lat="48.8584" data-lng="2.2945" data-coord-source="llm">Eiffel Tower</span> in the morning.</p>

<h2>Day 1 Itinerary</h2>
<ul>
<li><strong>Morning:</strong> Breakfast at café</li>
<li><strong>Afternoon:</strong> Visit <span class="geo-mark" data-place-name="Louvre Museum, Paris, France" data-lat="48.8606" data-lng="2.3376" data-coord-source="llm">Louvre</span></li>
<li><strong>Evening:</strong> Dinner near hotel</li>
</ul>

<p>Would you like me to add more details?</p>

FORBIDDEN:
- DO NOT use plain text without HTML tags
- DO NOT use markdown syntax
- DO NOT use <think> tags or reasoning tags
- DO NOT skip wrapping text in <p> tags

Keep responses practical and well-structured.`
      }
    ];

    // Add chat history for context
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach(chat => {
        messages.push({
          role: chat.role === 'assistant' ? 'assistant' : 'user',
          content: chat.content
        });
      });
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: content
    });

    // Create placeholder assistant message first (for streaming updates)
    console.log(`   💬 Creating streaming assistant message...`);
    const { data: assistantMessage, error: insertError } = await supabaseAdmin
      .from('document_chats')
      .insert({
        document_id,
        user_id: AI_USER_ID,
        role: 'assistant',
        content: '', // Empty initially, will be updated via streaming
        metadata: {
          source: 'document_chat_listener',
          model: OLLAMA_MODEL,
          provider: 'ollama',
          streaming: true,
          complete: false
        }
      })
      .select()
      .single();

    if (insertError || !assistantMessage) {
      console.error('   ⚠️ Error creating assistant message:', insertError);
      throw new Error('Failed to create assistant message');
    }

    console.log(`   📡 Starting streaming response (message ID: ${assistantMessage.id})...`);

    // Stream AI response and update the message in real-time
    await generateAIResponseStreaming(messages, document_id, assistantMessage.id);

    console.log(`   ✅ Streaming response complete`);


  } catch (error: any) {
    console.error(`   ❌ Error processing message:`, error);

    // Insert error message into chat (using AI user ID)
    try {
      await supabaseAdmin
        .from('document_chats')
        .insert({
          document_id,
          user_id: AI_USER_ID,
          role: 'assistant',
          content: `Sorry, I encountered an error while processing your message. Please try again.`,
          metadata: {
            source: 'document_chat_listener',
            error: true,
            error_message: error.message
          }
        });
    } catch (insertError) {
      console.error('   ❌ Failed to insert error message:', insertError);
    }
  }
}

/**
 * Ensure the response is properly formatted as ProseMirror HTML
 */
function ensureProseMirrorHTML(text: string): string {
  // Remove <think> tags if present
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // If response doesn't start with an HTML tag, wrap it in <p> tags
  if (!text.startsWith('<')) {
    // Split by double newlines to create paragraphs
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    return paragraphs.map(p => `<p>${p.trim()}</p>`).join('\n');
  }

  return text;
}

async function generateAIResponseStreaming(
  messages: AIMessage[],
  _documentId: string,
  assistantMessageId: string
): Promise<string> {
  // Stream using configured AI provider (Ollama or Vercel AI Gateway)
  try {
    const result = streamText({
      model: getModel(),
      messages: messages,
      temperature: 0.7,
    });

    let fullText = '';
    let buffer = '';
    const updateInterval = 100; // Update every 100ms or when buffer has enough text
    let lastUpdateTime = Date.now();

    // Stream chunks and update the database in real-time
    for await (const chunk of result.textStream) {
      buffer += chunk;
      fullText += chunk;
      console.log(chunk);

      const now = Date.now();
      const shouldUpdate = (now - lastUpdateTime) >= updateInterval || buffer.length > 50;

      if (shouldUpdate) {
        // Update the assistant message with accumulated content
        const formattedText = buffer;//ensureProseMirrorHTML(buffer);
        await supabaseAdmin
          .from('document_chats')
          .update({
            content: formattedText,
            metadata: {
              source: 'document_chat_listener',
              model: OLLAMA_MODEL,
              provider: 'ollama',
              streaming: true,
              complete: false
            }
          })
          .eq('id', assistantMessageId);

        lastUpdateTime = now;
        console.log(`   📡 Streamed ${fullText.length} chars...`);
      }
    }

    // Final update with complete response
    const formattedText = ensureProseMirrorHTML(fullText);
    await supabaseAdmin
      .from('document_chats')
      .update({
        content: formattedText,
        metadata: {
          source: 'document_chat_listener',
          model: OLLAMA_MODEL,
          provider: 'ollama',
          streaming: true,
          complete: true
        }
      })
      .eq('id', assistantMessageId);

    console.log(`   ✅ Streaming complete: ${fullText.length} chars total`);
    return formattedText;
  } catch (error: any) {
    console.error('   ⚠️ Ollama streaming error:', error);
    throw new Error(`Ollama error: ${error.message}`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down document chat listener...');
  if (subscription) {
    subscription.unsubscribe();
  }
  process.exit(0);
});

// Keep the process alive
process.stdin.resume();

console.log('\n💡 Press Ctrl+C to stop the listener\n');
