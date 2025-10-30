const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMTU2OTAsImV4cCI6MjA3Njc5MTY5MH0.GAMDmtZOvoHzJ2sesN7NC24Q8FYVuEHZlsvYvsQQEBU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  console.log('🧪 Testing Ollama Chat Service\n');

  // Create test document
  console.log('1. Creating test document...');
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({ title: 'Ollama Test', document: { type: 'doc', content: [] } })
    .select()
    .single();

  if (docError) throw docError;
  console.log('✅ Document created:', doc.id, '\n');

  // Send test message
  console.log('2. Sending test message...');
  const { data: msg, error: msgError } = await supabase
    .from('document_chats')
    .insert({
      document_id: doc.id,
      user_id: doc.user_id,
      role: 'user',
      content: 'Tell me one fun fact about Paris in 10 words or less.',
      metadata: { test: true }
    })
    .select()
    .single();

  if (msgError) throw msgError;
  console.log('✅ Message sent:', msg.id, '\n');

  // Wait for AI response
  console.log('3. Waiting for Ollama response (max 60s)...');
  let attempts = 0;
  let response = null;

  while (attempts < 30 && !response) {
    await new Promise(r => setTimeout(r, 2000));
    
    const { data } = await supabase
      .from('document_chats')
      .select('*')
      .eq('document_id', doc.id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      response = data[0];
      break;
    }
    
    attempts++;
    process.stdout.write('.');
  }

  console.log('\n');

  if (response) {
    console.log('✅ AI RESPONSE RECEIVED!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Content:', response.content);
    console.log('Model:', response.metadata?.model || 'unknown');
    console.log('Provider:', response.metadata?.provider || 'unknown');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎉 TEST PASSED - Ollama integration working!');
  } else {
    console.log('❌ No response after 60 seconds');
    console.log('Check chat-service logs for errors');
  }

  // Cleanup
  console.log('\n4. Cleaning up...');
  await supabase.from('document_chats').delete().eq('document_id', doc.id);
  await supabase.from('documents').delete().eq('id', doc.id);
  console.log('✅ Done');
}

test().catch(console.error);
