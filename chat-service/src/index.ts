#!/usr/bin/env node

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables from root .env.local
config({ path: '../.env.local' });

// Configuration
const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMTU2OTAsImV4cCI6MjA3Njc5MTY5MH0.GAMDmtZOvoHzJ2sesN7NC24Q8FYVuEHZlsvYvsQQEBU';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0';

// AI Assistant user ID (created by scripts/create-ai-user.js)
const AI_USER_ID = '9e33f156-c21d-4234-939f-bc3455e2e5c2';

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
  document?: any;
}

interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MistralResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
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

    // For now, generate a simple response (Edge Function removed)
    // TODO: Implement direct AI generation logic here
    const simpleResponse = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: `Document generated from prompt: ${content}` }
          ]
        }
      ]
    };

    // Update the document with generated content
    console.log(`   💾 Updating document ${document_id}...`);
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        document: simpleResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', document_id);

    if (updateError) {
      throw updateError;
    }

    // Insert assistant response into chat (using AI user ID)
    console.log(`   💬 Adding assistant response to chat...`);
    const { error: chatError } = await supabaseAdmin
      .from('document_chats')
      .insert({
        document_id,
        user_id: AI_USER_ID,
        role: 'assistant',
        content: 'I\'ve generated your travel document based on your prompt. The document has been updated with the itinerary.',
        metadata: {
          source: 'document_chat_listener',
          document_generated: true,
        }
      });

    if (chatError) {
      console.error('   ⚠️ Error inserting assistant message:', chatError);
    }

    console.log(`   ✅ Document generation complete!`);

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
          content: `I encountered an error while generating your document: ${error.message}. Please try again.`,
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

    // Get current document content for context
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('document, title')
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

The current document contains: ${document?.document ? 'travel itinerary content' : 'no content yet'}.

Your role is to:
- Answer questions about their trip
- Provide helpful suggestions and recommendations
- Help them refine their travel plans
- Be concise and friendly

Keep responses focused and practical.`
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

    // Call AI API (using Mistral via direct API)
    const aiResponse = await generateAIResponse(messages);

    console.log(`   💬 AI Response: ${aiResponse.substring(0, 100)}...`);

    // Insert assistant response into chat (using AI user ID)
    const { error: chatError } = await supabaseAdmin
      .from('document_chats')
      .insert({
        document_id,
        user_id: AI_USER_ID,
        role: 'assistant',
        content: aiResponse,
        metadata: {
          source: 'document_chat_listener',
          model: 'mistral-small-latest'
        }
      });

    if (chatError) {
      console.error('   ⚠️ Error inserting AI response:', chatError);
    } else {
      console.log(`   ✅ AI response added to chat`);
    }

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

async function generateAIResponse(messages: AIMessage[]): Promise<string> {
  // Using Mistral API directly
  const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY not configured');
  }

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mistral API error: ${error}`);
  }

  const data: MistralResponse = await response.json();
  return data.choices[0].message.content;
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
