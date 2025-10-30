#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0';

// Test user ID (you can replace this with any valid user ID from your database)
const TEST_USER_ID = 'b39d1e8e-2b0a-45dd-8b9e-32cf211f3639';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testAIResponse() {
  console.log('🧪 Testing AI Response with dedicated AI user...\n');

  try {
    // 1. Get or create a test document
    console.log('📝 Finding or creating test document...');
    let { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('id, title')
      .eq('created_by', TEST_USER_ID)
      .limit(1);

    if (docsError) throw docsError;

    let documentId;
    if (documents && documents.length > 0) {
      documentId = documents[0].id;
      console.log(`   ✅ Using existing document: ${documents[0].title} (${documentId})`);
    } else {
      // Create a test document
      const { data: newDoc, error: createError } = await supabase
        .from('documents')
        .insert({
          title: 'AI Test Document',
          created_by: TEST_USER_ID,
          document: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Test document for AI responses' }]
              }
            ]
          }
        })
        .select()
        .single();

      if (createError) throw createError;
      documentId = newDoc.id;
      console.log(`   ✅ Created new document: ${documentId}`);
    }

    // 2. Send a test message
    console.log('\n💬 Sending test message...');
    const testMessage = 'Hello AI! Can you tell me about Paris?';

    const { data: message, error: messageError } = await supabase
      .from('document_chats')
      .insert({
        document_id: documentId,
        user_id: TEST_USER_ID,
        role: 'user',
        content: testMessage
      })
      .select()
      .single();

    if (messageError) throw messageError;
    console.log(`   ✅ Message sent: "${testMessage}"`);
    console.log(`   Message ID: ${message.id}`);

    // 3. Wait for AI response
    console.log('\n⏳ Waiting for AI response (10 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 4. Check for AI response
    console.log('\n🔍 Checking for AI response...');
    const { data: responses, error: responseError } = await supabase
      .from('document_chats')
      .select('id, user_id, role, content, created_at, metadata')
      .eq('document_id', documentId)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1);

    if (responseError) throw responseError;

    if (responses && responses.length > 0) {
      const response = responses[0];
      console.log('\n✅ AI Response received!');
      console.log(`   User ID: ${response.user_id}`);
      console.log(`   Expected AI User ID: 9e33f156-c21d-4234-939f-bc3455e2e5c2`);
      console.log(`   Match: ${response.user_id === '9e33f156-c21d-4234-939f-bc3455e2e5c2' ? '✅ YES' : '❌ NO'}`);
      console.log(`   Content: ${response.content.substring(0, 100)}...`);
      console.log(`   Metadata:`, JSON.stringify(response.metadata, null, 2));
    } else {
      console.log('\n❌ No AI response received yet');
      console.log('   Possible reasons:');
      console.log('   - Listener not running (run: node scripts/document-chat-listener.js)');
      console.log('   - MISTRAL_API_KEY not configured in .env.local');
      console.log('   - Network/connection issues');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

testAIResponse().catch(console.error);
