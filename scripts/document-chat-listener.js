#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Configuration
const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMTU2OTAsImV4cCI6MjA3Njc5MTY5MH0.GAMDmtZOvoHzJ2sesN7NC24Q8FYVuEHZlsvYvsQQEBU';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0';

// Create two Supabase clients:
// 1. Service key for realtime subscriptions (bypasses RLS, required for Node.js)
// 2. Service key for admin operations (updating documents, inserting messages)
const supabaseRealtime = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
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

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🚀 Document Chat Listener started');
console.log('📡 Connecting to Supabase:', SUPABASE_URL);
console.log('⏳ Listening for new chat messages...\n');

// Track processing to avoid duplicates
const processingMessages = new Set();

// Subscribe to new messages in document_chats table (using anon key client)
const subscription = supabaseRealtime
  .channel('document-chats')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'document_chats'
    },
    async (payload) => {
      const message = payload.new;

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

async function processInitialPrompt(message) {
  const { document_id, user_id, content } = message;

  try {
    console.log(`\n🤖 Generating document for prompt: "${content}"`);

    // Call the edge function to generate document
    const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-document-stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: content,
        useTypingMode: false, // Generate complete document at once
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate document: ${response.statusText}`);
    }

    // Read the streamed response
    let fullContent = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });

      // Parse the SSE format
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              fullContent += parsed.content;
            }
          } catch (e) {
            // Ignore parsing errors for incomplete chunks
          }
        }
      }
    }

    console.log(`   📄 Document generated (${fullContent.length} characters)`);

    // Parse the generated document content
    let documentData;
    try {
      documentData = JSON.parse(fullContent);
    } catch (e) {
      console.error('   ⚠️ Error parsing generated document, using as plain text');
      documentData = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: fullContent }
            ]
          }
        ]
      };
    }

    // Update the document with generated content
    console.log(`   💾 Updating document ${document_id}...`);
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        document: documentData,
        updated_at: new Date().toISOString()
      })
      .eq('id', document_id);

    if (updateError) {
      throw updateError;
    }

    // Insert assistant response into chat
    console.log(`   💬 Adding assistant response to chat...`);
    const { error: chatError } = await supabaseAdmin
      .from('document_chats')
      .insert({
        document_id,
        user_id,
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

  } catch (error) {
    console.error(`   ❌ Error processing initial prompt:`, error);

    // Insert error message into chat
    try {
      await supabaseAdmin
        .from('document_chats')
        .insert({
          document_id,
          user_id,
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

async function processRegularMessage(message) {
  const { document_id, user_id, content } = message;

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
    const messages = [
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

    // Call AI API (using Mistral via Supabase Edge Function or direct API)
    const aiResponse = await generateAIResponse(messages);

    console.log(`   💬 AI Response: ${aiResponse.substring(0, 100)}...`);

    // Insert assistant response into chat
    const { error: chatError } = await supabaseAdmin
      .from('document_chats')
      .insert({
        document_id,
        user_id, // Use same user_id so it appears as their conversation
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

  } catch (error) {
    console.error(`   ❌ Error processing message:`, error);

    // Insert error message into chat
    try {
      await supabaseAdmin
        .from('document_chats')
        .insert({
          document_id,
          user_id,
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

async function generateAIResponse(messages) {
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

  const data = await response.json();
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